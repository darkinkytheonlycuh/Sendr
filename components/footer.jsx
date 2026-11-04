import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="footer">
      <hr className="divider-glow" />
      <div className="container footer-inner" style={{ paddingTop: 28 }}>
        <span>
          SENDR © {new Date().getFullYear()} — your files, your links,{' '}
          <b style={{ color: 'var(--tx-2)' }}>forever</b>.
        </span>
        <nav className="footer-links" aria-label="Legal">
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/copyright">Copyright &amp; DMCA</Link>
          <Link href="/report">Report a file</Link>
        </nav>
      </div>
    </footer>
  );
}
