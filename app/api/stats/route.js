import { listMetaIds, readMeta, sweepPending } from '@/lib/server/store';
import { fail, getIp, handleError, json, rateLimit } from '@/lib/server/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let cache = { t: 0, data: null };

export async function GET(req) {
  try {
    if (!rateLimit(`stats:${getIp(req)}`, 30, 60000)) {
      return fail(429, 'slow_down');
    }
    const now = Date.now();
    if (cache.data && now - cache.t < 10000) return json(cache.data);

    const ids = await listMetaIds();
    let files = 0;
    let bytes = 0;
    let downloads = 0;
    let pending = 0;
    for (const id of ids) {
      try {
        const m = await readMeta(id);
        if (m.status === 'ready') {
          files += 1;
          bytes += m.size || 0;
          downloads += m.downloads || 0;
        } else if (m.status === 'pending') {
          pending += 1;
        }
      } catch {}
    }
    const data = {
      ok: true,
      files,
      bytes,
      downloads,
      pending,
      generatedAt: now,
    };
    cache = { t: now, data };
    sweepPending().catch(() => {});
    return json(data);
  } catch (err) {
    return handleError(err);
  }
}
