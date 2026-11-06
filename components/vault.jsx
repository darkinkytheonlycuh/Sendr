'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { jfetch, loadMine, removeMine, updateMine } from '@/lib/uploader';
import { canShare, categoryOf, copyText, fmtBytes, fmtDate, shareLink } from '@/lib/format';
import { useToast } from './toast';
import {
  Btn,
  Chip,
  FileTypeIcon,
  IconEdit,
  IconExternal,
  IconShare,
  IconTrash,
} from './ui';

function EditPanel({ entry, meta, onSaved, onClose }) {
  const toast = useToast();
  const [name, setName] = useState(meta?.name || entry.name);
  const [note, setNote] = useState(meta?.note || '');
  const [password, setPassword] = useState('');
  const [removePw, setRemovePw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const locked = Boolean(meta && meta.protected);

  const save = async (e) => {
    e.preventDefault();
    setError('');
    const body = {};
    if (name.trim() !== (meta?.name || entry.name)) body.name = name;
    if (note.trim() !== (meta?.note || '')) body.note = note;
    if (removePw) body.removePassword = true;
    else if (password) body.password = password;
    if (!Object.keys(body).length) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      const res = await jfetch(`/api/files/${entry.id}`, {
        method: 'PATCH',
        headers: { 'x-sendr-token': entry.token },
        body: JSON.stringify(body),
      });
      onSaved(res.meta);
      toast.push('Changes saved', 'ok');
    } catch (err) {
      setError(err.message || 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="v-edit" onSubmit={save}>
      <label>
        <span>File name</span>
        <input className="input" value={name} maxLength={200} required onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        <span>Note for the recipient (shown on the download page)</span>
        <textarea
          className="input"
          rows={3}
          maxLength={1000}
          value={note}
          placeholder="Optional message"
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <label>
        <span>{locked ? 'Change password (leave blank to keep it)' : 'Add a password (optional)'}</span>
        <input
          className="input"
          type="password"
          autoComplete="new-password"
          maxLength={128}
          value={password}
          disabled={removePw}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {locked && (
        <label className="v-edit-check">
          <input type="checkbox" checked={removePw} onChange={(e) => setRemovePw(e.target.checked)} />
          <span>Remove the password so anyone with the link can download</span>
        </label>
      )}
      {error && <p className="form-error">{error}</p>}
      <div className="v-edit-actions">
        <Btn variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Btn>
        <Btn type="submit" disabled={busy || !name.trim()}>
          {busy ? 'Saving…' : 'Save changes'}
        </Btn>
      </div>
      <p className="v-edit-hint">The share link stays the same.</p>
    </form>
  );
}

export default function Vault() {
  const toast = useToast();
  const [entries, setEntries] = useState([]);
  const [armed, setArmed] = useState('');
  const [info, setInfo] = useState({});
  const [copied, setCopied] = useState('');
  const [editing, setEditing] = useState('');

  useEffect(() => {
    setEntries(loadMine());
  }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      for (const entry of entries) {
        if (!alive) return;
        try {
          const res = await jfetch(`/api/files/${entry.id}`, { headers: { 'x-sendr-token': entry.token } });
          setInfo((prev) => ({ ...prev, [entry.id]: res.meta }));
        } catch {
          setInfo((prev) => ({
            ...prev,
            [entry.id]: { status: 'gone' },
          }));
        }
      }
    };
    if (entries.length) load();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries.length]);

  const doCopy = async (text, id) => {
    const ok = await copyText(text);
    if (ok) {
      setCopied(id);
      setTimeout(() => setCopied(''), 1400);
      toast.push('Link copied', 'ok');
    }
  };

  const del = async (entry) => {
    if (armed !== entry.id) {
      setArmed(entry.id);
      setTimeout(() => setArmed((a) => (a === entry.id ? '' : a)), 3000);
      return;
    }
    setArmed('');
    try {
      await jfetch(`/api/files/${entry.id}`, {
        method: 'DELETE',
        headers: { 'x-sendr-token': entry.token },
      });
      removeMine(entry.id);
      setEntries(loadMine());
      toast.push(`"${entry.name}" deleted forever`, 'ok');
    } catch (err) {
      if (err.status === 403) {
        removeMine(entry.id);
        setEntries(loadMine());
        toast.push('Session out of sync — entry cleared', 'info');
      } else {
        toast.push(err.message || 'Delete failed', 'err');
      }
    }
  };

  return (
    <section className="section" id="mine">
      <div className="section-head">
        <div className="kicker">Your vault</div>
        <h2 className="section-title">Everything you have sent</h2>
        <p style={{ color: 'var(--tx-2)', marginTop: 10, fontSize: 14 }}>
          Stored in this browser — your secret delete keys never leave your machine.
        </p>
      </div>

      <div className="container">
        {entries.length === 0 ? (
          <div className="empty-state panel">
            <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3.5 11.5 L20 3.5 L13.5 20 L11 12.5 Z" />
            </svg>
            <p>Nothing sent yet. Drop a file above and it will live here.</p>
          </div>
        ) : (
          <div className="vault-list">
            {entries.map((entry, i) => {
              const meta = info[entry.id];
              const removed = meta && meta.status === 'removed';
              const gone = meta && (meta.status === 'gone' || removed);
              return (
                <div className={`v-entry ${editing === entry.id ? 'is-editing' : ''}`.trim()} key={entry.id}>
                <div className="v-item" style={{ animationDelay: `${i * 45}ms` }}>
                  <span className="fc-icon" style={{ width: 38, height: 38, borderRadius: 11, marginBottom: 0 }}>
                    <FileTypeIcon category={categoryOf(meta?.type || '', entry.name)} size={18} />
                  </span>
                  <div className="v-meta">
                    <div className="v-name">{entry.name}</div>
                    <div className="v-sub">
                      {fmtBytes(entry.size)} · {fmtDate(entry.date)}
                      {gone && (removed ? ' · removed after a complaint' : ' · no longer on server')}
                    </div>
                  </div>
                  {meta && meta.protected && <Chip tone="chip-warn">Locked</Chip>}
                  {!gone && (
                    <>
                      <button
                        className="icon-btn"
                        aria-label={`Copy link to ${entry.name}`}
                        onClick={() => doCopy(`${window.location.origin}/d/${entry.id}`, entry.id)}
                        style={copied === entry.id ? { color: 'var(--ok)', borderColor: 'rgba(134,226,172,.5)' } : undefined}
                      >
                        <IconShare />
                      </button>
                      <Link href={`/d/${entry.id}`} target="_blank" className="icon-btn" aria-label={`Open ${entry.name}`}>
                        <IconExternal />
                      </Link>
                      {meta && meta.status === 'ready' && (
                        <button
                          className={`icon-btn ${editing === entry.id ? 'on' : ''}`.trim()}
                          aria-label={`Edit ${entry.name}`}
                          aria-expanded={editing === entry.id}
                          onClick={() => setEditing((cur) => (cur === entry.id ? '' : entry.id))}
                        >
                          <IconEdit />
                        </button>
                      )}
                    </>
                  )}
                  <button
                    className={`icon-btn ${armed === entry.id ? 'arm-delete' : ''}`.trim()}
                    aria-label={armed === entry.id ? `Confirm delete ${entry.name}` : `Delete ${entry.name}`}
                    style={armed === entry.id ? { color: 'var(--err)' } : undefined}
                    onClick={() => del(entry)}
                  >
                    <IconTrash />
                  </button>
                </div>
                {editing === entry.id && meta && (
                  <EditPanel
                    entry={entry}
                    meta={meta}
                    onClose={() => setEditing('')}
                    onSaved={(next) => {
                      setInfo((prev) => ({ ...prev, [entry.id]: { ...prev[entry.id], ...next } }));
                      updateMine(entry.id, { name: next.name });
                      setEntries(loadMine());
                      setEditing('');
                    }}
                  />
                )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
