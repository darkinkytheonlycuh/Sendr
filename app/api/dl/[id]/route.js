import { canRead } from '@/lib/server/access';
import { TEXT_PREVIEW_LIMIT } from '@/lib/server/config';
import {
  parseRange,
  patchMeta,
  rangeStream,
  readMeta,
} from '@/lib/server/store';
import {
  HttpError,
  contentDisposition,
  fail,
  getIp,
  handleError,
  isValidId,
  metaMissingResponse,
  rateLimit,
  sleep,
  verifyPassword,
} from '@/lib/server/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const INLINE_RE =
  /^(image\/(png|jpeg|jpg|gif|webp|avif|bmp|x-icon|vnd\.microsoft\.icon)|video\/[a-z0-9.+-]+|audio\/[a-z0-9.+-]+|application\/pdf|text\/plain)\s*$/i;

function inlineSafe(type) {
  if (!type) return false;
  if (/html|xml|svg/i.test(type)) return false;
  return INLINE_RE.test(type.trim());
}

export async function GET(req, { params }) {
  try {
    if (!isValidId(params.id)) return fail(400, 'bad_request');
    if (!rateLimit(`dl:${getIp(req)}`, 900, 60000)) return fail(429, 'slow_down');

    let meta;
    try {
      meta = await readMeta(params.id);
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        return metaMissingResponse();
      }
      throw err;
    }
    if (meta.status === 'removed') {
      return fail(451, 'removed', 'This file was removed after a legal or policy complaint');
    }
    if (meta.status !== 'ready') return fail(409, 'not_ready');

    const url = new URL(req.url);
    if (!(await canRead(req, meta))) {
      return Response.json(
        { error: 'locked', message: 'This file is locked. Unlock it on its download page.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const wantInline =
      url.searchParams.get('disp') === 'inline' && inlineSafe(meta.type);
    const ctype = wantInline ? meta.type.trim() : 'application/octet-stream';
    const size = meta.size;

    const range = parseRange(req.headers.get('range'), size);
    if (range && range.unsatisfiable) {
      return new Response(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${size}` },
      });
    }

    let start = 0;
    let end = size - 1;
    if (range) {
      start = range.start;
      end = range.end;
    }
    if (wantInline && ctype.startsWith('text/plain')) {
      const max = Math.min(
        Number(url.searchParams.get('max')) || 0,
        TEXT_PREVIEW_LIMIT
      );
      if (max > 0 && end - start + 1 > max) end = start + max - 1;
    }

    // nocount=1: a piece of a parallel download (counted once by /plan).
    const isFullDownload =
      !wantInline && (!range || range.start === 0) && url.searchParams.get('nocount') !== '1';
    if (isFullDownload) {
      patchMeta(meta.id, (m) => {
        m.downloads = (m.downloads || 0) + 1;
      }).catch(() => {});
    }

    const etag = `"${meta.id}"`;
    if (!range && req.headers.get('if-none-match') === etag) {
      return new Response(null, {
        status: 304,
        headers: { ETag: etag },
      });
    }

    const headers = new Headers();
    headers.set('Content-Type', ctype);
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Content-Length', String(end - start + 1));
    headers.set(
      'Content-Disposition',
      contentDisposition(meta.name, wantInline)
    );
    headers.set('ETag', etag);
    headers.set(
      'Last-Modified',
      new Date(meta.createdAt || Date.now()).toUTCString()
    );
    // Locked files must never sit in a shared cache.
    headers.set('Cache-Control', wantInline && !meta.passwordHash ? 'private, max-age=3600' : 'no-store');
    // Uploaded bytes are never allowed to run as a page on this site.
    // (Chrome refuses to render PDFs under a CSP sandbox, so PDFs get the rest.)
    const isPdf = wantInline && /^application\/pdf/i.test(ctype);
    headers.set(
      'Content-Security-Policy',
      `default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'self'${isPdf ? '' : '; sandbox'}`
    );
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Cross-Origin-Resource-Policy', 'same-origin');
    headers.set('Referrer-Policy', 'no-referrer');
    if (range) {
      headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
    }

    const stream = rangeStream(meta, start, end);
    return new Response(stream, { status: range ? 206 : 200, headers });
  } catch (err) {
    return handleError(err);
  }
}

