'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { jfetch } from '@/lib/uploader';
import {
  canShare,
  categoryOf,
  copyText,
  fmtBytes,
  fmtDate,
  shareLink,
} from '@/lib/format';
import { useToast } from './toast';
import { Btn, Chip, FileTypeIcon, IconCopy, IconDownload, IconExternal, IconLock, IconShare } from './ui';

function usePwQuery(meta, unlocked) {
  return useMemo(() => {
    if (!meta.protected || !unlocked) return '';
    return `&pw=${encodeURIComponent(unlocked)}`;
  }, [meta.protected, unlocked]);
}

export function DownloadView({ meta: initialMeta }) {
  const toast = useToast();
  const [meta] = useState(initialMeta);
  const [unlocked, setUnlocked] = useState('');
  const [locked, setLocked] = useState(Boolean(meta.protected));
  const [gateError, setGateError] = useState(false);
  const [gateBusy, setGateBusy] = useState(false);
  const [pwInput, setPwInput] = useState('');
  const [showDirect, setShowDirect] = useState(false);
  const [copied, setCopied] = useState('');
  const [textPreview, setTextPreview] = useState(null);

  const pageUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/d/${meta.id}`
      : `/d/${meta.id}`;
  const pwq = usePwQuery(meta, unlocked);
  const streamUrl = `/api/dl/${meta.id}?disp=inline${pwq}&v=${meta.completedAt || meta.createdAt}`;
  const dlUrl = `/api/dl/${meta.id}?dl=1${pwq}`;
  const directUrl = typeof window !== 'undefined' ? `${window.location.origin}${dlUrl}` : dlUrl;
  const category = categoryOf(meta.type, meta.name);

  useEffect(() => {
    const isTexty =
      (category === 'text' && /text|json|xml/.test(meta.type)) ||
      category === 'code' ||
      /\.md$|\.log$|\.csv$/i.test(meta.name) ||
      /^text\//.test(meta.type);
    if (!isTexty || locked) return;
    let alive = true;
    fetch(`/api/dl/${meta.id}?max=524288${pwq}`)
      .then((r) => {
        if (!r.ok) throw new Error('preview unavailable');
        return r.text();
      })
      .then((txt) => {
        if (alive) setTextPreview(txt.slice(0, 20000));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [meta.id, meta.type, meta.name, category, locked, pwq]);

  const tryUnlock = async (e) => {
    e.preventDefault();
    if (gateBusy || !pwInput) return;
    setGateBusy(true);
    try {
      await jfetch(`/api/files/${meta.id}/unlock`, {
        method: 'POST',
        body: JSON.stringify({ password: pwInput }),
      });
      setUnlocked(pwInput);
      setLocked(false);
    } catch {
      setGateError(true);
      setTimeout(() => setGateError(false), 600);
    } finally {
      setGateBusy(false);
    }
  };

  const doCopy = async (text, key) => {
    const ok = await copyText(text);
    if (ok) {
      setCopied(key);
      setTimeout(() => setCopied(''), 1400);
      toast.push('Copied to clipboard', 'ok');
    }
  };

  if (locked) {
    return (
      <div className="container dl-page">
        <div className={`panel gate ${gateError ? 'err-state' : ''}`.trim()}>
          <div className="big-icon" style={{ width: 64, height: 64, borderRadius: 18 }}>
            <IconLock />
          </div>
          <h2>This send is locked</h2>
          <p>Enter the password the sender gave you.</p>
          <form className="gate-form" onSubmit={tryUnlock}>
            <input
              className="input"
              type="password"
              placeholder="Password"
              value={pwInput}
              autoFocus
              onChange={(e) => setPwInput(e.target.value)}
            />
            <Btn type="submit" disabled={gateBusy || !pwInput}>
              {gateBusy ? 'Checking…' : 'Unlock'}
            </Btn>
          </form>
        </div>
      </div>
    );
  }

  const chips = (
    <div className="dl-chips">
      <Chip>{fmtBytes(meta.size)}</Chip>
      <Chip>{meta.type}</Chip>
      <Chip>Uploaded {fmtDate(meta.completedAt || meta.createdAt)}</Chip>
      <Chip>
        {meta.downloads} download{meta.downloads === 1 ? '' : 's'}
      </Chip>
      <Chip tone="forever-chip">∞ Never expires</Chip>
    </div>
  );

  return (
    <div className="container dl-page">
        <div className="dl-label fade-up-anim">
          {meta.sender ? `${meta.sender} sent you a file` : 'Someone sent you a file'}
        </div>
      <div className="panel dl-card">
        <div className="big-icon">
          <FileTypeIcon category={category} size={38} />
        </div>
        <h1 className="dl-name">{meta.name}</h1>
        {chips}

        {(category === 'image' ||
          category === 'video' ||
          category === 'audio' ||
          category === 'pdf') && (
          <div className="preview-box">
            {category === 'image' && <img src={streamUrl} alt={meta.name} loading="lazy" />}
            {category === 'video' && <video src={streamUrl} controls preload="metadata" playsInline />}
            {category === 'audio' && <audio src={streamUrl} controls preload="metadata" />}
            {category === 'pdf' && <iframe src={streamUrl} title={meta.name} />}
          </div>
        )}
        {textPreview !== null && (
          <div className="preview-box">
            <pre className="text-pre">{textPreview}</pre>
          </div>
        )}

        <div style={{ marginTop: 26 }} className="rc-actions" />
        <div className="cta-row" style={{ marginTop: 24, animation: 'none' }}>
          <a
            className="btn btn-primary btn-lg"
            href={dlUrl}
            download={meta.name}
            onClick={() => toast.push('Download started', 'ok')}
          >
            Download <IconDownload />
          </a>
          <Btn variant="ghost" onClick={() => doCopy(pageUrl, 'page')} className={copied === 'page' ? 'copy-flash' : ''}>
            {copied === 'page' ? 'Copied' : 'Copy link'} <IconCopy />
          </Btn>
          {canShare() && (
            <Btn variant="ghost" onClick={() => shareLink(meta.name, pageUrl)}>
              Share <IconShare />
            </Btn>
          )}
          <Btn variant="ghost" onClick={() => setShowDirect((v) => !v)}>
            Direct link
          </Btn>
        </div>

        {showDirect && (
          <div className="link-box" style={{ marginTop: 16 }}>
            <input className="link-input" readOnly value={directUrl} onFocus={(e) => e.target.select()} />
            <Btn variant="ghost" onClick={() => doCopy(directUrl, 'direct')}>
              {copied === 'direct' ? 'Copied' : 'Copy'} <IconCopy />
            </Btn>
          </div>
        )}

        <p style={{ marginTop: 22, fontSize: 12.5, color: 'var(--tx-3)' }}>
          This link never expires · Served straight from the host&apos;s own storage engine
        </p>
      </div>

      <div style={{ textAlign: 'center', marginTop: 34 }}>
        <Link href="/" className="btn btn-ghost">
          Send your own file <IconExternal />
        </Link>
      </div>
    </div>
  );
}

export function PendingGate({ initial }) {
  const [status, setStatus] = useState(initial.status);

  useEffect(() => {
    if (status !== 'pending') return undefined;
    const t = setInterval(async () => {
      try {
        const res = await jfetch(`/api/files/${initial.id}`);
        if (res.meta.status === 'ready') setStatus('ready');
      } catch {}
    }, 1500);
    return () => clearInterval(t);
  }, [initial.id, status]);

  if (status === 'ready') {
    return <ReadyAfterPending id={initial.id} />;
  }

  return (
    <div className="pending-view">
      <div className="orbit-loader" aria-hidden="true" />
      <h1 className="section-title" style={{ marginBottom: 10 }}>
        Upload still in progress…
      </h1>
      <p style={{ color: 'var(--tx-2)' }}>
        {initial.name} ({fmtBytes(initial.size)}) is on its way up.
      </p>
      <p className="pending-tip" style={{ marginTop: 14 }}>
        This page unlocks automatically the moment it lands.
      </p>
    </div>
  );
}

function ReadyAfterPending({ id }) {
  const [meta, setMeta] = useState(null);

  useEffect(() => {
    jfetch(`/api/files/${id}`)
      .then((res) => setMeta(res.meta))
      .catch(() => {});
  }, [id]);

  if (!meta) {
    return (
      <div className="pending-view">
        <div className="orbit-loader" aria-hidden="true" />
      </div>
    );
  }
  return <DownloadView meta={meta} />;
}

export function NotFoundView() {
  return (
    <div className="nf-view">
      <div className="glitch" data-text="404">
        404
      </div>
      <h1 className="section-title" style={{ marginTop: 18 }}>
        This send doesn&apos;t exist
      </h1>
      <p style={{ color: 'var(--tx-2)', marginTop: 10 }}>
        The link may be mistyped — or the file was deleted by its owner.
      </p>
      <div className="cta-row">
        <Link href="/" className="btn btn-primary btn-lg">
          Send something instead
        </Link>
      </div>
    </div>
  );
}
