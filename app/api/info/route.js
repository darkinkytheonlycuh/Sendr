import { CHUNK_SIZE, MAX_BYTES } from '@/lib/server/config';
import { blobMode, r2Mode } from '@/lib/server/store';
import { handleError, json } from '@/lib/server/util';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return json({
      ok: true,
      maxBytes: MAX_BYTES,
      chunkSize: CHUNK_SIZE,
      storage: r2Mode ? 'r2' : blobMode ? 'blob' : 'local',
    });
  } catch (err) {
    return handleError(err);
  }
}
