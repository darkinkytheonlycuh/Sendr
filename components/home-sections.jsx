'use client';

import { useEffect, useState } from 'react';
import { Counter, Reveal, Tilt } from './fx';
import { Btn, IconArrowDown } from './ui';
import { fmtBytes } from '@/lib/format';

const FEATURES = [
  {
    title: 'Forever links',
    text: 'Links never expire and files are never auto-deleted. Send it once — it stays up for as long as you want it to.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
        <path d="M6 12c0-2.2 1.8-4 4-4 3 0 5 8 8 8 2.2 0 4-1.8 4-4s-1.8-4-4-4c-3 0-5 8-8 8-2.2 0-4-1.8-4-4z" transform="translate(-2 0)" />
      </svg>
    ),
  },
  {
    title: 'Up to 50 GB per file',
    text: 'Custom chunked-transfer engine slices huge files into pieces and streams them up with retries baked in.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="6" rx="7.5" ry="3" />
        <path d="M4.5 6v6c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3V6" />
        <path d="M4.5 12v6c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3v-6" />
      </svg>
    ),
  },
  {
    title: 'Resumable transfers',
    text: 'Paused? Browser closed? Connection dropped? Resume exactly where you left off — even after a refresh.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 11a8 8 0 1 0-2.34 6.34" />
        <path d="M20 5v6h-6" />
      </svg>
    ),
  },
  {
    title: 'Password locks',
    text: 'Wrap any send in a password. Links stay unguessable and your file stays yours until the right person arrives.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l7 3v5c0 4.4-2.9 8.2-7 10-4.1-1.8-7-5.6-7-10V6l7-3z" />
        <path d="M12 8v4" />
      </svg>
    ),
  },
  {
    title: 'Instant previews',
    text: 'Images, video, audio, PDFs and code render right on the download page with seekable streaming.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    title: 'Zero accounts',
    text: 'No emails, no sign-ups, no tracking pixels. A secret delete key lives in your browser — that is the whole system.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4" />
        <path d="M4.5 20c1.5-3.2 4.2-5 7.5-5s6 1.8 7.5 5" strokeDasharray="2.5 2.5" />
      </svg>
    ),
  },
];

export function Hero() {
  return (
    <section className="hero">
      <div className="watermark" aria-hidden="true">
        SEND
      </div>
      <div className="container" style={{ position: 'relative' }}>
        <span className="badge">
          <span className="dot-live" /> Self-hosted file transfer · v1.0
        </span>
        <h1 className="display">
          Send anything.
          <br />
          <span className="grad-text">Keep it forever.</span>
        </h1>
        <p className="hero-sub">
          Drag in any file up to 50&nbsp;GB and get a link that never expires.
          No accounts. No tracking. No expiry dates. Your storage, your rules.
        </p>
        <div className="cta-row">
          <Btn size="btn-lg" onClick={() => document.getElementById('send')?.scrollIntoView({ behavior: 'smooth' })}>
            Start sending <IconArrowDown />
          </Btn>
          <Btn variant="ghost" size="btn-lg" onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}>
            How it works
          </Btn>
        </div>
        <div className="scroll-hint" aria-hidden="true">
          <IconArrowDown />
        </div>
      </div>
    </section>
  );
}

export function Features() {
  return (
    <section className="section" id="features">
      <div className="section-head">
        <div className="kicker">Why Sendr</div>
        <h2 className="section-title">Built different, on purpose</h2>
      </div>
      <div className="container features-grid">
        {FEATURES.map((f, i) => (
          <Reveal key={f.title} delay={i * 70}>
            <Tilt className="feature-card" style={{ height: '100%' }}>
              <div className="fc-icon">{f.icon}</div>
              <div className="fc-title">{f.title}</div>
              <div className="fc-text">{f.text}</div>
            </Tilt>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

const STAT_FORMAT = {
  files: (v) => v.toLocaleString(),
  bytes: (v) => fmtBytes(v),
  downloads: (v) => v.toLocaleString(),
};

export function StatsBand() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/stats')
      .then((r) => r.json())
      .then((d) => {
        if (alive && d.ok) setStats(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const items = [
    { label: 'Files shared', value: stats ? stats.files : 0, format: STAT_FORMAT.files },
    { label: 'Stored on disk', value: stats ? stats.bytes : 0, format: STAT_FORMAT.bytes },
    { label: 'Downloads served', value: stats ? stats.downloads : 0, format: STAT_FORMAT.downloads },
    { label: 'Link expiry', value: null },
  ];

  return (
    <section className="stat-band section" id="stats">
      <hr className="divider-glow" style={{ marginBottom: 54 }} />
      <div className="container stats-grid">
        {items.map((s, i) => (
          <Reveal key={s.label} delay={i * 80}>
            <div style={{ textAlign: 'center' }}>
              {s.value === null ? (
                <div className="stat-num">∞</div>
              ) : (
                <div className="stat-num">
                  <Counter value={s.value} format={s.format} />
                </div>
              )}
              <div className="stat-label">{s.label}</div>
            </div>
          </Reveal>
        ))}
      </div>
      <hr className="divider-glow" style={{ marginTop: 54 }} />
    </section>
  );
}

const FAQ_ITEMS = [
  {
    q: 'Links really last forever?',
    a: 'Yes. Nothing expires on its own — no 7-day timers, no purge jobs. Files only disappear if you delete them from your vault.',
  },
  {
    q: 'How big can my files be?',
    a: 'Up to 50 GB each, unlimited number of files. Big files are split into chunks by the custom transfer engine and stitched back together on the fly when someone downloads.',
  },
  {
    q: 'Are my files private?',
    a: 'Links use unguessable random IDs, and you can add a password on top. Risky formats are forced to download instead of executing in the browser, and nothing about you is logged — there are no accounts at all.',
  },
  {
    q: 'Can I delete something later?',
    a: 'Every upload gets a secret delete key stored in "Your vault" in that browser. Two clicks and it is gone from the server for good.',
  },
  {
    q: 'What if my upload gets interrupted?',
    a: 'Pause it or close the tab entirely. When you come back, the unfinished upload appears at the top of the page — re-select the exact same file and it continues where it stopped.',
  },
  {
    q: 'Where do files actually live?',
    a: 'In the built-in storage engine — plain files plus tiny metadata JSONs on the server disk. Point SENDR_DATA_DIR anywhere you like. No cloud vendors, no lock-in, everything is inspectable.',
  },
];

export function Faq() {
  return (
    <section className="section" id="faq">
      <div className="section-head">
        <div className="kicker">FAQ</div>
        <h2 className="section-title">Questions, answered</h2>
      </div>
      <div className="container faq">
        {FAQ_ITEMS.map((item, i) => (
          <Reveal key={item.q} delay={i * 50}>
            <details className="faq-item">
              <summary className="faq-q">
                {item.q}
                <svg className="faq-plus" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </summary>
              <div className="faq-a">{item.a}</div>
            </details>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
