import { ADMIN_TOKEN } from '@/lib/server/config';
import { listReports, readMeta, readReport, writeReport } from '@/lib/server/store';
import { fail, getIp, handleError, isAdmin, json, rateLimit, readJson } from '@/lib/server/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function guard(req) {
  if (!rateLimit(`admin:${getIp(req)}`, 60, 60000)) return fail(429, 'slow_down');
  if (!ADMIN_TOKEN) return fail(503, 'admin_disabled', 'Set SENDR_ADMIN_TOKEN to enable moderation');
  if (!isAdmin(req, ADMIN_TOKEN)) return fail(403, 'bad_admin_token');
  return null;
}

export async function GET(req) {
  try {
    const denied = guard(req);
    if (denied) return denied;
    const reports = await listReports();
    const out = [];
    for (const r of reports) {
      let file = null;
      try {
        const m = await readMeta(r.fileId);
        file = { name: m.name, size: m.size, status: m.status, type: m.type };
      } catch {}
      out.push({ ...r, file });
    }
    return json({ ok: true, reports: out });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req) {
  try {
    const denied = guard(req);
    if (denied) return denied;
    const body = await readJson(req);
    const rec = await readReport(String(body.reportId || ''));
    if (!rec) return fail(404, 'not_found');
    if (!['open', 'dismissed', 'actioned'].includes(body.status)) return fail(400, 'bad_status');
    rec.status = body.status;
    rec.resolvedAt = Date.now();
    await writeReport(rec);
    return json({ ok: true, report: rec });
  } catch (err) {
    return handleError(err);
  }
}
