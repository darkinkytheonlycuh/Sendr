import { destroyUpload, readMeta } from '@/lib/server/store';
import {
  fail,
  getIp,
  handleError,
  hashToken,
  isValidId,
  json,
  rateLimit,
  readJson,
} from '@/lib/server/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    if (!rateLimit(`abort:${getIp(req)}`, 60, 60000)) {
      return fail(429, 'slow_down');
    }
    const body = await readJson(req);
    const id = String(body.id || '');
    const token = String(body.token || '');
    if (!isValidId(id)) return fail(400, 'bad_request');

    let meta;
    try {
      meta = await readMeta(id);
    } catch {
      return json({ ok: true, gone: true });
    }
    if (!token || hashToken(token) !== meta.deleteTokenHash) {
      return fail(403, 'bad_token');
    }
    if (meta.status === 'ready') {
      return fail(409, 'already_ready', 'File is live. Delete it from the vault instead.');
    }
    await destroyUpload(id);
    return json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
