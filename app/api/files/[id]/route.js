import { destroyUpload, publicMeta, readMeta } from '@/lib/server/store';
import {
  fail,
  getIp,
  handleError,
  hashToken,
  isValidId,
  json,
  rateLimit,
} from '@/lib/server/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req, { params }) {
  try {
    if (!isValidId(params.id)) return fail(400, 'bad_request');
    let meta;
    try {
      meta = await readMeta(params.id);
    } catch {
      return fail(404, 'not_found');
    }
    return json({ ok: true, meta: publicMeta(meta) });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(req, { params }) {
  try {
    if (!rateLimit(`delete:${getIp(req)}`, 60, 60000)) {
      return fail(429, 'slow_down');
    }
    if (!isValidId(params.id)) return fail(400, 'bad_request');
    const url = new URL(req.url);
    const token =
      req.headers.get('x-sendr-token') || url.searchParams.get('token') || '';
    let meta;
    try {
      meta = await readMeta(params.id);
    } catch {
      return fail(404, 'not_found');
    }
    if (!token || hashToken(token) !== meta.deleteTokenHash) {
      return fail(403, 'bad_token');
    }
    await destroyUpload(params.id);
    return json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
