import fsp from 'fs/promises';
import { createReadStream, createWriteStream, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { PassThrough, Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { put, list, del } from '@vercel/blob';
import { DATA_DIR, PENDING_TTL_MS } from './config';
import { HttpError } from './util';

export const blobMode = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

export let FILES_DIR = path.join(DATA_DIR, 'files');
export let META_DIR = path.join(DATA_DIR, 'meta');

let dirsReady = false;

export function ensureDirs() {
  if (blobMode || dirsReady) return;
  try {
    mkdirSync(FILES_DIR, { recursive: true });
    mkdirSync(META_DIR, { recursive: true });
    dirsReady = true;
    return;
  } catch {}
  const fallback = path.join(tmpdir(), 'sendr-data');
  FILES_DIR = path.join(fallback, 'files');
  META_DIR = path.join(fallback, 'meta');
  mkdirSync(FILES_DIR, { recursive: true });
  mkdirSync(META_DIR, { recursive: true });
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
const META_CACHE_TTL = 3000;
const chunkListCache = new Map();
const CHUNK_LIST_TTL = 10000;

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
  const entries = await listAll(blobMetaPath(id), (b) => b);
  if (!entries.length) throw new HttpError(404, 'not_found');
  const res = await fetch(entries[0].url, { cache: 'no-store' });
  if (!res.ok) throw new HttpError(404, 'not_found');
  const meta = await res.json();
  metaCache.set(id, { t: Date.now(), meta });
  return meta;
}

async function writeMetaBlob(meta) {
  await put(blobMetaPath(meta.id), JSON.stringify(meta), {
    access: 'public',
    addRandomSuffix: false,
  });
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

async function listChunkBlobs(id) {
  const hit = chunkListCache.get(id);
  if (hit && Date.now() - hit.t < CHUNK_LIST_TTL) return hit.items;
  const items = await listAll(`${BLOB_FILES_PREFIX}${id}/`, (b) => {
    const m = /^c(\d{6})$/.exec(b.pathname.split('/').pop());
    if (!m) return null;
    return { index: parseInt(m[1], 10), url: b.url, size: b.size };
  });
  items.sort((a, b) => a.index - b.index);
  chunkListCache.set(id, { t: Date.now(), items });
  return items;
}

export async function readMeta(id) {
  if (blobMode) return readMetaBlob(id);
  const raw = await fsp.readFile(metaFileOf(id), 'utf8');
  return JSON.parse(raw);
}

export async function writeMeta(meta) {
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
  if (blobMode) return destroyUploadBlob(id);
  await fsp.rm(fileDirOf(id), { recursive: true, force: true }).catch(() => {});
  await fsp.rm(metaFileOf(id), { force: true }).catch(() => {});
}

export async function prepareUploadDir(id) {
  if (blobMode) return;
  await ensureDirs();
  await fsp.mkdir(fileDirOf(id), { recursive: true });
}

export async function listMetaIds() {
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
  if (blobMode) {
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
  if (blobMode) {
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
  if (blobMode) {
    const buf = Buffer.from(await new Response(webStream).arrayBuffer());
    if (buf.length > maxBytes) throw new HttpError(413, 'chunk_too_large');
    await put(blobChunkPath(id, index), buf, {
      access: 'public',
      addRandomSuffix: false,
    });
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
    const res = await fetch(item.url, {
      headers: { Range: `bytes=${offset}-${offset + take - 1}` },
      cache: 'no-store',
    });
    if (!res.ok && res.status !== 206) throw new HttpError(502, 'chunk_fetch_failed');
    const reader = res.body.getReader();
    let served = 0;
    let skipped = res.status === 206 ? 0 : offset;
    while (served < take) {
      const { done, value } = await reader.read();
      if (done) break;
      let buf = value;
      if (skipped > 0) {
        const skip = Math.min(skipped, buf.length);
        buf = buf.subarray(skip);
        skipped -= skip;
      }
      if (buf.length === 0) continue;
      const out =
        buf.length > take - served ? buf.subarray(0, take - served) : buf;
      yield out;
      served += out.length;
    }
    try {
      await reader.cancel();
    } catch {}
    remaining -= take;
    index += 1;
    offset = 0;
  }
}

export function rangeStream(meta, start, end) {
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
    protected: Boolean(m.passwordHash),
  };
}
