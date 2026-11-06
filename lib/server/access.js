import { patchMeta, publicMeta } from './store';
import { checkAccessToken } from './secret';
import { HttpError, hashToken, sleep, verifyPassword } from './util';
import { safeEqual } from './secret';

// Password guessing is limited per file (not only per IP, which an attacker can
// rotate): after 5 wrong tries the file locks for 30s, doubling each further
// miss, up to 15 minutes. The counter lives in the file's metadata, so it holds
// across every server instance.
const FREE_TRIES = 5;
const MAX_LOCK_MS = 15 * 60 * 1000;

export async function attemptPassword(meta, password) {
  const now = Date.now();
  if (meta.pwLockUntil && meta.pwLockUntil > now) {
    throw new HttpError(429, 'locked_out', 'Too many wrong passwords. Try again later.', {
      retryAfter: Math.ceil((meta.pwLockUntil - now) / 1000),
    });
  }
  if (password && verifyPassword(meta, password)) {
    if (meta.pwFails) patchMeta(meta.id, { pwFails: 0, pwLockUntil: 0 }).catch(() => {});
    return true;
  }
  await patchMeta(meta.id, (m) => {
    const fails = (m.pwFails || 0) + 1;
    const lock = fails >= FREE_TRIES ? Math.min(MAX_LOCK_MS, 30000 * 2 ** (fails - FREE_TRIES)) : 0;
    return { pwFails: fails, pwLockUntil: lock ? Date.now() + lock : m.pwLockUntil || 0 };
  }).catch(() => {});
  await sleep(250);
  return false;
}

export function isOwner(req, meta) {
  const token = req.headers.get('x-sendr-token') || '';
  return Boolean(token) && safeEqual(hashToken(token), meta.deleteTokenHash || '');
}

// Can this request read the file's bytes / details?
//  - no password set, or
//  - a valid access token (?t=, x-sendr-access header, or body.t), or
//  - the password in the x-sendr-password header (for scripts; rate limited).
export async function canRead(req, meta, bodyToken) {
  if (!meta.passwordHash) return true;
  const url = new URL(req.url);
  const token = bodyToken || url.searchParams.get('t') || req.headers.get('x-sendr-access') || '';
  if (token && checkAccessToken(meta, token)) return true;
  if (isOwner(req, meta)) return true;
  const pw = req.headers.get('x-sendr-password');
  if (pw) return attemptPassword(meta, pw);
  return false;
}

// What a visitor without access may see of a locked file: only that it exists.
export function lockedView(meta) {
  const pub = publicMeta(meta);
  if (!pub.protected) return pub;
  return {
    id: pub.id,
    status: pub.status,
    protected: true,
    createdAt: pub.createdAt,
    completedAt: pub.completedAt,
    name: '',
    type: '',
    size: null,
    note: '',
    sender: '',
    removedAt: pub.removedAt,
  };
}
