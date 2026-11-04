import Link from 'next/link';
import { ABUSE_EMAIL, OPERATOR_NAME } from '@/lib/server/config';

export const LEGAL_UPDATED = 'November 3, 2026';

export function LegalPage({ title, children }) {
  return (
    <section className="section">
      <div className="container legal">
        <p className="legal-kicker">Legal · Last updated {LEGAL_UPDATED}</p>
        <h1 className="section-title">{title}</h1>
        <div className="legal-body">{children}</div>
        <nav className="legal-nav" aria-label="Legal">
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/copyright">Copyright &amp; DMCA</Link>
          <Link href="/report">Report a file</Link>
        </nav>
      </div>
    </section>
  );
}

export function Operator() {
  return <>{OPERATOR_NAME}</>;
}

export function AbuseContact() {
  if (ABUSE_EMAIL) {
    return <a href={`mailto:${ABUSE_EMAIL}`}>{ABUSE_EMAIL}</a>;
  }
  return <Link href="/report">the report form</Link>;
}
