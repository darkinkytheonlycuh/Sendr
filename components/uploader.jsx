'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ST,
  UploadManager,
  jfetch,
  loadSessions,
  removeSession,
} from '@/lib/uploader';
import { fmtBytes, fmtEta, fmtSpeed, canShare, copyText, shareLink } from '@/lib/format';
import { useToast } from './toast';
import {
  Btn,
  CheckRing,
  Chip,
  FileTypeIcon,
  IconExternal,
  IconLock,
  IconPause,
  IconPlay,
  IconShare,
  IconTrash,
  IconUpload,
  IconX,
  Spinner,
} from './ui';

const MAX_CLIENT_BYTES = 50 * 1024 ** 3;

const STATUS_CHIP = {
  [ST.queued]: { label: 'Queued', tone: '' },
  [ST.initializing]: { label: 'Starting', tone: 'chip-live' },
  [ST.uploading]: { label: 'Uploading', tone: 'chip-live' },
  [ST.paused]: { label: 'Paused', tone: 'chip-warn' },
  [ST.finishing]: { label: 'Finishing', tone: 'chip-live' },
  [ST.done]: { label: 'Sent', tone: 'chip-ok' },
  [ST.error]: { label: 'Failed', tone: 'chip-err' },
};

export default function Uploader() {
  const toast = useToast();
  const managerRef = useRef(null);
  const fileInputRef = useRef(null);
  const resumeInputRef = useRef(null);
  const resumeTargetRef = useRef(null);
  const [, setTick] = useState(0);

  const [drag, setDrag] = useState(false);
  const [lockOn, setLockOn] = useState(false);
  const [password, setPassword] = useState('');
  const [sessions, setSessions] = useState([]);
  const [copied, setCopied] = useState('');

  const bump = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const manager = new UploadManager({
      change: bump,
      progress: bump,
      onDone: () => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
          import('./fx').then(({ burstConfetti }) => burstConfetti());
        }
      },
    });
    managerRef.current = manager;
    setSessions(loadSessions());
    return () => manager.dispose();
  }, [bump]);

  useEffect(() => {
    const onPaste = (e) => {
      const files = e.clipboardData?.files;
      if (files && files.length) addFiles(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  useEffect(() => {
    const guard = (e) => {
      if (managerRef.current?.isActive()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, []);

  const addFiles = useCallback(
    (fileList) => {
      const manager = managerRef.current;
      if (!manager) return;
      const files = Array.from(fileList || []);
      let queuedCount = 0;
      for (const file of files) {
        if (file.size > MAX_CLIENT_BYTES) {
          toast.push(`"${file.name}" is over the 50 GB limit`, 'err');
          continue;
        }
        if (file.size === 0) {
          toast.push(`"${file.name}" is empty`, 'err');
          continue;
        }
        manager.add(file, lockOn ? password : '');
        queuedCount += 1;
      }
      if (queuedCount > 0) {
        toast.push(
          `${queuedCount} file${queuedCount > 1 ? 's' : ''} added to the queue`,
          'ok'
        );
      }
    },
    [lockOn, password, toast]
  );

  const onDrop = (e) => {
    e.preventDefault();
    setDrag(false);
    addFiles(e.dataTransfer.files);
  };

  const startResume = (rec) => {
    resumeTargetRef.current = rec;
    resumeInputRef.current?.click();
  };

  const onResumePick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const rec = resumeTargetRef.current;
    if (!file || !rec) return;
    if (file.size !== rec.size || file.name !== rec.name) {
      toast.push('That is a different file — pick the exact same file to resume', 'err');
      return;
    }
    await managerRef.current?.resumeUpload(rec, file);
    setSessions(loadSessions());
    bump();
  };

  const discardSession = async (rec) => {
    try {
      await jfetch('/api/upload/abort', {
        method: 'POST',
        body: JSON.stringify({ id: rec.id, token: rec.token }),
      });
    } catch {}
    removeSession(rec.id);
    setSessions(loadSessions());
    toast.push('Unfinished upload discarded', 'info');
  };

  const doCopy = async (text, key) => {
    const ok = await copyText(text);
    if (ok) {
      setCopied(key);
      setTimeout(() => setCopied(''), 1400);
      toast.push('Link copied — it never expires', 'ok');
    } else {
      toast.push('Could not copy', 'err');
    }
  };

  const manager = managerRef.current;
  const items = manager ? manager.items : [];

  return (
    <div className="uploader-panel panel" id="send">
      {sessions.length > 0 && (
        <div className="sessions">
          {sessions.map((rec) => (
            <div className="s-item" key={rec.id}>
              <div className="s-info">
                <div className="s-title">Unfinished upload</div>
                <div className="s-sub">
                  {rec.name} · {fmtBytes(rec.size)}
                </div>
              </div>
              <Btn size="btn-sm" onClick={() => startResume(rec)}>
                <IconPlay /> Resume
              </Btn>
              <button className="icon-btn" aria-label="Discard unfinished upload" onClick={() => discardSession(rec)}>
                <IconTrash />
              </button>
            </div>
          ))}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input ref={resumeInputRef} type="file" hidden onChange={onResumePick} />

      <div
        className={`dropzone ${drag ? 'drag' : ''}`.trim()}
        role="button"
        tabIndex={0}
        aria-label="Drop files or click to browse"
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDrag(false);
        }}
        onDrop={onDrop}
      >
        {drag && (
          <div className="dz-overlay">
            Release to send it forever
          </div>
        )}
        <div className="dz-body">
          <div className="dz-icon">
            <IconUpload />
          </div>
          <div className="dz-title">Drop files here</div>
          <div className="dz-sub">
            or <span className="linkish">browse your device</span> · paste with{' '}
            <span className="kbd">Ctrl</span>+<span className="kbd">V</span>
          </div>
          <div className="dz-meta">ANY FORMAT · UP TO 50 GB EACH · UNLIMITED FILES · LINKS NEVER EXPIRE</div>
          <div className="lock-row" onClick={(e) => e.stopPropagation()}>
            <button
              className={`lock-toggle ${lockOn ? 'on' : ''}`.trim()}
              onClick={() => setLockOn((v) => !v)}
              aria-pressed={lockOn}
            >
              <IconLock /> Password-protect this batch
            </button>
            {lockOn && (
              <div className="pw-wrap">
                <input
                  className="input"
                  type="password"
                  placeholder="Password (optional per-send)"
                  value={password}
                  maxLength={128}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {items.length > 0 && (
        <div className="queue">
          {items.map((item) =>
            item.status === ST.done ? (
              <ResultCard
                key={item.id || item.createdAt}
                item={item}
                copied={copied}
                onCopy={doCopy}
                onDismiss={() => manager.drop(item)}
              />
            ) : (
              <QueueRow
                key={item.createdAt + item.name}
                item={item}
                onPause={() => {
                  item.pause();
                  bump();
                }}
                onResume={() => {
                  item.resumeFromPause(manager.sem, manager.handlers);
                  bump();
                }}
                onCancel={() => {
                  item.cancel(manager.handlers);
                  setTimeout(() => manager.drop(item), 250);
                }}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

function QueueRow({ item, onPause, onResume, onCancel }) {
  const pct =
    item.size > 0 ? Math.min(100, Math.round((item.sent / item.size) * 100)) : 0;
  const chip = STATUS_CHIP[item.status] || STATUS_CHIP[ST.queued];
  const busy =
    item.status === ST.uploading ||
    item.status === ST.initializing ||
    item.status === ST.finishing;

  return (
    <div className={`q-item ${item.status === ST.error ? 'err-state' : ''}`.trim()}>
      <div className="q-top">
        <span className="fc-icon" style={{ width: 38, height: 38, borderRadius: 11, marginBottom: 0 }}>
          <FileTypeIcon category={item.category} size={18} />
        </span>
        <span className="q-name">{item.name}</span>
        <Chip tone={chip.tone}>
          {(item.status === ST.initializing ||
            item.status === ST.finishing) && <Spinner size={11} />}
          {item.status === ST.uploading && <span className="typing-dot" />}
          {chip.label}
        </Chip>
        <span style={{ flex: 1 }} />
        <span className="mono" style={{ fontSize: 12, color: 'var(--tx-2)' }}>
          {pct}%
        </span>
        {item.status === ST.uploading && (
          <button className="icon-btn" aria-label="Pause upload" onClick={onPause}>
            <IconPause />
          </button>
        )}
        {item.status === ST.paused && (
          <button className="icon-btn" aria-label="Resume upload" onClick={onResume}>
            <IconPlay />
          </button>
        )}
        <button className="icon-btn" aria-label="Cancel upload" onClick={onCancel}>
          <IconX />
        </button>
      </div>

      <div className="bar">
        <div
          className={`bar-fill ${busy && item.sent === 0 ? 'indeterminate' : ''}`.trim()}
          style={{ width: `${busy ? pct : pct}%` }}
        />
      </div>

      <div className="q-stats">
        <span>
          <b>{fmtBytes(item.sent)}</b> / {fmtBytes(item.size)}
        </span>
        {item.status === ST.uploading && (
          <>
            <span>{fmtSpeed(item.speed)}</span>
            <span>ETA {fmtEta(item.eta)}</span>
            <span>
              {Math.max(0, item.chunkCount - item.left)} / {item.chunkCount} chunks
            </span>
          </>
        )}
        {item.status === ST.paused && <span>Paused — resume anytime</span>}
        {item.status === ST.error && (
          <span style={{ color: 'var(--err)' }}>{item.error}</span>
        )}
      </div>
    </div>
  );
}

function ResultCard({ item, copied, onCopy, onDismiss }) {
  const link = `${window.location.origin}/d/${item.meta.id}`;
  const direct = `${window.location.origin}/api/dl/${item.meta.id}`;
  return (
    <div className="result-card">
      <div className="rc-head">
        <CheckRing />
        <div style={{ minWidth: 0, textAlign: 'left' }}>
          <div className="rc-name">{item.meta.name}</div>
          <div className="rc-sub">
            {fmtBytes(item.meta.size)} · FOREVER LINK · ID {item.meta.id.toUpperCase()}
          </div>
        </div>
        <span style={{ flex: 1 }} />
        <Chip tone="chip-ok">Live</Chip>
        <button className="icon-btn" aria-label="Dismiss" onClick={onDismiss}>
          <IconX />
        </button>
      </div>
      <div className="link-box">
        <input className="link-input" readOnly value={link} onFocus={(e) => e.target.select()} />
        <Btn variant="ghost" onClick={() => onCopy(link, item.meta.id)} className={copied === item.meta.id ? 'copy-flash' : ''}>
          {copied === item.meta.id ? 'Copied' : 'Copy link'}
        </Btn>
        <a className="btn btn-ghost" href={`/d/${item.meta.id}`} target="_blank" rel="noreferrer">
          Open <IconExternal />
        </a>
        {canShare() && (
          <Btn variant="ghost" onClick={() => shareLink(item.meta.name, link)}>
            Share <IconShare />
          </Btn>
        )}
      </div>
      <div className="q-stats" style={{ marginTop: 12 }}>
        <span>
          Direct download: <b>{direct}</b>
        </span>
      </div>
    </div>
  );
}
