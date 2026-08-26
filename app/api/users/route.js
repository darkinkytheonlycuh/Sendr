import { readUser, writeUser } from '@/lib/server/store';
import {
  fail,
  getIp,
  handleError,
  hashToken,
  json,
  newToken,
  rateLimit,
  readJson,
  sanitizeUserName,
} from '@/lib/server/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    if (!rateLimit(`users:${getIp(req)}`, 20, 60000)) return fail(429, 'slow_down');
    const body = await readJson(req);
    const action = String(body.action || '');

    if (action === 'claim') {
      const display = sanitizeUserName(body.name);
      if (!display) {
        return fail(
          400,
          'bad_name',
          '2-24 characters: letters, numbers, spaces, dot, dash, underscore'
        );
      }
      const nameLower = display.toLowerCase();
      const existing = await readUser(nameLower);
      if (existing) {
        return fail(409, 'name_taken', `"${existing.name}" is already taken`);
      }
      const secret = newToken();
      await writeUser({
        v: 1,
        name: display,
        nameLower,
        secretHash: hashToken(secret),
        createdAt: Date.now(),
      });
      return json({ ok: true, name: display, secret });
    }

    if (action === 'verify') {
      const display = sanitizeUserName(body.name);
      if (!display) return fail(403, 'bad_identity');
      const rec = await readUser(display.toLowerCase());
      if (!rec) return fail(403, 'bad_identity');
      if (hashToken(String(body.secret || '')) !== rec.secretHash) {
        return fail(403, 'bad_identity');
      }
      return json({ ok: true, name: rec.name });
    }

    return fail(400, 'bad_request');
  } catch (err) {
    return handleError(err);
  }
}
