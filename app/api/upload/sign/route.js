import { safeEqual } from '@/lib/server/secret';
import { expectedChunkSize, presignChunks, readMeta } from '@/lib/server/store';
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
  readJson,
} from '@/lib/server/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_PER_CALL = 64;

// Hands the uploader presigned PUT URLs so chunks go straight to storage.
// Replies { mode: 'proxy' } when direct upload is not available here; the
// client then sends chunks through /api/upload/chunk as before.
export async function POST(req) {
  try {
    if (!rateLimit(`sign:${getIp(req)}`, 600, 60000)) return fail(429, 'slow_down');
    const body = await readJson(req);
    const id = String(body.id || '');
    const token = String(body.token || '');
    if (!isValidId(id)) return fail(400, 'bad_request');
    const indexes = Array.isArray(body.indexes) ? body.indexes.slice(0, MAX_PER_CALL) : [];

    let meta;
    try {
      meta = await readMeta(id);
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) return metaMissingResponse();
      throw err;
    }
    if (!token || !safeEqual(hashToken(token), meta.deleteTokenHash || '')) return fail(403, 'bad_token');
    if (meta.status !== 'pending') return fail(409, 'not_pending');
    for (const i of indexes) {
      if (!Number.isInteger(i) || i < 0 || i >= meta.chunkCount) return fail(400, 'bad_index');
    }

    const signed = await presignChunks(id, indexes, 'put', (i) => expectedChunkSize(meta, i));
    if (!signed) return json({ ok: true, mode: 'proxy' });
    return json({ ok: true, mode: 'direct', ...signed });
  } catch (err) {
    return handleError(err);
  }
}
