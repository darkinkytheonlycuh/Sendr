import fsp from 'fs/promises';
import { createReadStream, createWriteStream, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { PassThrough, Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { put, list, del, get } from '@vercel/blob';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { DATA_DIR, PENDING_TTL_MS } from './config';
import { HttpError } from './util';

export const blobMode = Boolean(
  process.env.BLOB_READ_WRITE_TOKEN ||
    (process.env.BLOB_STORE_ID &&
      (process.env.VERCEL_ENV === 'production' || process.env.VERCEL_ENV === 'preview'))
);
export const r2Mode = Boolean(
  process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET
);
const r2Bucket = process.env.R2_BUCKET || '';

export let FILES_DIR = path.join(DATA_DIR, 'files');
export let META_DIR = path.join(DATA_DIR, 'meta');
let USERS_DIR = path.join(DATA_DIR, 'users');

let dirsReady = false;

export function ensureDirs() {
  if (blobMode || r2Mode || dirsReady) return;
  try {
    mkdirSync(FILES_DIR, { recursive: true });
    mkdirSync(META_DIR, { recursive: true });
    mkdirSync(USERS_DIR, { recursive: true });
    dirsReady = true;
    return;
  } catch {}
  const fallback = path.join(tmpdir(), 'sendr-data');
  FILES_DIR = path.join(fallback, 'files');
  META_DIR = path.join(fallback, 'meta');
  USERS_DIR = path.join(fallback, 'users');
  mkdirSync(FILES_DIR, { recursive: true });
  mkdirSync(META_DIR, { recursive: true });
  mkdirSync(USERS_DIR, { recursive: true });
  dirsReady = true;
}

export const fileDirOf = (id) => path.join(FILES_DIR, id);
export const chunkFileOf = (id, index) =>
  path.join(fileDirOf(id), `c${String(index).padStart(6, '0')}`);
export const metaFileOf = (id) => path.join(META_DIR, `${id}.json`);

const BLOB_META_PREFIX = 'sendr/meta/';
const BLOB_FILES_PREFIX = 'sendr/files/';

const blobMetaPath = (id) => `${BLOB_META_PREFIX}${id}.json`;
const blobChunkPath = (id, index) =>
  `${BLOB_FILES_PREFIX}${id}/c${String(index).padStart(6, '0')}`;

const metaCache = new Map();
const META_CACHE_TTL = 1000;
const chunkListCache = new Map();
const CHUNK_LIST_TTL = 10000;

let r2Client;

function getR2() {
  if (!r2Client) {
    r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return r2Client;
}

async function r2List(prefix) {
  const out = [];
  let continuationToken;
  do {
    const res = await getR2().send(
      new ListObjectsV2Command({
        Bucket: r2Bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );
    if (!res.Contents) break;
    for (const obj of res.Contents) {
      if (!obj.Key) continue;
      out.push({ key: obj.Key, size: obj.Size || 0 });
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);
  return out;
}

async function r2DeleteKeys(keys) {
  for (let i = 0; i < keys.length; i += 1000) {
    await getR2().send(
      new DeleteObjectsCommand({
        Bucket: r2Bucket,
        Delete: {
          Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })),
          Quiet: true,
        },
      })
    );
  }
}

async function r2ReadText(key) {
  const res = await getR2().send(
    new GetObjectCommand({ Bucket: r2Bucket, Key: key })
  );
  return res.Body.transformToString('utf8');
}

function isR2NotFound(err) {
  const name = (err && err.name) || '';
  if (name === 'NotFound' || name === 'NoSuchKey' || name === 'NoSuchUpload') {
    return true;
  }
  if (err && err.$metadata && err.$metadata.httpStatusCode === 404) return true;
  return /not.?found|nosuchkey/i.test(String((err && err.message) || err));
}

let blobAccess = '';

async function blobPut(pathname, body) {
  if (blobAccess) {
    return put(pathname, body, {
      access: blobAccess,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  }
  let lastErr;
  for (const access of ['private', 'public']) {
    try {
      const res = await put(pathname, body, {
        access,
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      blobAccess = access;
      return res;
    } catch (err) {
      lastErr = err;
      if (!/access/i.test(String((err && err.message) || err))) throw err;
    }
  }
  throw lastErr;
}

let blobReadAccess = '';

async function blobGet(pathname, extra = {}) {
  const attempts = blobReadAccess ? [blobReadAccess] : ['private', 'public'];
  let lastErr;
  for (const access of attempts) {
    try {
      const res = await get(pathname, { ...extra, access, useCache: false });
      blobReadAccess = access;
      blobAccess = blobAccess || access;
      return res;
    } catch (err) {
      lastErr = err;
      const msg = String((err && err.message) || err);
      if (attempts.length === 1 || !/access/i.test(msg)) throw err;
    }
  }
  throw lastErr;
}

function isNotFound(err) {
  return /not.?found/i.test(String((err && err.message) || err));
}

async function webStreamToText(webStream) {
  const nodeStream = Readable.fromWeb(webStream);
  const chunks = [];
  for await (const c of nodeStream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks).toString('utf8');
}

const locks = new Map();

export function locked(id, fn) {
  const prev = locks.get(id) || Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(
    id,
    next.catch(() => {})
  );
  return next;
}

async function listAll(prefix, mapper) {
  const out = [];
  let cursor;
  do {
    const res = await list({ prefix, cursor });
    for (const b of res.blobs) {
      const mapped = mapper(b);
      if (mapped !== null) out.push(mapped);
    }
    cursor = res.cursor;
  } while (cursor);
  return out;
}

async function readMetaBlob(id) {
  const hit = metaCache.get(id);
  if (hit && Date.now() - hit.t < META_CACHE_TTL) return hit.meta;
  let res;
  try {
    res = await blobGet(blobMetaPath(id));
  } catch (err) {
    if (isNotFound(err)) throw new HttpError(404, 'not_found');
    throw err;
  }
  if (!res || res.statusCode === 304 || !res.stream) {
    throw new HttpError(404, 'not_found');
  }
  let meta;
  try {
    meta = JSON.parse(await webStreamToText(res.stream));
  } catch (err) {
    if (isNotFound(err)) throw new HttpError(404, 'not_found');
    throw err;
  }
  metaCache.set(id, { t: Date.now(), meta });
  return meta;
}

async function writeMetaBlob(meta) {
  await blobPut(blobMetaPath(meta.id), JSON.stringify(meta));
  metaCache.set(meta.id, { t: Date.now(), meta });
}

async function readMetaR2(id) {
  const hit = metaCache.get(id);
  if (hit && Date.now() - hit.t < META_CACHE_TTL) return hit.meta;
  let meta;
  try {
    meta = JSON.parse(await r2ReadText(blobMetaPath(id)));
  } catch (err) {
    if (isR2NotFound(err)) throw new HttpError(404, 'not_found');
    throw err;
  }
  metaCache.set(id, { t: Date.now(), meta });
  return meta;
}

async function writeMetaR2(meta) {
  await getR2().send(
    new PutObjectCommand({
      Bucket: r2Bucket,
      Key: blobMetaPath(meta.id),
      Body: JSON.stringify(meta),
    })
  );
  metaCache.set(meta.id, { t: Date.now(), meta });
}

async function destroyUploadBlob(id) {
  metaCache.delete(id);
  chunkListCache.delete(id);
  const urls = [];
  urls.push(...(await listAll(`${BLOB_FILES_PREFIX}${id}/`, (b) => b.url)));
  urls.push(...(await listAll(blobMetaPath(id), (b) => b.url)));
  if (urls.length) await del(urls);
}

async function destroyUploadR2(id) {
  metaCache.delete(id);
  chunkListCache.delete(id);
  try {
    const chunks = await r2List(`${BLOB_FILES_PREFIX}${id}/`);
    const keys = chunks.map((c) => c.key);
    keys.push(blobMetaPath(id));
    await r2DeleteKeys(keys);
  } catch {}
}

async function listChunkBlobsBlob(id) {
  const hit = chunkListCache.get(id);
  if (hit && Date.now() - hit.t < CHUNK_LIST_TTL) return hit.items;
  const items = await listAll(`${BLOB_FILES_PREFIX}${id}/`, (b) => {
    const m = /^c(\d{6})$/.exec(b.pathname.split('/').pop());
    if (!m) return null;
    return { index: parseInt(m[1], 10), pathname: b.pathname, url: b.url, size: b.size };
  });
  items.sort((a, b) => a.index - b.index);
  chunkListCache.set(id, { t: Date.now(), items });
  return items;
}

async function listChunkBlobsR2(id) {
  const hit = chunkListCache.get(id);
  if (hit && Date.now() - hit.t < CHUNK_LIST_TTL) return hit.items;
  let items;
  try {
    const objs = await r2List(`${BLOB_FILES_PREFIX}${id}/`);
    items = [];
    for (const obj of objs) {
      const m = /^c(\d{6})$/.exec(obj.key.split('/').pop());
      if (!m) continue;
      items.push({ index: parseInt(m[1], 10), key: obj.key, size: obj.size });
    }
  } catch {
    items = [];
  }
  items.sort((a, b) => a.index - b.index);
  chunkListCache.set(id, { t: Date.now(), items });
  return items;
}

async function listChunkBlobs(id) {
  if (r2Mode) return listChunkBlobsR2(id);
  return listChunkBlobsBlob(id);
}

export async function readMeta(id) {
  if (r2Mode) return readMetaR2(id);
  if (blobMode) return readMetaBlob(id);
  await ensureDirs();
  try {
    const raw = await fsp.readFile(metaFileOf(id), 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err && (err.code === 'ENOENT' || isNotFound(err))) {
      throw new HttpError(404, 'not_found');
    }
    throw err;
  }
}

export async function writeMeta(meta) {
  if (r2Mode) return writeMetaR2(meta);
  if (blobMode) return writeMetaBlob(meta);
  await ensureDirs();
  const tmp = `${metaFileOf(meta.id)}.${Date.now()}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(meta));
  await fsp.rename(tmp, metaFileOf(meta.id));
}

export function patchMeta(id, patch) {
  return locked(id, async () => {
    const meta = await readMeta(id);
    Object.assign(meta, typeof patch === 'function' ? patch(meta) : patch);
    await writeMeta(meta);
    return meta;
  });
}

export async function destroyUpload(id) {
  if (r2Mode) return destroyUploadR2(id);
  if (blobMode) return destroyUploadBlob(id);
  await fsp.rm(fileDirOf(id), { recursive: true, force: true }).catch(() => {});
  await fsp.rm(metaFileOf(id), { force: true }).catch(() => {});
}

export async function prepareUploadDir(id) {
  if (blobMode || r2Mode) return;
  await ensureDirs();
  await fsp.mkdir(fileDirOf(id), { recursive: true });
}

export async function listMetaIds() {
  if (r2Mode) {
    try {
      const objs = await r2List(BLOB_META_PREFIX);
      const names = [];
      for (const obj of objs) {
        const m = /^([a-z0-9]+)\.json$/.exec(obj.key.split('/').pop());
        if (m) names.push(m[1]);
      }
      return names;
    } catch {
      return [];
    }
  }
  if (blobMode) {
    try {
      const names = await listAll(BLOB_META_PREFIX, (b) =>
        /^([a-z0-9]+)\.json$/.test(b.pathname.split('/').pop())
          ? b.pathname.split('/').pop().slice(0, -5)
          : null
      );
      return names;
    } catch {
      return [];
    }
  }
  try {
    const names = await fsp.readdir(META_DIR);
    return names.filter((n) => n.endsWith('.json')).map((n) => n.slice(0, -5));
  } catch {
    return [];
  }
}

export async function listExistingChunks(id) {
  if (r2Mode || blobMode) {
    try {
      const items = await listChunkBlobs(id);
      return items.map((i) => i.index);
    } catch {
      return [];
    }
  }
  try {
    const names = await fsp.readdir(fileDirOf(id));
    const out = [];
    for (const name of names) {
      const m = /^c(\d{6})$/.exec(name);
      if (m) out.push(parseInt(m[1], 10));
    }
    return out.sort((a, b) => a - b);
  } catch {
    return [];
  }
}

export async function chunkSizes(id, count) {
  if (r2Mode || blobMode) {
    const sizes = new Array(count).fill(null);
    const items = await listChunkBlobs(id);
    for (const item of items) {
      if (item.index < count) sizes[item.index] = item.size;
    }
    return sizes;
  }
  const sizes = new Array(count).fill(null);
  const BATCH = 128;
  for (let start = 0; start < count; start += BATCH) {
    const end = Math.min(count, start + BATCH);
    const batch = [];
    for (let i = start; i < end; i += 1) {
      batch.push(
        fsp
          .stat(chunkFileOf(id, i))
          .then((s) => s.size)
          .catch(() => null)
      );
    }
    const results = await Promise.all(batch);
    for (let i = start; i < end; i += 1) sizes[i] = results[i - start];
  }
  return sizes;
}

export async function putChunk(id, index, webStream, maxBytes) {
  if (r2Mode) {
    const buf = Buffer.from(await new Response(webStream).arrayBuffer());
    if (buf.length > maxBytes) throw new HttpError(413, 'chunk_too_large');
    await getR2().send(
      new PutObjectCommand({
        Bucket: r2Bucket,
        Key: blobChunkPath(id, index),
        Body: buf,
      })
    );
    chunkListCache.delete(id);
    return buf.length;
  }
  if (blobMode) {
    const buf = Buffer.from(await new Response(webStream).arrayBuffer());
    if (buf.length > maxBytes) throw new HttpError(413, 'chunk_too_large');
    await blobPut(blobChunkPath(id, index), buf);
    chunkListCache.delete(id);
    return buf.length;
  }
  let seen = 0;
  const guard = new Transform({
    transform(chunk, _enc, cb) {
      seen += chunk.length;
      if (seen > maxBytes) {
        cb(new HttpError(413, 'chunk_too_large'));
        return;
      }
      cb(null, chunk);
    },
  });
  const tmp = `${chunkFileOf(id, index)}.${process.pid}.${Date.now()}.part`;
  try {
    await pipeline(
      Readable.fromWeb(webStream),
      guard,
      createWriteStream(tmp, { flags: 'w' })
    );
  } catch (err) {
    await fsp.rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
  await fsp.rename(tmp, chunkFileOf(id, index));
  return seen;
}

export async function saveBodyToFile(webStream, dest, maxBytes) {
  let seen = 0;
  const guard = new Transform({
    transform(chunk, _enc, cb) {
      seen += chunk.length;
      if (seen > maxBytes) {
        cb(new HttpError(413, 'chunk_too_large'));
        return;
      }
      cb(null, chunk);
    },
  });
  try {
    await pipeline(
      Readable.fromWeb(webStream),
      guard,
      createWriteStream(dest, { flags: 'w' })
    );
  } catch (err) {
    await fsp.rm(dest, { force: true }).catch(() => {});
    throw err;
  }
  return seen;
}

export function expectedChunkSize(meta, index) {
  const full = Math.floor(meta.size / meta.chunkSize);
  const remainder = meta.size % meta.chunkSize;
  if (index < full) return meta.chunkSize;
  if (index === full) return remainder || meta.chunkSize;
  return 0;
}

export function parseRange(header, size) {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let start;
  let end;
  if (m[1] === '') {
    const n = parseInt(m[2], 10);
    if (!Number.isInteger(n) || n === 0 || n > size) {
      return { unsatisfiable: true };
    }
    start = size - n;
    end = size - 1;
  } else {
    start = parseInt(m[1], 10);
    end = m[2] === '' ? size - 1 : parseInt(m[2], 10);
  }
  if (
    Number.isNaN(start) ||
    Number.isNaN(end) ||
    start > end ||
    start >= size ||
    start < 0
  ) {
    return { unsatisfiable: true };
  }
  return { start, end: Math.min(end, size - 1) };
}

async function* blobChunkIterator(meta, start, end) {
  const items = await listChunkBlobs(meta.id);
  const byIndex = new Map(items.map((i) => [i.index, i]));
  let remaining = end - start + 1;
  let index = Math.floor(start / meta.chunkSize);
  let offset = start - index * meta.chunkSize;
  while (remaining > 0 && index < meta.chunkCount) {
    const avail = expectedChunkSize(meta, index) - offset;
    if (avail <= 0) {
      index += 1;
      offset = 0;
      continue;
    }
    const take = Math.min(avail, remaining);
    const item = byIndex.get(index);
    if (!item) throw new HttpError(404, 'missing_chunk');
    let res;
    try {
      res = await blobGet(item.pathname || blobChunkPath(meta.id, index), {
        headers: { Range: `bytes=${offset}-${offset + take - 1}` },
      });
    } catch (err) {
      if (isNotFound(err)) throw new HttpError(404, 'missing_chunk');
      throw err;
    }
    if (!res || !res.stream) throw new HttpError(502, 'chunk_fetch_failed');
    const reader = res.stream.getReader();
    let served = 0;
    while (served < take) {
      const { done, value } = await reader.read();
      if (done) break;
      let buf = Buffer.isBuffer(value) ? value : Buffer.from(value);
      if (buf.length === 0) continue;
      const out =
        buf.length > take - served ? buf.subarray(0, take - served) : buf;
      yield out;
      served += out.length;
    }
    try {
      await reader.cancel();
    } catch {}
    if (served < take) throw new HttpError(502, 'chunk_fetch_failed');
    try {
      await reader.cancel();
    } catch {}
    remaining -= take;
    index += 1;
    offset = 0;
  }
}

async function* r2ChunkIterator(meta, start, end) {
  const items = await listChunkBlobsR2(meta.id);
  const byIndex = new Map(items.map((i) => [i.index, i]));
  let remaining = end - start + 1;
  let index = Math.floor(start / meta.chunkSize);
  let offset = start - index * meta.chunkSize;
  while (remaining > 0 && index < meta.chunkCount) {
    const avail = expectedChunkSize(meta, index) - offset;
    if (avail <= 0) {
      index += 1;
      offset = 0;
      continue;
    }
    const take = Math.min(avail, remaining);
    const item = byIndex.get(index);
    if (!item) throw new HttpError(404, 'missing_chunk');
    let res;
    try {
      res = await getR2().send(
        new GetObjectCommand({
          Bucket: r2Bucket,
          Key: item.key,
          Range: `bytes=${offset}-${offset + take - 1}`,
        })
      );
    } catch (err) {
      if (isR2NotFound(err)) throw new HttpError(404, 'missing_chunk');
      throw err;
    }
    if (!res || !res.Body) throw new HttpError(502, 'chunk_fetch_failed');
    const reader = res.Body.transformToWebStream().getReader();
    let served = 0;
    while (served < take) {
      const { done, value } = await reader.read();
      if (done) break;
      let buf = Buffer.isBuffer(value) ? value : Buffer.from(value);
      if (buf.length === 0) continue;
      const out =
        buf.length > take - served ? buf.subarray(0, take - served) : buf;
      yield out;
      served += out.length;
    }
    try {
      await reader.cancel();
    } catch {}
    if (served < take) throw new HttpError(502, 'chunk_fetch_failed');
    remaining -= take;
    index += 1;
    offset = 0;
  }
}

export function rangeStream(meta, start, end) {
  if (r2Mode) {
    return Readable.toWeb(Readable.from(r2ChunkIterator(meta, start, end)));
  }
  if (blobMode) {
    return Readable.toWeb(Readable.from(blobChunkIterator(meta, start, end)));
  }
  const pass = new PassThrough({ highWaterMark: 1024 * 1024 });
  (async () => {
    let remaining = end - start + 1;
    let index = Math.floor(start / meta.chunkSize);
    let offset = start - index * meta.chunkSize;
    try {
      while (remaining > 0 && index < meta.chunkCount) {
        const avail = expectedChunkSize(meta, index) - offset;
        if (avail <= 0) {
          index += 1;
          offset = 0;
          continue;
        }
        const take = Math.min(avail, remaining);
        const src = createReadStream(chunkFileOf(meta.id, index), {
          start: offset,
          end: offset + take - 1,
        });
        await pipeline(src, pass, { end: false });
        remaining -= take;
        index += 1;
        offset = 0;
      }
      pass.end();
    } catch (err) {
      pass.destroy(err);
    }
  })();
  return Readable.toWeb(pass);
}

export async function sweepPending(ttlMs = PENDING_TTL_MS) {
  const ids = await listMetaIds();
  const now = Date.now();
  for (const id of ids) {
    try {
      const m = await readMeta(id);
      if (m.status === 'pending' && now - (m.createdAt || 0) > ttlMs) {
        await destroyUpload(id);
      }
    } catch {}
  }
}

export function publicMeta(m) {
  return {
    id: m.id,
    name: m.name,
    size: m.size,
    type: m.type,
    status: m.status,
    createdAt: m.createdAt,
    completedAt: m.completedAt,
    downloads: m.downloads || 0,
    chunkCount: m.chunkCount,
    chunkSize: m.chunkSize,
    sender: m.sender || '',
    protected: Boolean(m.passwordHash),
  };
}

const BLOB_USERS_PREFIX = 'sendr/users/';
const userFileOf = (nameLower) =>
  path.join(USERS_DIR, `${encodeURIComponent(nameLower)}.json`);

export async function readUser(nameLower) {
  if (r2Mode) {
    let text;
    try {
      text = await r2ReadText(
        `${BLOB_USERS_PREFIX}${encodeURIComponent(nameLower)}.json`
      );
    } catch (err) {
      if (isR2NotFound(err)) return null;
      throw err;
    }
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
  if (blobMode) {
    let res;
    try {
      res = await blobGet(`${BLOB_USERS_PREFIX}${encodeURIComponent(nameLower)}.json`);
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
    if (!res || res.statusCode === 304 || !res.stream) return null;
    try {
      return JSON.parse(await webStreamToText(res.stream));
    } catch {
      return null;
    }
  }
  try {
    const raw = await fsp.readFile(userFileOf(nameLower), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function writeUser(rec) {
  const payload = JSON.stringify(rec);
  if (r2Mode) {
    await getR2().send(
      new PutObjectCommand({
        Bucket: r2Bucket,
        Key: `${BLOB_USERS_PREFIX}${encodeURIComponent(rec.nameLower)}.json`,
        Body: payload,
      })
    );
    return;
  }
  if (blobMode) {
    await blobPut(
      `${BLOB_USERS_PREFIX}${encodeURIComponent(rec.nameLower)}.json`,
      payload
    );
    return;
  }
  await ensureDirs();
  const tmp = `${userFileOf(rec.nameLower)}.${Date.now()}.tmp`;
  await fsp.writeFile(tmp, payload);
  await fsp.rename(tmp, userFileOf(rec.nameLower));
}
