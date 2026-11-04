import Link from 'next/link';
import ReportForm from '@/components/report-form';

export const metadata = { title: 'Report a file' };

export default function ReportPage({ searchParams }) {
  const file = typeof searchParams?.file === 'string' ? searchParams.file : '';
  const kind = typeof searchParams?.kind === 'string' ? searchParams.kind : '';
  return (
    <section className="section">
      <div className="container legal">
        <p className="legal-kicker">Trust &amp; safety</p>
        <h1 className="section-title">Report a file</h1>
        <p className="legal-lead">
          Found something that infringes your copyright or breaks the law? Tell us and we will
          review it. Copyright notices follow our <Link href="/copyright">DMCA policy</Link>. If a
          child is in danger, contact your local police and{' '}
          <a href="https://report.cybertip.org" rel="noopener noreferrer" target="_blank">
            NCMEC CyberTipline
          </a>{' '}
          as well.
        </p>
        <ReportForm initialFile={file} initialKind={kind} />
      </div>
    </section>
  );
}
