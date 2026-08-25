import path from 'path';

const GiB = 1024 ** 3;
const MIB = 1024 ** 2;

export const SITE_NAME = 'Sendr';

const isVercel = Boolean(process.env.VERCEL);

export const MAX_BYTES =
  Number(process.env.SENDR_MAX_BYTES) || 200 * GiB;

const rawChunk =
  Number(process.env.SENDR_CHUNK_SIZE) || (isVercel ? 4 * MIB : 16 * MIB);
const chunkCeiling = isVercel ? 4 * MIB : 64 * MIB;

export const CHUNK_SIZE = Math.min(Math.max(rawChunk, 256 * 1024), chunkCeiling);

export const DATA_DIR =
  process.env.SENDR_DATA_DIR ||
  (isVercel ? '/tmp/sendr-data' : path.join(process.cwd(), '.sendr-data'));

export const PENDING_TTL_MS =
  (Number(process.env.SENDR_PENDING_TTL_HOURS) || 168) * 3600 * 1000;

export const TEXT_PREVIEW_LIMIT = 512 * 1024;
