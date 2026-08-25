import fsp from 'fs/promises';
import { createReadStream, createWriteStream } from 'fs';
import path from 'path';
import { PassThrough, Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { DATA_DIR, PENDING_TTL_MS } from './config';
import { HttpError } from './util';

export const FILES_DIR = path.join(DATA_DIR, 'files');
export const META_DIR = path.join(DATA_DIR, 'meta');

let dirsReady = false;

export async function ensureDirs() {
  if (dirsReady) return;
  await fsp.mkdir(FILES_DIR, { recursive: true });
  await fsp.mkdir(META_DIR, { recursive: true });
  dirsReady = true;
}

export const fileDirOf = (id) => path.join(FILES_DIR, id);
export const chunkFileOf = (id, index) =>
  path.join(fileDirOf(id), `c${String(index).padStart(6, '0')}`);
export const metaFileOf = (id) => path.join(META_DIR, `${id}.json`);

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

export async function readMeta(id) {
  const raw = await fsp.readFile(metaFileOf(id), 'utf8');
  return JSON.parse(raw);
}

export async function writeMeta(meta) {
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
  await fsp.rm(fileDirOf(id), { recursive: true, force: true }).catch(() => {});
  await fsp.rm(metaFileOf(id), { force: true }).catch(() => {});
}

export async function listMetaIds() {
  try {
    const names = await fsp.readdir(META_DIR);
    return names.filter((n) => n.endsWith('.json')).map((n) => n.slice(0, -5));
  } catch {
    return [];
  }
}

export async function listExistingChunks(id) {
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

export function rangeStream(meta, start, end) {
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
