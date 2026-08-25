import fsp from 'fs/promises';
import {
  chunkFileOf,
  expectedChunkSize,
  readMeta,
  saveBodyToFile,
} from '@/lib/server/store';
import {
  fail,
  getIp,
  handleError,
  hashToken,
  isValidId,
  json,
  metaMissingResponse,
  rateLimit,
} from '@/lib/server/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(req) {
  try {
    if (!rateLimit(`chunk:${getIp(req)}`, 3000, 60000)) {
      return fail(429, 'slow_down');
    }
    const url = new URL(req.url);
    const id = url.searchParams.get('id') || '';
    const indexRaw = url.searchParams.get('index') || '';
    if (!isValidId(id) || !/^\d{1,10}$/.test(indexRaw)) {
      return fail(400, 'bad_request');
    }
    const index = parseInt(indexRaw, 10);
    const token = req.headers.get('x-sendr-token') || '';

    let meta;
    try {
      meta = await readMeta(id);
    } catch {
      return metaMissingResponse();
    }
    if (meta.status === 'ready') return fail(409, 'already_completed');
    if (meta.status !== 'pending') return fail(409, 'not_pending');
    if (!token || hashToken(token) !== meta.deleteTokenHash) {
      return fail(403, 'bad_token');
    }
    if (index < 0 || index >= meta.chunkCount) return fail(400, 'bad_index');

    const expected = expectedChunkSize(meta, index);
    if (expected <= 0) return fail(400, 'bad_index');

    const declared = Number(req.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > expected) {
      return fail(413, 'chunk_too_large');
    }
    if (!req.body) return fail(400, 'no_body');

    const tmp = `${chunkFileOf(id, index)}.${process.pid}.${Date.now()}.part`;
    const got = await saveBodyToFile(req.body, tmp, expected);
    if (got !== expected) {
      await fsp.rm(tmp, { force: true }).catch(() => {});
      return fail(400, 'size_mismatch', { expected, got });
    }
    await fsp.rename(tmp, chunkFileOf(id, index));
    return json({ ok: true, index });
  } catch (err) {
    if (err && err.code === 'chunk_too_large') return fail(413, 'chunk_too_large');
    return handleError(err);
  }
}
