import { canRead, isOwner, lockedView } from '@/lib/server/access';
import { destroyUpload, patchMeta, publicMeta, readMeta } from '@/lib/server/store';
import {
  HttpError,
  fail,
  getIp,
  cleanText,
  handleError,
  hashPassword,
  hashToken,
  isValidId,
  json,
  metaMissingResponse,
  rateLimit,
  readJson,
  sanitizeName,
} from '@/lib/server/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req, { params }) {
  try {
    if (!isValidId(params.id)) return fail(400, 'bad_request');
    if (!rateLimit(`meta:${getIp(req)}`, 60, 60000)) {
      return fail(429, 'slow_down');
    }
    let meta;
    try {
      meta = await readMeta(params.id);
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        return metaMissingResponse();
      }
      throw err;
    }
    // Locked files show nothing but their existence until unlocked; the sender
    // (x-sendr-token) and holders of an access token see the details.
    const out = isOwner(req, meta) || (await canRead(req, meta)) ? publicMeta(meta) : lockedView(meta);
    delete out.chunkCount;
    delete out.chunkSize;
    if (!isOwner(req, meta)) delete out.downloads;
    return json({ ok: true, meta: out });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(req, { params }) {
  try {
    if (!rateLimit(`delete:${getIp(req)}`, 60, 60000)) {
      return fail(429, 'slow_down');
    }
    if (!isValidId(params.id)) return fail(400, 'bad_request');
    const url = new URL(req.url);
    const token =
      req.headers.get('x-sendr-token') || url.searchParams.get('token') || '';
    let meta;
    try {
      meta = await readMeta(params.id);
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        return metaMissingResponse();
      }
      throw err;
    }
    if (!isOwner(req, meta)) return fail(403, 'bad_token');
    await destroyUpload(params.id);
    return json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}


const NOTE_MAX = 1000;

// Lets the sender edit a file they sent: rename it, change the note shown on
// the download page, or set / change / remove its password. Needs the same
// secret key as delete, which only the sender's browser holds.
export async function PATCH(req, { params }) {
  try {
    if (!rateLimit(`edit:${getIp(req)}`, 60, 60000)) {
      return fail(429, 'slow_down');
    }
    if (!isValidId(params.id)) return fail(400, 'bad_request');
    const token = req.headers.get('x-sendr-token') || '';
    const body = await readJson(req);

    const patch = {};
    if (body.name !== undefined) {
      const name = sanitizeName(body.name);
      if (!name) return fail(400, 'bad_name', 'The file name cannot be empty');
      patch.name = name;
    }
    if (body.note !== undefined) {
      patch.note = cleanText(body.note, NOTE_MAX);
    }
    if (body.removePassword === true) {
      patch.passwordSalt = undefined;
      patch.passwordHash = undefined;
      patch.pwFails = 0;
      patch.pwLockUntil = 0;
    } else if (typeof body.password === 'string' && body.password) {
      if (body.password.length > 128) return fail(400, 'bad_password', 'Password is too long');
      const { salt, hash } = hashPassword(body.password);
      patch.passwordSalt = salt;
      patch.passwordHash = hash;
      patch.pwFails = 0;
      patch.pwLockUntil = 0;
    }
    if (!Object.keys(patch).length) return fail(400, 'nothing_to_change');

    let meta;
    try {
      meta = await patchMeta(params.id, (current) => {
        if (!isOwner(req, current)) throw new HttpError(403, 'bad_token');
        if (current.status === 'removed') throw new HttpError(410, 'removed');
        if (current.status !== 'ready') throw new HttpError(409, 'not_ready');
        return { ...patch, editedAt: Date.now() };
      });
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        return metaMissingResponse();
      }
      throw err;
    }
    return json({ ok: true, meta: publicMeta(meta) });
  } catch (err) {
    return handleError(err);
  }
}
