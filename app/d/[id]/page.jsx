import { publicMeta, readMeta } from '@/lib/server/store';
import { isValidId } from '@/lib/server/util';
import { fmtBytes } from '@/lib/format';
import { DownloadView, NotFoundView, PendingGate, RemovedView } from '@/components/download';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  try {
    if (!isValidId(params.id)) return { title: 'Send not found' };
    const meta = await readMeta(params.id);
    if (meta && meta.status === 'removed') return { title: 'File removed', robots: { index: false } };
    if (meta && meta.status === 'ready') {
      return {
        title: `${meta.name} · ${fmtBytes(meta.size)}`,
        description: `A forever link sent with Sendr — ${fmtBytes(meta.size)}, never expires.`,
      };
    }
  } catch {}
  return { title: 'Send not found' };
}

export default async function DownloadPage({ params }) {
  if (!isValidId(params.id)) return <NotFoundView />;
  let meta = null;
  try {
    meta = await readMeta(params.id);
  } catch {}
  if (!meta || meta.status === 'aborted') return <NotFoundView />;
  if (meta.status === 'removed') return <RemovedView />;
  if (meta.status === 'pending') {
    return <PendingGate initial={publicMeta(meta)} />;
  }
  const pub = publicMeta(meta);
  // A locked file's note is only revealed after the password is entered.
  if (pub.protected) pub.note = '';
  return <DownloadView meta={pub} />;
}
