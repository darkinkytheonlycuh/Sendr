'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ST,
  UploadManager,
  filesFromDataTransfer,
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
  IconFolder,
  IconLock,
  IconPause,
  IconPlay,
  IconShare,
  IconTrash,
  IconUpload,
  IconX,
  Spinner,
} from './ui';

const FALLBACK_MAX = 200 * 1024 ** 3;

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
  const folderInputRef = useRef(null);
  const resumeInputRef = useRef(null);
  const resumeTargetRef = useRef(null);
  const [, setTick] = useState(0);

  const [winDrag, setWinDrag] = useState(false);
  const [lockOn, setLockOn] = useState(false);
  const [password, setPassword] = useState('');
  const [sessions, setSessions] = useState([]);
  const [copied, setCopied] = useState('');
  const [maxBytes, setMaxBytes] = useState(FALLBACK_MAX);

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
    jfetch('/api/info')
      .then((d) => {
        if (d && d.ok && d.maxBytes) setMaxBytes(d.maxBytes);
      })
      .catch(() => {});
    return () => manager.dispose();
  }, [bump]);

  const queueFilesRef = useRef(null);

  const queueFiles = useCallback(
    (pairs) => {
      const manager = managerRef.current;
      if (!manager || !pairs || !pairs.length) return;
      let queuedCount = 0;
      for (const pair of pairs) {
        const file = pair.file;
        if (!file) continue;
        if (file.size > maxBytes) {
          toast.push(
            `"${pair.path || file.name}" is over the ${Math.floor(
              maxBytes / 1024 ** 3
            )} GB limit`,
            'err'
          );
          continue;
        }
        if (file.size === 0) {
          toast.push(`"${pair.path || file.name}" is empty`, 'err');
          continue;
        }
        manager.add(file, lockOn ? password : '', pair.path || '');
        queuedCount += 1;
      }
      if (queuedCount > 0) {
        toast.push(
          `${queuedCount} file${queuedCount > 1 ? 's' : ''} added to the queue`,
          'ok'
        );
      }
    },
    [maxBytes, lockOn, password, toast]
  );

  useEffect(() => {
    queueFilesRef.current = queueFiles;
  }, [queueFiles]);

  useEffect(() => {
    let hideTimer = 0;
    let active = false;
    const hasFiles = (e) =>
      e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');

    const onDragOver = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (!active) {
        active = true;
        setWinDrag(true);
      }
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        active = false;
        setWinDrag(false);
      }, 600);
    };

    const onDrop = async (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      clearTimeout(hideTimer);
      active = false;
      setWinDrag(false);
      try {
        const found = await filesFromDataTransfer(e.dataTransfer);
        if (found.length && queueFilesRef.current) queueFilesRef.current(found);
      } catch {
        const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
        if (files.length && queueFilesRef.current) {
          queueFilesRef.current(files.map((f) => ({ file: f, path: '' })));
        }
      }
    };

    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      clearTimeout(hideTimer);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

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

  useEffect(() => {
    const onPaste = (e) => {
      const files = e.clipboardData?.files;
      if (files && files.length) {
        queueFiles(Array.from(files).map((f) => ({ file: f, path: '' })));
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [queueFiles]);

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
  const gbLabel = Math.floor(maxBytes / 1024 ** 3);

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
          queueFiles(Array.from(e.target.files || []).map((f) => ({ file: f, path: '' })));
          e.target.value = '';
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        hidden
        webkitdirectory=""
        directory=""
        onChange={(e) => {
          queueFiles(
            Array.from(e.target.files || []).map((f) => ({
              file: f,
              path: f.webkitRelativePath || f.name,
            }))
          );
          e.target.value = '';
        }}
      />
      <input ref={resumeInputRef} type="file" hidden onChange={onResumePick} />

      <div
        className={`dropzone ${winDrag ? 'drag' : ''}`.trim()}
        role="button"
        tabIndex={0}
        aria-label="Drop files or folders, or click to browse"
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
        }}
      >
        <div className="dz-body">
          <div className="dz-icon">
            <IconUpload />
          </div>
          <div className="dz-title">Drop files or whole folders</div>
          <div className="dz-sub">
            drag from Explorer/Finder anywhere on this page · or{' '}
            <span className="linkish">browse</span> · paste with{' '}
            <span className="kbd">Ctrl</span>+<span className="kbd">V</span>
          </div>
          <div className="dz-meta">
            ANY FORMAT · UP TO {gbLabel} GB EACH · FOLDERS WELCOME · LINKS NEVER EXPIRE
          </div>
          <div className="lock-row" onClick={(e) => e.stopPropagation()}>
            <button className="lock-toggle" onClick={() => folderInputRef.current?.click()}>
              <IconFolder /> Pick a folder
            </button>
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
                  placeholder="Password"
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

      <div className={`global-drop ${winDrag ? 'show' : ''}`.trim()} aria-hidden="true">
        <div className="gd-frame">
          <div className="dz-icon">
            <IconUpload />
          </div>
          <div className="gd-title">Drop anywhere</div>
          <div className="dz-sub">Files or entire folders — they join the queue</div>
        </div>
      </div>
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
          style={{ width: `${pct}%` }}
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
