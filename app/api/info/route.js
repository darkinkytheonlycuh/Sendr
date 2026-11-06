import { CHUNK_SIZE, MAX_BYTES, isVercel } from '@/lib/server/config';
import { blobMode, r2Mode } from '@/lib/server/store';
import { SECRET_STRONG } from '@/lib/server/secret';
import { fail, getIp, handleError, json, rateLimit } from '@/lib/server/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    if (!rateLimit(`info:${getIp(req)}`, 60, 60000)) {
      return fail(429, 'slow_down');
    }
    return json({
      ok: true,
      maxBytes: MAX_BYTES,
      chunkSize: CHUNK_SIZE,
      storage: r2Mode ? 'r2' : blobMode ? 'blob' : 'local',
      // Local disk on Vercel is per-instance /tmp: files vanish, so links cannot last.
      persistent: Boolean(r2Mode || blobMode || !isVercel),
      secretConfigured: SECRET_STRONG,
    });
  } catch (err) {
    return handleError(err);
  }
}
