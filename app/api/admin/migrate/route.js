import { ADMIN_TOKEN } from '@/lib/server/config';
import { migrateLegacyBatch } from '@/lib/server/store';
import { fail, getIp, handleError, isAdmin, json, rateLimit } from '@/lib/server/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Moves files uploaded before the secret-tagged storage layout to it. Call
// repeatedly until { remaining: 0 }.
export async function POST(req) {
  try {
    if (!rateLimit(`admin:${getIp(req)}`, 60, 60000)) return fail(429, 'slow_down');
    if (!ADMIN_TOKEN) return fail(503, 'admin_disabled', 'Set SENDR_ADMIN_TOKEN to enable moderation');
    if (!isAdmin(req, ADMIN_TOKEN)) return fail(403, 'bad_admin_token');
    const res = await migrateLegacyBatch(40000);
    return json({ ok: true, ...res });
  } catch (err) {
    return handleError(err);
  }
}
