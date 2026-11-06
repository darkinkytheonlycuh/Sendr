import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { DATA_DIR, isVercel } from './config';

// One server-side secret signs download tokens and hides storage paths.
// Set SENDR_SECRET (a long random string) in production. Without it, the
// storage token is used, which is equally secret and never leaves the server.
function loadSecret() {
  const fromEnv =
    process.env.SENDR_SECRET || process.env.BLOB_READ_WRITE_TOKEN || process.env.R2_SECRET_ACCESS_KEY;
  if (fromEnv) return { value: fromEnv, strong: true };
  if (!isVercel) {
    // Self-hosted: create one on first run and keep it next to the data.
    const file = path.join(DATA_DIR, '.secret');
    try {
      const v = readFileSync(file, 'utf8').trim();
      if (v.length >= 32) return { value: v, strong: true };
    } catch {}
    try {
      mkdirSync(DATA_DIR, { recursive: true });
      const v = randomBytes(32).toString('hex');
      writeFileSync(file, v, { mode: 0o600 });
      return { value: v, strong: true };
    } catch {}
  }
  try {
    console.error('[sendr] SENDR_SECRET is not set: download links for locked files will not survive restarts.');
  } catch {}
  return { value: randomBytes(32).toString('hex'), strong: false, ephemeral: true };
}

const loaded = loadSecret();
export const SECRET = loaded.value;
export const SECRET_STRONG = loaded.strong;
// Path tags must stay the same across instances, so an ephemeral secret is not
// used for them.
export const PATH_KEY = loaded.ephemeral ? 'sendr-path-v1' : `path:${SECRET}`;

const b64 = (buf) => buf.toString('base64url');

export function sign(purpose, data) {
  return b64(createHmac('sha256', `${purpose}:${SECRET}`).update(data).digest()).slice(0, 43);
}

export function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

// Download access tokens for password-protected files. They replace sending
// the password itself in URLs. A token is bound to the file and to its current
// password, so changing or removing the password revokes every token.
export const ACCESS_TTL_MS = 12 * 3600 * 1000;

export function makeAccessToken(meta, ttl = ACCESS_TTL_MS) {
  const exp = Date.now() + ttl;
  const e = exp.toString(36);
  return `${e}.${sign('dl', `${meta.id}|${e}|${meta.passwordHash || ''}`)}`;
}

export function checkAccessToken(meta, token) {
  if (typeof token !== 'string' || token.length > 100) return false;
  const [e, sig] = token.split('.');
  if (!e || !sig) return false;
  const exp = parseInt(e, 36);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  return safeEqual(sig, sign('dl', `${meta.id}|${e}|${meta.passwordHash || ''}`));
}
