import { attemptPassword } from '@/lib/server/access';
import { makeAccessToken } from '@/lib/server/secret';
import { publicMeta, readMeta } from '@/lib/server/store';
import {
  fail,
  getIp,
  handleError,
  isValidId,
  json,
  rateLimit,
  readJson,
} from '@/lib/server/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Swap the password for a short-lived access token, so the password itself is
// never put in a URL (where it would land in logs and browser history).
export async function POST(req, { params }) {
  try {
    if (!rateLimit(`unlock:${getIp(req)}`, 12, 60000)) {
      return fail(429, 'slow_down');
    }
    if (!isValidId(params.id)) return fail(400, 'bad_request');
    const body = await readJson(req, 4096);
    let meta;
    try {
      meta = await readMeta(params.id);
    } catch {
      return fail(404, 'not_found');
    }
    if (meta.status !== 'ready') return fail(409, 'not_ready');
    if (!meta.passwordHash) return json({ ok: true, locked: false, meta: publicMeta(meta) });
    const ok = await attemptPassword(meta, String(body.password || '').slice(0, 128));
    if (!ok) return fail(401, 'wrong_password');
    const pub = publicMeta(meta);
    return json({ ok: true, token: makeAccessToken(meta), meta: pub, note: pub.note });
  } catch (err) {
    return handleError(err);
  }
}
