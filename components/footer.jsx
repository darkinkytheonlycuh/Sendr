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
        <span>
          No accounts · No trackers · Built custom with{' '}
          <span className="heart" aria-hidden="true">
            ♥
          </span>{' '}
          and zero third-party services.{' '}
          <Link href="/#faq" style={{ color: 'var(--tx-2)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
            How?
          </Link>
        </span>
      </div>
    </footer>
  );
}
