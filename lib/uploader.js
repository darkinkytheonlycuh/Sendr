import { categoryOf } from './format';

const MINE_KEY = 'sendr:v1:mine';
const SESSIONS_KEY = 'sendr:v1:sessions';
export const TOKEN_HEADER = 'x-sendr-token';

export const ST = {
  queued: 'queued',
  initializing: 'initializing',
  uploading: 'uploading',
  paused: 'paused',
  finishing: 'finishing',
  done: 'done',
  error: 'error',
  canceled: 'canceled',
};

const safeGet = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
};
const safeSet = (key, val) => {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
};

export const loadMine = () => safeGet(MINE_KEY);
export const saveMine = (list) => safeSet(MINE_KEY, list);

export function addMine(entry) {
  const list = loadMine();
  list.unshift(entry);
  saveMine(list.slice(0, 300));
}

export function updateMine(id, patch) {
  saveMine(loadMine().map((m) => (m.id === id ? { ...m, ...patch } : m)));
}

export function removeMine(id) {
  saveMine(loadMine().filter((m) => m.id !== id));
}

export const loadSessions = () => safeGet(SESSIONS_KEY);
export const saveSessions = (list) => safeSet(SESSIONS_KEY, list);

export function saveSession(rec) {
  const list = loadSessions().filter((s) => s.id !== rec.id);
  list.unshift(rec);
  saveSessions(list.slice(0, 50));
}

export function removeSession(id) {
  saveSessions(loadSessions().filter((s) => s.id !== id));
}

export async function jfetch(url, opts = {}) {
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: { 'content-type': 'application/json', ...(opts.headers || {}) },
    body: opts.body,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) {
    const err = new Error(
      (data && (data.message || data.error)) || `HTTP ${res.status}`
    );
    err.status = res.status;
    err.code = data && data.error;
    throw err;
  }
  return data;
}

class Semaphore {
  constructor(n) {
    this.n = n;
    this.queue = [];
  }
  take() {
    if (this.n > 0) {
      this.n -= 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.queue.push(resolve));
  }
  give() {
    const next = this.queue.shift();
    if (next) next();
    else this.n += 1;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Parallel requests per file and across all files. Fewer on low-memory devices,
// since each in-flight chunk is held in memory by the browser.
function pickParallel() {
  const mem = typeof navigator !== 'undefined' ? navigator.deviceMemory : 0;
  if (mem && mem <= 1) return { perFile: 3, total: 4 };
  if (mem && mem <= 2) return { perFile: 4, total: 6 };
  return { perFile: 8, total: 12 };
}
export const PARALLEL = pickParallel();
const SIGN_BATCH = 32;



function bufToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuf(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function guessType(name) {
  const ext = /\.([a-z0-9]{1,9})$/i.exec(name || '');
  return ext ? '' : '';
}

export class UploadItem {
  constructor(file, opts = {}) {
    this.file = file;
    this.name = opts.displayName || file.name;
    this.size = file.size;
    this.type = file.type || guessType(file.name);
    this.category = categoryOf(this.type, this.name);
    this.password = opts.password || '';
    this.sender = opts.sender || null;
    this.resumeRec = opts.resumeRec || null;

    this.id = opts.resumeRec ? opts.resumeRec.id : null;
    this.token = opts.resumeRec ? opts.resumeRec.token : '';
    this.chunkSize = opts.resumeRec ? opts.resumeRec.chunkSize : 0;
    this.chunkCount = opts.resumeRec ? opts.resumeRec.chunkCount : 0;

    this.status = ST.queued;
    this.sent = 0;
    this.speed = 0;
    this.eta = Infinity;
    this.error = '';
    this.meta = null;

    this.mask = null;
    this.left = 0;
    this.inflight = new Map();
    this.aborters = new Map();
    this.ackedBytes = 0;
    this.fails = 0;
    this.gen = 0;
    this.finalizing = false;
    this.lastSent = 0;
    this.createdAt = Date.now();

    // Direct-to-storage uploads (presigned URLs). null = not tried yet.
    this.direct = null;
    this.directOk = 0;
    this.signed = new Map();
    this.signing = null;
  }

  // Presigned PUT URLs, fetched in batches for the next chunks to be sent.
  async signedUrl(index) {
    const hit = this.signed.get(index);
    if (hit && hit.until - Date.now() > 60000) return hit;
    if (!this.signing) {
      const want = [index];
      for (let i = 0; i < this.chunkCount && want.length < SIGN_BATCH; i += 1) {
        if (i !== index && this.mask[i] === 0 && !this.signed.has(i)) want.push(i);
      }
      this.signing = jfetch('/api/upload/sign', {
        method: 'POST',
        body: JSON.stringify({ id: this.id, token: this.token, indexes: want }),
      })
        .then((res) => {
          if (res.mode !== 'direct') {
            this.direct = false;
            return;
          }
          for (const [k, url] of Object.entries(res.urls || {})) {
            this.signed.set(Number(k), {
              url,
              until: res.validUntil || Date.now() + 3600000,
              access: res.access,
              storeId: res.storeId,
            });
          }
        })
        .finally(() => {
          this.signing = null;
        });
    }
    await this.signing;
    if (this.direct === false) return null;
    return this.signed.get(index) || this.signedUrl(index);
  }

  chunkBytesOf(i) {
    if (i < this.chunkCount - 1) return this.chunkSize;
    const remainder = this.size % this.chunkSize;
    return remainder === 0 ? this.chunkSize : remainder;
  }

  claim() {
    for (let i = 0; i < this.chunkCount; i += 1) {
      if (this.mask[i] === 0 && !this.inflight.has(i)) {
        this.inflight.set(i, 0);
        return i;
      }
    }
    return -1;
  }

  release(i) {
    this.inflight.delete(i);
  }

  recompute() {
    let inflightBytes = 0;
    for (const loaded of this.inflight.values()) inflightBytes += loaded;
    this.sent = this.ackedBytes + inflightBytes;
  }

  async putChunk(index) {
    if (this.direct !== false) {
      let signed = null;
      try {
        signed = await this.signedUrl(index);
      } catch {
        signed = null;
      }
      if (signed) {
        try {
          await this.sendChunk(index, signed);
          this.direct = true;
          this.directOk += 1;
          return;
        } catch (err) {
          if (err.aborted) throw err;
          this.signed.delete(index);
          // Never worked (e.g. storage rejects browser uploads): use the server route.
          if (this.directOk === 0) this.direct = false;
          else throw Object.assign(err, { network: true, status: undefined });
        }
      } else if (this.direct === null) {
        this.direct = false;
      }
    }
    return this.sendChunk(index, null);
  }

  sendChunk(index, signed) {
    const start = index * this.chunkSize;
    const end = Math.min(this.size, start + this.chunkSize);
    const sendBlob = this.file.slice(start, end);
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      this.aborters.set(index, xhr);
      if (signed) {
        // Same request the @vercel/blob SDK makes for a presigned PUT.
        xhr.open('PUT', signed.url);
        xhr.setRequestHeader('x-api-version', '12');
        xhr.setRequestHeader('x-vercel-blob-access', signed.access);
        xhr.setRequestHeader('x-vercel-blob-store-id', signed.storeId);
        xhr.setRequestHeader('x-api-blob-request-id', `${signed.storeId}:${Date.now()}:${Math.random().toString(16).slice(2)}`);
        xhr.setRequestHeader('x-api-blob-request-attempt', '0');
        xhr.setRequestHeader('x-content-length', String(end - start));
      } else {
        xhr.open('PUT', `/api/upload/chunk?id=${this.id}&index=${index}`);
        xhr.setRequestHeader(TOKEN_HEADER, this.token);
        xhr.setRequestHeader('content-type', 'application/octet-stream');
      }
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) {
          this.inflight.set(index, ev.loaded);
          this.recompute();
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          let msg = `HTTP ${xhr.status}`;
          try {
            const d = JSON.parse(xhr.responseText || '{}');
            msg = d.message || d.error || msg;
          } catch {}
          const err = new Error(msg);
          err.status = xhr.status;
          reject(err);
        }
      };
      xhr.onerror = () => reject(Object.assign(new Error('Network error'), { network: true }));
      xhr.ontimeout = () => reject(Object.assign(new Error('Timed out'), { network: true }));
      xhr.onabort = () => reject(Object.assign(new Error('Paused'), { aborted: true }));
      xhr.send(sendBlob);
    }).finally(() => {
      this.aborters.delete(index);
    });
  }

  abortAll() {
    for (const xhr of this.aborters.values()) {
      try {
        xhr.abort();
      } catch {}
    }
    this.aborters.clear();
    this.inflight.clear();
    this.recompute();
  }

  async start(sem, handlers) {
    if (this.gen > 0 && this.status !== ST.paused) return;
if (!this.id) {
      this.status = ST.initializing;
      this.gen += 1;
      handlers.change?.();
      const doInit = async (sender) => {
        const res = await jfetch('/api/upload/init', {
          method: 'POST',
          body: JSON.stringify({
            name: this.name,
            size: this.size,
            type: this.type,
            password: this.password,
            sender: sender || undefined,
            acceptTerms: true,
          }),
        });
        this.id = res.id;
        this.token = res.token;
        this.chunkSize = res.chunkSize;
        this.chunkCount = res.chunkCount;
        this.mask = new Uint8Array(this.chunkCount);
        this.left = this.chunkCount;
        this.ackedBytes = 0;
        this.meta = res.meta || null;
        saveSession(this.snapshot());
      };
      try {
        await doInit(this.sender);
      } catch (err) {
        if (err.code === 'bad_identity' && this.sender) {
          this.sender = null;
          handlers.identityRejected?.();
          try {
            await doInit(null);
          } catch (err2) {
            this.status = ST.error;
            this.error = err2.message || 'Could not start upload';
            handlers.change?.();
            return;
          }
        } else {
          this.status = ST.error;
          this.error = err.message || 'Could not start upload';
          handlers.change?.();
          return;
        }
      }
    }
    this.status = ST.uploading;
    this.gen += 1;
    handlers.change?.();
    const myGen = this.gen;
    const worker = () => this.workerLoop(sem, handlers, myGen);
    const n = Math.max(1, Math.min(PARALLEL.perFile, this.left || this.chunkCount));
    await Promise.all(Array.from({ length: n }, worker));
    if (myGen === this.gen && this.status === ST.uploading) {
      await this.finalize(handlers);
    }
  }

  async workerLoop(sem, handlers, myGen) {
    for (;;) {
      if (this.status !== ST.uploading || myGen !== this.gen) return;
      if (this.left <= 0) return;
      await sem.take();
      if (this.status !== ST.uploading || myGen !== this.gen) {
        sem.give();
        return;
      }
      const idx = this.claim();
      if (idx < 0) {
        sem.give();
        return;
      }
      try {
        await this.putChunk(idx);
        this.mask[idx] = 1;
        this.left -= 1;
        this.ackedBytes += this.chunkBytesOf(idx);
        this.release(idx);
        this.fails = 0;
      } catch (err) {
        this.release(idx);
        sem.give();
        if (err.aborted) return;
        this.fails += 1;
        const fatal =
          err.status && err.status >= 400 && err.status < 500 && err.status !== 429;
        if (fatal || this.fails > 6) {
          this.status = ST.error;
          this.error = err.message || 'Upload failed';
          handlers.change?.();
          return;
        }
        await sleep(Math.min(600 * 2 ** (this.fails - 1), 8000));
        continue;
      }
      sem.give();
    }
  }

  async finalize(handlers) {
    if (this.finalizing) return;
    this.finalizing = true;
    this.status = ST.finishing;
    handlers.change?.();
    try {
      let res;
      for (let attempt = 0; ; attempt += 1) {
        try {
          res = await jfetch('/api/upload/complete', {
            method: 'POST',
            body: JSON.stringify({ id: this.id, token: this.token }),
          });
          break;
        } catch (err) {
          if (err.code !== 'incomplete' || attempt >= 4) throw err;
          await sleep(700 * (attempt + 1));
        }
      }
      this.meta = res.meta;
      this.status = ST.done;
      this.sent = this.size;
      removeSession(this.id);
      addMine({
        id: this.id,
        token: this.token,
        name: this.name,
        size: this.size,
        date: Date.now(),
      });
      handlers.change?.();
      handlers.onDone?.(this);
    } catch (err) {
      this.status = ST.error;
      this.error = err.message || 'Could not finalize';
      handlers.change?.();
    } finally {
      this.finalizing = false;
    }
  }

  pause() {
    if (this.status !== ST.uploading && this.status !== ST.queued) return;
    this.status = ST.paused;
    this.abortAll();
  }

  resumeFromPause(sem, handlers) {
    if (this.status !== ST.paused) return;
    this.start(sem, handlers);
  }

  cancel(handlers) {
    const wasId = this.id;
    const wasToken = this.token;
    this.status = ST.canceled;
    this.abortAll();
    if (wasId && wasToken) {
      jfetch('/api/upload/abort', {
        method: 'POST',
        body: JSON.stringify({ id: wasId, token: wasToken }),
      }).catch(() => {});
    }
    if (wasId) removeSession(wasId);
    handlers?.change?.();
  }

  snapshot() {
    return {
      id: this.id,
      token: this.token,
      name: this.name,
      size: this.size,
      type: this.type,
      chunkSize: this.chunkSize,
      chunkCount: this.chunkCount,
      date: this.createdAt,
    };
  }
}

export class UploadManager {
  constructor(handlers = {}) {
    this.items = [];
    this.handlers = handlers;
    this.sem = new Semaphore(PARALLEL.total);
    this.timer = setInterval(() => this.sample(), 400);
  }

  add(file, password = '', displayName = '', sender = null) {
    const item = new UploadItem(file, { password, displayName, sender });
    this.items.push(item);
    this.handlers.change?.();
    item.start(this.sem, this.handlers);
    return item;
  }

  async resumeUpload(rec, file) {
    const item = new UploadItem(file, { resumeRec: rec });
    item.status = ST.initializing;
    item.type = file.type || rec.type;
    item.category = categoryOf(item.type, item.name);
    this.items.push(item);
    this.handlers.change?.();
    try {
      const res = await jfetch('/api/upload/resume', {
        method: 'POST',
        body: JSON.stringify({ id: rec.id, token: rec.token }),
      });
      if (res.already) {
        item.meta = res.meta;
        item.status = ST.done;
        item.sent = item.size;
        removeSession(rec.id);
        addMine({
          id: rec.id,
          token: rec.token,
          name: rec.name,
          size: rec.size,
          date: rec.date || Date.now(),
        });
        this.handlers.change?.();
        this.handlers.onDone?.(item);
        return item;
      }
      item.chunkSize = res.meta.chunkSize;
      item.chunkCount = res.meta.chunkCount;
      item.mask = new Uint8Array(item.chunkCount);
      item.left = item.chunkCount;
      for (const i of res.have) {
        if (i >= 0 && i < item.chunkCount) {
          item.mask[i] = 1;
          item.left -= 1;
          item.ackedBytes += item.chunkBytesOf(i);
        }
      }
      item.recompute();
      item.start(this.sem, this.handlers);
    } catch (err) {
      item.status = ST.error;
      item.error = err.message || 'Resume failed';
      this.handlers.change?.();
    }
    return item;
  }

  sample() {
    let dirty = false;
    for (const item of this.items) {
      if (item.status !== ST.uploading) continue;
      item.recompute();
      const delta = Math.max(0, item.sent - item.lastSent);
      const inst = delta * 2.5;
      item.speed = item.speed ? item.speed * 0.7 + inst * 0.3 : inst;
      item.eta = item.speed > 1024 ? (item.size - item.sent) / item.speed : Infinity;
      item.lastSent = item.sent;
      dirty = true;
    }
    if (dirty) this.handlers.progress?.();
  }

  isActive() {
    return this.items.some(
      (i) =>
        i.status === ST.uploading ||
        i.status === ST.initializing ||
        i.status === ST.finishing ||
        i.status === ST.queued
    );
  }

  drop(item) {
    this.items = this.items.filter((i) => i !== item);
    this.handlers.change?.();
  }

  dispose() {
    clearInterval(this.timer);
  }
}

export async function filesFromDataTransfer(dt) {
  const out = [];
  const entries = [];
  const items = dt && dt.items;
  if (items && items.length && items[0].webkitGetAsEntry) {
    for (let i = 0; i < items.length; i += 1) {
      const entry = items[i].webkitGetAsEntry && items[i].webkitGetAsEntry();
      if (entry) entries.push(entry);
    }
  }
  if (!entries.length) {
    const files = Array.from((dt && dt.files) || []);
    return files.map((file) => ({ file, path: '' }));
  }
  const readAll = (reader) =>
    new Promise((resolve, reject) => reader.readEntries(resolve, reject));
  const entryFile = (entry) =>
    new Promise((resolve, reject) => entry.file(resolve, reject));
  const walk = async (entry, prefix) => {
    if (entry.isFile) {
      try {
        const file = await entryFile(entry);
        out.push({ file, path: prefix + file.name });
      } catch {}
      return;
    }
    if (entry.isDirectory) {
      const reader = entry.createReader();
      for (;;) {
        let batch = [];
        try {
          batch = await readAll(reader);
        } catch {
          return;
        }
        if (!batch.length) return;
        for (const child of batch) {
          await walk(child, `${prefix}${entry.name}/`);
        }
      }
    }
  };
  for (const entry of entries) {
    await walk(entry, '');
  }
  return out;
}
