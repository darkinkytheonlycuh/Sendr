'use client';

export function Btn({
  variant = 'primary',
  size = '',
  className = '',
  children,
  onClick,
  type = 'button',
  ...rest
}) {
  const spawn = (e) => {
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    const d = Math.max(rect.width, rect.height);
    const ink = document.createElement('span');
    ink.className = 'ripple-ink';
    ink.style.width = `${d}px`;
    ink.style.height = `${d}px`;
    ink.style.left = `${e.clientX - rect.left - d / 2}px`;
    ink.style.top = `${e.clientY - rect.top - d / 2}px`;
    btn.appendChild(ink);
    setTimeout(() => ink.remove(), 700);
  };
  return (
    <button
      type={type}
      className={`btn btn-${variant} ${size} ${className}`.trim()}
      onClick={(e) => {
        spawn(e);
        if (onClick) onClick(e);
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Chip({ tone = '', className = '', children }) {
  return <span className={`chip ${tone} ${className}`.trim()}>{children}</span>;
}

export function Spinner({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="spin-svg" aria-hidden="true">
      <style>{`.spin-svg { animation: spin 0.9s linear infinite; }`}</style>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

const GLYPHS = {
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <circle cx="9" cy="10" r="1.8" />
      <path d="M4 18l5.2-5.2a1.4 1.4 0 0 1 2 0L20 20" />
    </>
  ),
  video: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M10.5 9.5l5 2.5-5 2.5z" fill="currentColor" stroke="none" />
    </>
  ),
  audio: (
    <>
      <path d="M9 17V6.5l9-1.5v10" />
      <circle cx="6.8" cy="17.2" r="2.4" />
      <circle cx="15.8" cy="15.2" r="2.4" />
    </>
  ),
  pdf: (
    <>
      <path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M14 3v4h4" />
      <path d="M9.5 13h5M9.5 16.5h5" />
    </>
  ),
  archive: (
    <>
      <rect x="4" y="3.5" width="16" height="17" rx="2.5" />
      <path d="M12 3.5v4M12 9.5v2M12 13.5v2" />
      <path d="M10 19.5h4" />
    </>
  ),
  code: (
    <>
      <path d="M8.5 7L4 12l4.5 5" />
      <path d="M15.5 7L20 12l-4.5 5" />
      <path d="M13.2 5l-2.4 14" />
    </>
  ),
  text: (
    <>
      <path d="M6.5 4h11a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
      <path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4.5" />
    </>
  ),
  file: (
    <>
      <path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M14 3v4h4" />
    </>
  ),
};

export function FileTypeIcon({ category = 'file', size = 22 }) {
  const glyph = GLYPHS[category] || GLYPHS.file;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {glyph}
    </svg>
  );
}

export function LogoMark({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="lg-plane" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#98a1ae" />
        </linearGradient>
      </defs>
      <path d="M3.5 11.5 L20 3.5 L13.5 20 L11 12.5 Z" fill="url(#lg-plane)" />
      <path d="M11 12.5 L20 3.5" stroke="#0b0d12" strokeWidth="1" />
    </svg>
  );
}

export function IconArrowDown() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4v16m0 0l-6-6m6 6l6-6" />
    </svg>
  );
}

export function IconUpload() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 15.5A4.5 4.5 0 0 1 6.2 7a6 6 0 0 1 11.6 0A4.5 4.5 0 0 1 20 15.5" />
      <path d="M12 12v8m0 0l-3.5-3.5M12 20l3.5-3.5" />
    </svg>
  );
}

export function IconPlay() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7 5l12 7-12 7z" />
    </svg>
  );
}

export function IconPause() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

export function IconX() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function IconCopy() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function IconCheck() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12.5l5 5L20 6.5" />
    </svg>
  );
}

export function IconLock() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
    </svg>
  );
}

export function IconFolder() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 7.5v11a1.5 1.5 0 0 0 1.5 1.5h14a1.5 1.5 0 0 0 1.5-1.5V9a1.5 1.5 0 0 0-1.5-1.5h-7L9.8 5.2A1.5 1.5 0 0 0 8.7 4.7H5A1.5 1.5 0 0 0 3.5 6.2z" />
    </svg>
  );
}

export function IconTrash() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M4 7h16M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2" />
      <path d="M6.5 7l1 13h9l1-13" />
    </svg>
  );
}

export function IconExternal() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 4h6v6M20 4l-9 9" />
      <path d="M19 13.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5.5" />
    </svg>
  );
}

export function IconShare() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="17.5" cy="5.5" r="2.5" />
      <circle cx="17.5" cy="18.5" r="2.5" />
      <path d="M8.2 10.8l7-4M8.2 13.2l7 4" />
    </svg>
  );
}

export function IconDownload() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5" />
      <path d="M4.5 19.5h15" />
    </svg>
  );
}

export function CheckRing() {
  return (
    <svg className="check-ring" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <circle cx="20" cy="20" r="18" stroke="#86e2ac" strokeWidth="2" transform="rotate(-90 20 20)" />
      <path d="M12.5 20.5l5 5 10-11" stroke="#86e2ac" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
