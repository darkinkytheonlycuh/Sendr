import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

export function newId(len = 12) {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i += 1) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

export function isValidId(id) {
  return typeof id === 'string' && /^[a-z0-9]{6,40}$/.test(id);
}

export function newToken() {
  return randomBytes(24).toString('base64url');
}

export function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(String(password), salt, 32).toString('hex');
  return { salt, hash };
}

export function verifyPassword(meta, password) {
  if (!meta.passwordHash || !meta.passwordSalt || !password) return false;
  try {
    const test = scryptSync(String(password), meta.passwordSalt, 32);
    const real = Buffer.from(meta.passwordHash, 'hex');
    return test.length === real.length && timingSafeEqual(test, real);
  } catch {
    return false;
  }
}

export class HttpError extends Error {
  constructor(status, code, message, extra) {
    super(message || code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export function json(data, init) {
  return Response.json(data, init);
}

export function fail(status, code, extra) {
  const body = { error: code };
  if (extra !== undefined) body.detail = extra;
  return Response.json(body, { status });
}

export function handleError(err) {
  const status =
    err instanceof HttpError ? err.status : err.status || err.statusCode || 500;
  if (status >= 500) console.error('[sendr]', err);
  const body = { error: err.code || 'internal_error', message: err.message };
  if (err.extra !== undefined) body.detail = err.extra;
  return Response.json(body, { status });
}

export async function readJson(req, limit = 64 * 1024) {
  let text;
  try {
    text = await req.text();
  } catch {
    throw new HttpError(400, 'bad_request');
  }
  if (text.length > limit) throw new HttpError(413, 'payload_too_large');
  try {
    return JSON.parse(text || '{}');
  } catch {
    throw new HttpError(400, 'bad_json');
  }
}

export function getIp(req) {
  const xf = req.headers.get('x-forwarded-for');
  if (xf) return xf.split(',')[0].trim();
  return 'local';
}

const buckets = new Map();

export function rateLimit(key, max, windowMs) {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now > bucket.reset) {
    bucket = { n: 0, reset: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.n += 1;
  return bucket.n <= max;
}

const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now > bucket.reset) buckets.delete(key);
  }
}, 60000);
if (typeof sweeper.unref === 'function') sweeper.unref();

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function metaMissingResponse() {
  const body = { error: 'not_found' };
  if (process.env.VERCEL) {
    body.message =
      'Serverless instances do not share storage (/tmp is per-instance). Host Sendr somewhere with a persistent disk for uploads to work reliably.';
  }
  return Response.json(body, { status: 404 });
}

export function sanitizeName(name) {
  return String(name || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .slice(0, 200)
    .trim();
}

export function sanitizeUserName(name) {
  if (typeof name !== 'string') return '';
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (!/^[A-Za-z0-9_.\- ]{2,24}$/.test(trimmed)) return '';
  if (/^[._\- ]+$/.test(trimmed)) return '';
  return trimmed;
}

export function contentDisposition(name, inline) {
  const clean = String(name || 'file').replace(/[\r\n]/g, '');
  const fallback =
    clean
      .replace(/[^\x20-\x7e]/g, '_')
      .replace(/["\\]/g, "'")
      .replace(/^\.+/, '')
      .trim() || 'file';
  const encoded = encodeURIComponent(clean).replace(
    /['()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()
  );
  const type = inline ? 'inline' : 'attachment';
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
