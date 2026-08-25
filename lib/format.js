export function fmtBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const v = bytes / 1024 ** i;
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

export function fmtSpeed(bps) {
  if (!Number.isFinite(bps) || bps <= 0) return '—';
  return `${fmtBytes(bps)}/s`;
}

export function fmtEta(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 86400 * 30) return '∞';
  const s = Math.ceil(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${m}m ${rs}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function fmtDate(ts) {
  try {
    return new Date(ts).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

export function extOf(name) {
  const m = /\.([a-z0-9]{1,9})$/i.exec(String(name || ''));
  return m ? m[1].toLowerCase() : '';
}

const EXT_MAP = {
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico', 'heic'],
  video: ['mp4', 'webm', 'mkv', 'mov', 'avi', 'm4v', 'ogv'],
  audio: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'opus'],
  pdf: ['pdf'],
  archive: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso'],
  code: ['js', 'jsx', 'ts', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'cs', 'html', 'css', 'json', 'yml', 'yaml', 'sh', 'bat', 'ps1', 'sql', 'php', 'lua'],
  text: ['txt', 'md', 'log', 'csv', 'ini', 'cfg', 'env'],
};

export function categoryOf(type, name) {
  const t = String(type || '').toLowerCase();
  if (t.startsWith('image/')) return 'image';
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('audio/')) return 'audio';
  if (t === 'application/pdf') return 'pdf';
  if (/zip|rar|7z|tar|gzip|compress|iso/.test(t)) return 'archive';
  if (/(javascript|json|xml|python|x-sh)/.test(t)) return 'code';
  if (t.startsWith('text/')) return 'text';
  const e = extOf(name);
  for (const [cat, exts] of Object.entries(EXT_MAP)) {
    if (exts.includes(e)) return cat;
  }
  return 'file';
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export async function shareLink(title, url) {
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title, url });
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export function canShare() {
  return typeof navigator !== 'undefined' && Boolean(navigator.share);
}
