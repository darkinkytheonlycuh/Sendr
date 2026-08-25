import { listExistingChunks, publicMeta, readMeta } from '@/lib/server/store';
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

export async function POST(req) {
  try {
    if (!rateLimit(`resume:${getIp(req)}`, 60, 60000)) {
      return fail(429, 'slow_down');
    }
    const body = await readJson(req);
    const id = String(body.id || '');
    const token = String(body.token || '');
    if (!isValidId(id)) return fail(400, 'bad_request');

    let meta;
    try {
      meta = await readMeta(id);
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        return metaMissingResponse();
      }
      throw err;
    }
    if (!token || hashToken(token) !== meta.deleteTokenHash) {
      return fail(403, 'bad_token');
    }
    if (meta.status === 'ready') {
      return json({ ok: true, already: true, meta: publicMeta(meta), have: [] });
    }
    if (meta.status !== 'pending') return fail(409, 'bad_state');

    const have = await listExistingChunks(id);
    return json({ ok: true, meta: publicMeta(meta), have });
  } catch (err) {
    return handleError(err);
  }
}

