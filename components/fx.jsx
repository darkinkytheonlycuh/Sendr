'use client';

import { useEffect, useRef, useState } from 'react';

const prefersReduced = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const finePointer = () =>
  typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/* ------------------------------------------------------------------------ */
/* Particle network: frame-rate independent, batched drawing, pauses when   */
/* the tab is hidden, eased mouse repulsion and a soft scroll parallax.     */
/* ------------------------------------------------------------------------ */
export default function ParticleField() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d', { alpha: true });
    const reduced = prefersReduced();
    let raf = 0;
    let w = 0;
    let h = 0;
    let last = 0;
    let running = false;
    const LINK = 130;
    const LINK2 = LINK * LINK;
    const target = { x: -9999, y: -9999 };
    const mouse = { x: -9999, y: -9999 };
    let scrollY = window.scrollY;
    let parallax = 0;
    let nodes = [];

    const seed = () => {
      const count = Math.round(Math.min(72, Math.max(26, (w * h) / 19000)));
      nodes = [];
      for (let i = 0; i < count; i += 1) {
        nodes.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.35,
          vy: (Math.random() - 0.5) * 0.35,
          r: Math.random() * 1.5 + 0.45,
          z: Math.random() * 0.8 + 0.2, // depth, used for parallax
        });
      }
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      const nw = window.innerWidth;
      const nh = window.innerHeight;
      const first = !w;
      w = nw;
      h = nh;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (first) seed();
    };

    const wrapY = (a) => ((((a.y - parallax * a.z) % (h + 40)) + h + 40) % (h + 40)) - 20;

    // Lines are grouped into a few opacity buckets so each frame issues
    // 4 strokes instead of hundreds.
    const BUCKETS = 4;
    const paths = Array.from({ length: BUCKETS }, () => []);

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of paths) p.length = 0;
      const n = nodes.length;
      const px = new Float32Array(n);
      const py = new Float32Array(n);
      for (let i = 0; i < n; i += 1) {
        const a = nodes[i];
        px[i] = a.x;
        py[i] = wrapY(a);
      }
      for (let i = 0; i < n; i += 1) {
        for (let j = i + 1; j < n; j += 1) {
          const dx = px[i] - px[j];
          const dy = py[i] - py[j];
          const d2 = dx * dx + dy * dy;
          if (d2 < LINK2) {
            const k = 1 - Math.sqrt(d2) / LINK;
            const b = Math.min(BUCKETS - 1, Math.floor(k * BUCKETS));
            paths[b].push(px[i], py[i], px[j], py[j]);
          }
        }
      }
      ctx.lineWidth = 1;
      for (let b = 0; b < BUCKETS; b += 1) {
        const seg = paths[b];
        if (!seg.length) continue;
        ctx.strokeStyle = `rgba(255,255,255,${(0.035 * (b + 1)).toFixed(3)})`;
        ctx.beginPath();
        for (let s = 0; s < seg.length; s += 4) {
          ctx.moveTo(seg[s], seg[s + 1]);
          ctx.lineTo(seg[s + 2], seg[s + 3]);
        }
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      for (let i = 0; i < n; i += 1) {
        const r = nodes[i].r;
        ctx.moveTo(px[i] + r, py[i]);
        ctx.arc(px[i], py[i], r, 0, Math.PI * 2);
      }
      ctx.fill();
    };

    const step = (t) => {
      if (!running) return;
      const dt = Math.min(3, last ? (t - last) / 16.667 : 1); // 1 = one 60 Hz frame
      last = t;
      // Ease the pointer and the parallax so nothing snaps.
      const ease = 1 - Math.pow(0.82, dt);
      mouse.x += (target.x - mouse.x) * ease;
      mouse.y += (target.y - mouse.y) * ease;
      parallax += (scrollY * 0.25 - parallax) * (1 - Math.pow(0.9, dt));

      for (const a of nodes) {
        a.x += a.vx * dt;
        a.y += a.vy * dt;
        if (a.x < -20) a.x = w + 20;
        else if (a.x > w + 20) a.x = -20;
        if (a.y < -20) a.y = h + 20;
        else if (a.y > h + 20) a.y = -20;
        const ay = wrapY(a);
        const dx = a.x - mouse.x;
        const dy = ay - mouse.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 25600 && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const f = (1 - d / 160) * 0.06 * dt;
          a.vx += (dx / d) * f;
          a.vy += (dy / d) * f;
        }
        const sp = Math.hypot(a.vx, a.vy);
        if (sp > 0.7) {
          const damp = Math.pow(0.95, dt);
          a.vx *= damp;
          a.vy *= damp;
        } else if (sp < 0.08) {
          a.vx += (Math.random() - 0.5) * 0.03 * dt;
          a.vy += (Math.random() - 0.5) * 0.03 * dt;
        }
      }
      draw();
      raf = requestAnimationFrame(step);
    };

    const start = () => {
      if (running || reduced) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(step);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    let resizeT = 0;
    const onResize = () => {
      clearTimeout(resizeT);
      resizeT = setTimeout(() => {
        resize();
        if (reduced) draw();
      }, 120);
    };
    const onMove = (e) => {
      target.x = e.clientX;
      target.y = e.clientY;
      if (mouse.x < -9000) {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
      }
    };
    const onLeave = (e) => {
      if (!e.relatedTarget) {
        target.x = -9999;
        target.y = -9999;
      }
    };
    const onScroll = () => {
      scrollY = window.scrollY;
    };
    const onVis = () => (document.hidden ? stop() : start());

    resize();
    window.addEventListener('resize', onResize);
    if (reduced) {
      draw();
    } else {
      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('pointerout', onLeave);
      window.addEventListener('scroll', onScroll, { passive: true });
      document.addEventListener('visibilitychange', onVis);
      // Fade the canvas in once the first frame is ready.
      requestAnimationFrame(() => canvas.classList.add('ready'));
      start();
    }

    return () => {
      stop();
      clearTimeout(resizeT);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerout', onLeave);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return <canvas ref={ref} className="fx-canvas" aria-hidden="true" />;
}

/* ------------------------------------------------------------------------ */
/* Reveal on scroll: one shared observer for every element on the page.     */
/* ------------------------------------------------------------------------ */
let sharedObserver = null;
function observeOnce(el) {
  if (typeof IntersectionObserver === 'undefined') {
    el.classList.add('in');
    return () => {};
  }
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
            sharedObserver.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -6% 0px' }
    );
  }
  sharedObserver.observe(el);
  return () => sharedObserver && sharedObserver.unobserve(el);
}

export function Reveal({ children, delay = 0, className = '', as: Tag = 'div' }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    return observeOnce(el);
  }, []);
  return (
    <Tag ref={ref} className={`reveal ${className}`.trim()} style={{ '--d': `${delay}ms` }}>
      {children}
    </Tag>
  );
}

/* Splits text into words that rise in one after another. */
export function SplitWords({ text, delay = 0, step = 55, className = '' }) {
  const words = String(text).split(' ');
  return (
    <span className={`split ${className}`.trim()} aria-label={text}>
      {words.map((word, i) => (
        <span key={i}>
          <span className="split-w" aria-hidden="true">
            <span style={{ '--d': `${delay + i * step}ms` }}>{word}</span>
          </span>
          {i < words.length - 1 ? ' ' : ''}
        </span>
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------------ */
/* Tilt: spring-smoothed 3D tilt with a moving glare highlight.             */
/* ------------------------------------------------------------------------ */
export function Tilt({ children, className = '', max = 8, style }) {
  const ref = useRef(null);
  const state = useRef({ tx: 0, ty: 0, x: 0, y: 0, vx: 0, vy: 0, lift: 0, tl: 0, raf: 0, on: false });

  useEffect(() => {
    const s = state.current;
    return () => cancelAnimationFrame(s.raf);
  }, []);

  const loop = () => {
    const s = state.current;
    const el = ref.current;
    if (!el) return;
    // Critically-damped-ish spring toward the target angles.
    const k = 0.14;
    const damp = 0.72;
    s.vx = (s.vx + (s.tx - s.x) * k) * damp;
    s.vy = (s.vy + (s.ty - s.y) * k) * damp;
    s.x += s.vx;
    s.y += s.vy;
    s.lift += (s.tl - s.lift) * 0.18;
    el.style.transform = `perspective(900px) rotateX(${s.y.toFixed(3)}deg) rotateY(${s.x.toFixed(
      3
    )}deg) translate3d(0, ${(-4 * s.lift).toFixed(2)}px, 0)`;
    const settled =
      Math.abs(s.tx - s.x) < 0.01 &&
      Math.abs(s.ty - s.y) < 0.01 &&
      Math.abs(s.vx) < 0.01 &&
      Math.abs(s.vy) < 0.01 &&
      Math.abs(s.tl - s.lift) < 0.005;
    if (settled && !s.on) {
      el.style.transform = '';
      s.raf = 0;
      return;
    }
    s.raf = requestAnimationFrame(loop);
  };

  const kick = () => {
    if (!state.current.raf) state.current.raf = requestAnimationFrame(loop);
  };

  const onMove = (e) => {
    const el = ref.current;
    if (!el || prefersReduced() || !finePointer()) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    const s = state.current;
    s.on = true;
    s.tx = (px - 0.5) * max;
    s.ty = -(py - 0.5) * max;
    s.tl = 1;
    el.style.setProperty('--gx', `${(px * 100).toFixed(1)}%`);
    el.style.setProperty('--gy', `${(py * 100).toFixed(1)}%`);
    kick();
  };

  const onLeave = () => {
    const s = state.current;
    s.on = false;
    s.tx = 0;
    s.ty = 0;
    s.tl = 0;
    kick();
  };

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={`tilt ${className}`.trim()}
      style={style}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Pointer effects: cursor spotlight on cards and magnetic buttons. One     */
/* listener for the whole page, throttled to animation frames.              */
/* ------------------------------------------------------------------------ */
const SPOT_SELECTOR = '.spot, .feature-card, .faq-item, .v-item, .q-item, .panel';

export function PointerFx() {
  useEffect(() => {
    if (prefersReduced() || !finePointer()) return undefined;
    let raf = 0;
    let ev = null;
    let spotEl = null;
    const magnets = new Map();

    const springMagnet = (el) => {
      const m = magnets.get(el);
      if (!m) return;
      m.x += (m.tx - m.x) * 0.2;
      m.y += (m.ty - m.y) * 0.2;
      el.style.translate = `${m.x.toFixed(2)}px ${m.y.toFixed(2)}px`;
      if (Math.abs(m.tx - m.x) < 0.05 && Math.abs(m.ty - m.y) < 0.05 && !m.on) {
        el.style.translate = '';
        magnets.delete(el);
        return;
      }
      m.raf = requestAnimationFrame(() => springMagnet(el));
    };

    const frame = () => {
      raf = 0;
      if (!ev) return;
      const e = ev;
      const target = e.target instanceof Element ? e.target : null;

      const spot = target ? target.closest(SPOT_SELECTOR) : null;
      if (spot !== spotEl) {
        if (spotEl) spotEl.classList.remove('spot-on');
        spotEl = spot;
        if (spotEl) spotEl.classList.add('spot-on');
      }
      if (spotEl) {
        const r = spotEl.getBoundingClientRect();
        spotEl.style.setProperty('--mx', `${(e.clientX - r.left).toFixed(0)}px`);
        spotEl.style.setProperty('--my', `${(e.clientY - r.top).toFixed(0)}px`);
      }

      const mag = target ? target.closest('.magnetic') : null;
      for (const [el, m] of magnets) {
        if (el !== mag && m.on) {
          m.on = false;
          m.tx = 0;
          m.ty = 0;
        }
      }
      if (mag) {
        const r = mag.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        let m = magnets.get(mag);
        if (!m) {
          m = { x: 0, y: 0, tx: 0, ty: 0, on: true, raf: 0 };
          magnets.set(mag, m);
          springMagnet(mag);
        }
        m.on = true;
        m.tx = dx * 0.22;
        m.ty = dy * 0.3;
      }
    };

    const onMove = (e) => {
      ev = e;
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const onLeave = (e) => {
      if (e.relatedTarget) return;
      ev = null;
      if (spotEl) spotEl.classList.remove('spot-on');
      spotEl = null;
      for (const m of magnets.values()) {
        m.on = false;
        m.tx = 0;
        m.ty = 0;
      }
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerout', onLeave);
    return () => {
      cancelAnimationFrame(raf);
      for (const m of magnets.values()) cancelAnimationFrame(m.raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerout', onLeave);
    };
  }, []);
  return null;
}

/* ------------------------------------------------------------------------ */
/* Animated counter                                                          */
/* ------------------------------------------------------------------------ */
export function Counter({ value, format, duration = 1600 }) {
  const [display, setDisplay] = useState(() => (format ? format(0) : String(0)));
  const ref = useRef(null);
  const shown = useRef(0);

  useEffect(() => {
    const el = ref.current;
    const fmt = format || ((v) => String(v));
    if (!el || prefersReduced()) {
      setDisplay(fmt(value));
      shown.current = value;
      return undefined;
    }
    let raf = 0;
    const run = () => {
      const from = shown.current;
      const t0 = performance.now();
      const tick = (t) => {
        const p = Math.min(1, (t - t0) / duration);
        const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
        const v = Math.round(from + (value - from) * eased);
        shown.current = v;
        setDisplay(fmt(v));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    if (el.closest('.reveal.in') || shown.current !== 0) {
      run();
      return () => cancelAnimationFrame(raf);
    }
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          obs.disconnect();
          run();
        }
      },
      { threshold: 0.4 }
    );
    obs.observe(el);
    return () => {
      obs.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, duration, format]);

  return <span ref={ref}>{display}</span>;
}

/* ------------------------------------------------------------------------ */
/* Confetti burst, frame-rate independent with air drag and a soft fade.    */
/* ------------------------------------------------------------------------ */
export function burstConfetti() {
  if (typeof window === 'undefined' || prefersReduced()) return;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = window.innerWidth;
  const H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:95;';
  document.body.appendChild(canvas);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const colors = ['#ffffff', '#e5e9ef', '#c9d1dd', '#8b93a1', '#86e2ac'];
  const pieces = [];
  for (let i = 0; i < 160; i += 1) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
    const speed = Math.random() * 13 + 6;
    pieces.push({
      x: W / 2 + (Math.random() - 0.5) * 120,
      y: H * 0.45,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      s: Math.random() * 7 + 4,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      wob: Math.random() * Math.PI * 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      rect: Math.random() > 0.4,
    });
  }

  const LIFE = 2600;
  const t0 = performance.now();
  let last = t0;
  const frame = (t) => {
    const elapsed = t - t0;
    const dt = Math.min(3, (t - last) / 16.667);
    last = t;
    ctx.clearRect(0, 0, W, H);
    const fade = elapsed < LIFE - 700 ? 1 : Math.max(0, (LIFE - elapsed) / 700);
    for (const p of pieces) {
      const drag = Math.pow(0.985, dt);
      p.vx *= drag;
      p.vy = p.vy * drag + 0.32 * dt;
      p.wob += 0.12 * dt;
      p.x += (p.vx + Math.sin(p.wob) * 0.6) * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = fade;
      ctx.fillStyle = p.color;
      if (p.rect) {
        // Flip the piece over time so it looks like it's tumbling.
        ctx.scale(1, Math.cos(p.wob * 1.3));
        ctx.fillRect(-p.s / 2, -p.s / 3, p.s, p.s / 1.6);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.s / 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    if (elapsed < LIFE) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
