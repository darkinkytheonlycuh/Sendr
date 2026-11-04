import { MAX_BYTES, MAX_CHUNKS, PENDING_TTL_MS, chunkSizeFor } from '@/lib/server/config';
import {
  fail,
  getIp,
  handleError,
  hashPassword,
  hashToken,
  json,
  newId,
  newToken,
  rateLimit,
  readJson,
  sanitizeName,
  sanitizeUserName,
} from '@/lib/server/util';
import {
  prepareUploadDir,
  publicMeta,
  readMeta,
  readUser,
  sweepPending,
  writeMeta,
} from '@/lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    if (!rateLimit(`init:${getIp(req)}`, 30, 60000)) return fail(429, 'slow_down');
    const body = await readJson(req);
    if (body.acceptTerms !== true) {
      return fail(400, 'terms_required', 'You must accept the Terms of Service to upload');
    }
    const name = sanitizeName(body.name);
    if (!name) return fail(400, 'bad_name');
    const size = Number(body.size);
    if (!Number.isInteger(size) || size < 1) return fail(400, 'bad_size');
    if (size > MAX_BYTES) {
      return fail(
        413,
        'too_large',
        `Files can be at most ${Math.floor(MAX_BYTES / 1024 ** 3).toLocaleString('en-US')} GB`
      );
    }
    const type =
      typeof body.type === 'string' && body.type
        ? body.type.slice(0, 120)
        : 'application/octet-stream';
    const password = body.password ? String(body.password).slice(0, 128) : '';
    const chunkSize = chunkSizeFor(size);
    const chunkCount = Math.ceil(size / chunkSize);
    if (chunkCount > MAX_CHUNKS) return fail(413, 'too_large');

    let senderName = '';
    if (body.sender && typeof body.sender === 'object') {
      const display = sanitizeUserName(body.sender.name);
      if (!display) return fail(403, 'bad_identity');
      const rec = await readUser(display.toLowerCase());
      if (!rec || rec.name !== display) return fail(403, 'bad_identity');
      if (!body.sender.secret || hashToken(String(body.sender.secret)) !== rec.secretHash) {
        return fail(403, 'bad_identity');
      }
      senderName = rec.name;
    }

    let id = null;
    for (let i = 0; i < 6; i += 1) {
      const candidate = newId(12);
      try {
        await readMeta(candidate);
      } catch {
        id = candidate;
        break;
      }
    }
    if (!id) return fail(500, 'id_collision');

    const token = newToken();
    const meta = {
      v: 2,
      id,
      name,
      size,
      type,
      chunkSize,
      chunkCount,
      status: 'pending',
      createdAt: Date.now(),
      completedAt: null,
      downloads: 0,
      sender: senderName,
      deleteTokenHash: hashToken(token),
      termsAcceptedAt: Date.now(),
    };
    if (password) {
      const { salt, hash } = hashPassword(password);
      meta.passwordSalt = salt;
      meta.passwordHash = hash;
    }

    await prepareUploadDir(id);
    await writeMeta(meta);
    sweepPending(PENDING_TTL_MS).catch(() => {});

    return json({ ok: true, id, token, chunkSize, chunkCount, meta: publicMeta(meta) });
  } catch (err) {
    return handleError(err);
  }
}
