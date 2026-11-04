import path from 'path';

const GiB = 1024 ** 3;
const TiB = 1024 ** 4;
const MIB = 1024 ** 2;

export const SITE_NAME = 'Sendr';

export const isVercel = Boolean(process.env.VERCEL);

// Default per-file limit: 1 TiB. Override with SENDR_MAX_BYTES.
export const MAX_BYTES = Number(process.env.SENDR_MAX_BYTES) || 1 * TiB;

// Vercel functions reject request bodies over ~4.5 MB, so chunks must stay below that there.
const chunkCeiling = isVercel ? 4 * MIB : 64 * MIB;
const rawChunk =
  Number(process.env.SENDR_CHUNK_SIZE) || (isVercel ? 4 * MIB : 16 * MIB);

export const CHUNK_SIZE = Math.min(Math.max(rawChunk, 256 * 1024), chunkCeiling);

// Chunk files are named c000000..c999999, so one file can have at most this many chunks.
export const MAX_CHUNKS = 999999;

// Pick the chunk size for one file: the configured size, grown (in whole MiB, up to the
// ceiling) when a huge file would otherwise need too many chunks.
export function chunkSizeFor(size) {
  let chunk = CHUNK_SIZE;
  if (Math.ceil(size / chunk) > MAX_CHUNKS) {
    chunk = Math.ceil(size / MAX_CHUNKS / MIB) * MIB;
  }
  return Math.min(chunk, chunkCeiling);
}

export const DATA_DIR =
  process.env.SENDR_DATA_DIR ||
  (isVercel ? '/tmp/sendr-data' : path.join(process.cwd(), '.sendr-data'));

export const PENDING_TTL_MS =
  (Number(process.env.SENDR_PENDING_TTL_HOURS) || 168) * 3600 * 1000;

export const TEXT_PREVIEW_LIMIT = 512 * 1024;

// Legal / moderation settings.
export const ADMIN_TOKEN = process.env.SENDR_ADMIN_TOKEN || '';
export const ABUSE_EMAIL = process.env.SENDR_ABUSE_EMAIL || '';
export const OPERATOR_NAME = process.env.SENDR_OPERATOR_NAME || 'the operator of this Sendr site';

export { GiB, TiB };
