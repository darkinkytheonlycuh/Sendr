'use client';

import Link from 'next/link';
import { LogoMark } from './ui';

const LINKS = [
  { href: '/#send', label: 'Send' },
  { href: '/#features', label: 'Features' },
  { href: '/#mine', label: 'Vault' },
  { href: '/#faq', label: 'FAQ' },
];

export default function Nav() {
  return (
    <header className="nav">
      <div className="container nav-inner">
        <Link href="/" className="logo" aria-label="Sendr home">
          <span className="logo-mark">
            <LogoMark />
          </span>
          <span className="wordmark">SENDR</span>
        </Link>
        <nav className="nav-links" aria-label="Primary">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="nav-link">
              {l.label}
            </Link>
          ))}
          <Link href="/#send" className="btn btn-primary btn-sm">
            Upload
          </Link>
        </nav>
      </div>
    </header>
  );
}
