import { ADMIN_TOKEN } from '@/lib/server/config';
import { readReport, takedownUpload, writeReport } from '@/lib/server/store';
import {
  HttpError,
  cleanText,
  fail,
  getIp,
  handleError,
  isAdmin,
  isValidId,
  json,
  rateLimit,
  readJson,
} from '@/lib/server/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    if (!rateLimit(`admin:${getIp(req)}`, 60, 60000)) return fail(429, 'slow_down');
    if (!ADMIN_TOKEN) return fail(503, 'admin_disabled', 'Set SENDR_ADMIN_TOKEN to enable moderation');
    if (!isAdmin(req, ADMIN_TOKEN)) return fail(403, 'bad_admin_token');
    const body = await readJson(req);
    const id = String(body.id || '');
    if (!isValidId(id)) return fail(400, 'bad_request');
    let meta;
    try {
      meta = await takedownUpload(id, cleanText(body.reason, 200) || 'policy', 'admin');
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) return fail(404, 'not_found');
      throw err;
    }
    if (body.reportId) {
      const rec = await readReport(String(body.reportId));
      if (rec) {
        rec.status = 'actioned';
        rec.resolvedAt = Date.now();
        await writeReport(rec);
      }
    }
    return json({ ok: true, id, status: meta.status });
  } catch (err) {
    return handleError(err);
  }
}
