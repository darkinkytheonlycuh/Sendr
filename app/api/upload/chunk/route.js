import { expectedChunkSize, putChunk, readMeta } from '@/lib/server/store';
import {
  HttpError,
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
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        return metaMissingResponse();
      }
      throw err;
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

    const got = await putChunk(id, index, req.body, expected);
    if (got !== expected) {
      return fail(400, 'size_mismatch', { expected, got });
    }
    return json({ ok: true, index });
  } catch (err) {
    if (err && err.code === 'chunk_too_large') return fail(413, 'chunk_too_large');
    return handleError(err);
  }
}

