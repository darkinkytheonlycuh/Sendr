import { readMeta, writeReport } from '@/lib/server/store';
import {
  cleanText,
  fail,
  getIp,
  handleError,
  hashToken,
  isValidId,
  json,
  newId,
  rateLimit,
  readJson,
} from '@/lib/server/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KINDS = new Set(['copyright', 'illegal', 'abuse', 'other']);

function extractId(input) {
  const raw = cleanText(input, 300);
  const m = /\/d\/([a-z0-9]{6,40})/.exec(raw) || /^([a-z0-9]{6,40})$/.exec(raw);
  return m ? m[1] : '';
}

export async function POST(req) {
  try {
    if (!rateLimit(`report:${getIp(req)}`, 6, 60000)) return fail(429, 'slow_down');
    const body = await readJson(req, 32 * 1024);
    const fileId = extractId(body.file);
    if (!isValidId(fileId)) return fail(400, 'bad_file', 'Paste the full Sendr link of the file');
    const kind = KINDS.has(body.kind) ? body.kind : 'other';
    const name = cleanText(body.name, 120);
    const email = cleanText(body.email, 200);
    const details = cleanText(body.details, 5000);
    const work = cleanText(body.work, 2000);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(400, 'bad_email', 'A valid email is required');
    if (details.length < 10) return fail(400, 'bad_details', 'Describe the problem');

    if (kind === 'copyright') {
      // 17 U.S.C. 512(c)(3) elements.
      if (!name) return fail(400, 'bad_name', 'Your full legal name is required');
      if (!work) return fail(400, 'bad_work', 'Identify the copyrighted work');
      if (body.goodFaith !== true || body.accurate !== true) {
        return fail(400, 'statements_required', 'Both statements must be confirmed');
      }
    }

    try {
      await readMeta(fileId);
    } catch {
      return fail(404, 'not_found', 'No file exists at that link');
    }

    const rec = {
      v: 1,
      id: newId(16),
      fileId,
      kind,
      name,
      email,
      work,
      details,
      goodFaith: body.goodFaith === true,
      accurate: body.accurate === true,
      signature: cleanText(body.signature, 120),
      ipHash: hashToken(`sendr-report:${getIp(req)}`),
      status: 'open',
      createdAt: Date.now(),
    };
    await writeReport(rec);
    return json({ ok: true, reportId: rec.id });
  } catch (err) {
    return handleError(err);
  }
}
