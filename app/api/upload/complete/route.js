import {
  chunkSizes,
  patchMeta,
  publicMeta,
  readMeta,
} from '@/lib/server/store';
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
    if (!rateLimit(`complete:${getIp(req)}`, 60, 60000)) {
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
      return json({ ok: true, already: true, meta: publicMeta(meta) });
    }
    if (meta.status !== 'pending') return fail(409, 'bad_state');

    const sizes = await chunkSizes(id, meta.chunkCount);
    const missing = [];
    const corrupt = [];
    sizes.forEach((sz, i) => {
      const expected =
        i === meta.chunkCount - 1
          ? meta.size - (meta.chunkCount - 1) * meta.chunkSize
          : meta.chunkSize;
      if (sz === null) missing.push(i);
      else if (sz !== expected) corrupt.push(i);
    });
    if (missing.length || corrupt.length) {
      return fail(400, 'incomplete', {
        missing: missing.length,
        corrupt: corrupt.length,
      });
    }

    const updated = await patchMeta(id, (m) => {
      m.status = 'ready';
      m.completedAt = Date.now();
    });
    return json({ ok: true, meta: publicMeta(updated) });
  } catch (err) {
    return handleError(err);
  }
}

