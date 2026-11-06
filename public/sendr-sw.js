/* Sendr parallel downloader.
 *
 * A download link of the form /__sendr_dl/<id>?t=<access token> is answered here, inside
 * the browser: chunks are fetched several at a time (straight from storage when
 * the server hands out presigned URLs, otherwise as byte ranges from /api/dl)
 * and streamed to the browser's own download manager in order. Memory use stays
 * bounded at roughly (parallel requests x chunk size).
 *
 * If anything about the plan fails, the request falls through to the normal
 * single-stream /api/dl download.
 */

const PREFIX = '/__sendr_dl/';
const BATCH = 256;
const RETRIES = 5;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(PREFIX)) return;
  event.respondWith(handle(url));
});

const progress = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('sendr-dl') : null;

const tq = (t) => (t ? `&t=${encodeURIComponent(t)}` : '');

function fallbackUrl(id, t) {
  return `/api/dl/${id}?dl=1${tq(t)}`;
}

async function getPlan(id, t, from, start) {
  const res = await fetch(`/api/dl/${id}/plan`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ t, from, count: BATCH, start: Boolean(start) }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`plan ${res.status}`);
  return res.json();
}

function pickParallel(conc) {
  const mem = self.navigator && self.navigator.deviceMemory;
  if (mem && mem <= 1) return Math.min(conc, 3);
  if (mem && mem <= 2) return Math.min(conc, 4);
  return conc;
}

async function handle(url) {
  const id = url.pathname.slice(PREFIX.length).split('/')[0];
  const t = url.searchParams.get('t') || '';
  const job = url.searchParams.get('job') || '';
  if (!/^[a-z0-9]{6,40}$/.test(id)) return new Response('Bad link', { status: 400 });

  let plan;
  try {
    plan = await getPlan(id, t, 0, true);
  } catch {
    return fetch(fallbackUrl(id, t));
  }
  if (!plan || !plan.ok || !plan.chunkCount) return fetch(fallbackUrl(id, t));

  const { size, chunkSize, chunkCount } = plan;
  let direct = plan.mode === 'direct';
  const batches = new Map(); // batch start -> Promise<{urls}>
  if (direct) batches.set(0, Promise.resolve(plan));
  const controller = new AbortController();
  const parallel = pickParallel(direct ? 8 : 6);

  const chunkLen = (i) => (i < chunkCount - 1 ? chunkSize : size - chunkSize * (chunkCount - 1));

  const urlFor = async (i, fresh) => {
    const b = Math.floor(i / BATCH) * BATCH;
    if (fresh || !batches.has(b)) {
      const p = getPlan(id, t, b, false);
      batches.set(b, p);
      p.catch(() => batches.delete(b));
    }
    const got = await batches.get(b);
    if (!got || got.mode !== 'direct' || !got.urls || !got.urls[i]) throw new Error('no url');
    return got.urls[i];
  };

  const fetchChunk = async (i) => {
    const want = chunkLen(i);
    let lastErr;
    for (let attempt = 0; attempt < RETRIES; attempt += 1) {
      if (controller.signal.aborted) throw new Error('aborted');
      try {
        let res;
        if (direct) {
          try {
            res = await fetch(await urlFor(i, attempt > 0), { signal: controller.signal, cache: 'no-store' });
            if (!res.ok) throw new Error(`direct ${res.status}`);
          } catch (err) {
            if (controller.signal.aborted) throw err;
            // Storage refused (CORS, expired URL...): this chunk and the rest go via the server.
            if (attempt >= 1) direct = false;
            throw err;
          }
        } else {
          const s = i * chunkSize;
          res = await fetch(`/api/dl/${id}?nocount=1${tq(t)}`, {
            headers: { Range: `bytes=${s}-${s + want - 1}` },
            signal: controller.signal,
            cache: 'no-store',
          });
          if (!res.ok) throw new Error(`proxy ${res.status}`);
        }
        const buf = new Uint8Array(await res.arrayBuffer());
        if (buf.byteLength !== want) throw new Error(`short chunk ${buf.byteLength}/${want}`);
        return buf;
      } catch (err) {
        lastErr = err;
        if (controller.signal.aborted) throw err;
        await new Promise((r) => setTimeout(r, Math.min(400 * 2 ** attempt, 5000)));
      }
    }
    throw lastErr;
  };

  let next = 0;
  let cur = 0;
  let sent = 0;
  let lastPost = 0;
  const pending = new Map();
  const launch = () => {
    while (pending.size < parallel && next < chunkCount) {
      const i = next;
      next += 1;
      const p = fetchChunk(i);
      p.catch(() => {});
      pending.set(i, p);
    }
  };

  const post = (done) => {
    if (!progress || !job) return;
    const now = Date.now();
    if (!done && now - lastPost < 250) return;
    lastPost = now;
    progress.postMessage({ job, id, loaded: sent, size, done: Boolean(done) });
  };

  const stream = new ReadableStream(
    {
      async pull(ctrl) {
        if (cur >= chunkCount) {
          post(true);
          ctrl.close();
          return;
        }
        launch();
        try {
          const buf = await pending.get(cur);
          pending.delete(cur);
          cur += 1;
          launch();
          sent += buf.byteLength;
          post(false);
          ctrl.enqueue(buf);
        } catch (err) {
          controller.abort();
          if (progress && job) progress.postMessage({ job, id, error: true });
          ctrl.error(err);
        }
      },
      cancel() {
        controller.abort();
        if (progress && job) progress.postMessage({ job, id, canceled: true });
      },
    },
    { highWaterMark: 0 }
  );

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(size),
      'Content-Disposition': plan.disposition,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
