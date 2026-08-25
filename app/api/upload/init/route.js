import { CHUNK_SIZE, MAX_BYTES, PENDING_TTL_MS } from '@/lib/server/config';
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
} from '@/lib/server/util';
import {
  prepareUploadDir,
  readMeta,
  sweepPending,
  writeMeta,
} from '@/lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    if (!rateLimit(`init:${getIp(req)}`, 30, 60000)) return fail(429, 'slow_down');
    const body = await readJson(req);
    const name = sanitizeName(body.name);
    if (!name) return fail(400, 'bad_name');
    const size = Number(body.size);
    if (!Number.isInteger(size) || size < 1) return fail(400, 'bad_size');
    if (size > MAX_BYTES) {
      return fail(
        413,
        'too_large',
        `Files can be at most ${Math.floor(MAX_BYTES / 1024 ** 3)} GB`
      );
    }
    const type =
      typeof body.type === 'string' && body.type
        ? body.type.slice(0, 120)
        : 'application/octet-stream';
    const password = body.password ? String(body.password).slice(0, 128) : '';
    const chunkCount = Math.ceil(size / CHUNK_SIZE);

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
      v: 1,
      id,
      name,
      size,
      type,
      chunkSize: CHUNK_SIZE,
      chunkCount,
      status: 'pending',
      createdAt: Date.now(),
      completedAt: null,
      downloads: 0,
      deleteTokenHash: hashToken(token),
    };
    if (password) {
      const { salt, hash } = hashPassword(password);
      meta.passwordSalt = salt;
      meta.passwordHash = hash;
    }

    await prepareUploadDir(id);
    await writeMeta(meta);
    sweepPending(PENDING_TTL_MS).catch(() => {});

    return json({ ok: true, id, token, chunkSize: CHUNK_SIZE, chunkCount });
  } catch (err) {
    return handleError(err);
  }
}
