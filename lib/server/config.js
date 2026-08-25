import path from 'path';

const GiB = 1024 ** 3;

export const SITE_NAME = 'Sendr';

export const MAX_BYTES =
  Number(process.env.SENDR_MAX_BYTES) || 50 * GiB;

export const CHUNK_SIZE = Math.min(
  Math.max(Number(process.env.SENDR_CHUNK_SIZE) || 8 * 1024 ** 2, 256 * 1024),
  64 * 1024 ** 2
);

export const DATA_DIR =
  process.env.SENDR_DATA_DIR || path.join(process.cwd(), '.sendr-data');

export const PENDING_TTL_MS =
  (Number(process.env.SENDR_PENDING_TTL_HOURS) || 168) * 3600 * 1000;

export const TEXT_PREVIEW_LIMIT = 512 * 1024;
