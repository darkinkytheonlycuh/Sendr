'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LogoMark } from './ui';

const LINKS = [
  { href: '/#send', label: 'Send' },
  { href: '/#features', label: 'Features' },
  { href: '/#mine', label: 'Vault' },
  { href: '/#faq', label: 'FAQ' },
];

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setScrolled(window.scrollY > 12);
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);
  return (
    <header className={`nav ${scrolled ? 'scrolled' : ''}`.trim()}>
      <div className="container nav-inner">
        <Link href="/" className="logo" aria-label="Sendr home">
          <span className="logo-mark">
            <LogoMark />
          </span>
          <span className="wordmark">Sendr</span>
        </Link>
        <nav className="nav-links" aria-label="Primary">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="nav-link">
              {l.label}
            </Link>
          ))}
          <Link href="/#send" className="btn btn-primary btn-sm magnetic">
            Upload
          </Link>
        </nav>
      </div>
    </header>
  );
}
