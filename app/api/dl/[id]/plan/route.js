import { canRead } from '@/lib/server/access';
import { patchMeta, presignChunks, readMeta } from '@/lib/server/store';
import {
  HttpError,
  contentDisposition,
  fail,
  getIp,
  handleError,
  isValidId,
  json,
  metaMissingResponse,
  rateLimit,
  readJson,
  sleep,
  verifyPassword,
} from '@/lib/server/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_PER_CALL = 256;

// Download plan for the parallel downloader (public/sendr-sw.js): the chunk
// layout plus, when storage supports it, presigned URLs for a batch of chunks
// so they can be fetched straight from storage, many at once.
export async function POST(req, { params }) {
  try {
    if (!isValidId(params.id)) return fail(400, 'bad_request');
    if (!rateLimit(`plan:${getIp(req)}`, 600, 60000)) return fail(429, 'slow_down');
    const body = await readJson(req);

    let meta;
    try {
      meta = await readMeta(params.id);
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) return metaMissingResponse();
      throw err;
    }
    if (meta.status === 'removed') {
      return fail(451, 'removed', 'This file was removed after a legal or policy complaint');
    }
    if (meta.status !== 'ready') return fail(409, 'not_ready');
    if (!(await canRead(req, meta, typeof body.t === 'string' ? body.t : ''))) {
      return fail(401, 'locked');
    }

    const from = Math.max(0, Math.min(Number(body.from) || 0, meta.chunkCount));
    const count = Math.max(0, Math.min(Number(body.count) || 0, MAX_PER_CALL, meta.chunkCount - from));
    const indexes = Array.from({ length: count }, (_, k) => from + k);

    if (body.start === true) {
      patchMeta(meta.id, (m) => {
        m.downloads = (m.downloads || 0) + 1;
      }).catch(() => {});
    }

    const signed = count ? await presignChunks(meta.id, indexes, 'get') : null;
    return json({
      ok: true,
      mode: signed ? 'direct' : 'proxy',
      id: meta.id,
      size: meta.size,
      chunkSize: meta.chunkSize,
      chunkCount: meta.chunkCount,
      type: meta.type || 'application/octet-stream',
      disposition: contentDisposition(meta.name, false),
      urls: signed ? signed.urls : null,
      validUntil: signed ? signed.validUntil : null,
    });
  } catch (err) {
    return handleError(err);
  }
}
