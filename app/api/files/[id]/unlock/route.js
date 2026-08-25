import { readMeta } from '@/lib/server/store';
import {
  fail,
  getIp,
  handleError,
  isValidId,
  json,
  rateLimit,
  readJson,
  sleep,
  verifyPassword,
} from '@/lib/server/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req, { params }) {
  try {
    if (!rateLimit(`unlock:${getIp(req)}`, 12, 60000)) {
      return fail(429, 'slow_down');
    }
    if (!isValidId(params.id)) return fail(400, 'bad_request');
    const body = await readJson(req);
    let meta;
    try {
      meta = await readMeta(params.id);
    } catch {
      return fail(404, 'not_found');
    }
    if (meta.status !== 'ready') return fail(409, 'not_ready');
    if (!meta.passwordHash) return json({ ok: true, locked: false });
    const ok = verifyPassword(meta, String(body.password || ''));
    if (!ok) {
      await sleep(250);
      return fail(401, 'wrong_password');
    }
    return json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
