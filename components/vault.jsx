'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { jfetch, loadMine, removeMine } from '@/lib/uploader';
import { canShare, categoryOf, copyText, fmtBytes, fmtDate, shareLink } from '@/lib/format';
import { useToast } from './toast';
import {
  Btn,
  Chip,
  FileTypeIcon,
  IconExternal,
  IconShare,
  IconTrash,
} from './ui';

export default function Vault() {
  const toast = useToast();
  const [entries, setEntries] = useState([]);
  const [armed, setArmed] = useState('');
  const [info, setInfo] = useState({});
  const [copied, setCopied] = useState('');

  useEffect(() => {
    setEntries(loadMine());
  }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      for (const entry of entries) {
        if (!alive) return;
        try {
          const res = await jfetch(`/api/files/${entry.id}`);
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
              const gone = meta && meta.status === 'gone';
              return (
                <div className="v-item" key={entry.id} style={{ animationDelay: `${i * 45}ms` }}>
                  <span className="fc-icon" style={{ width: 38, height: 38, borderRadius: 11, marginBottom: 0 }}>
                    <FileTypeIcon category={categoryOf(meta?.type || '', entry.name)} size={18} />
                  </span>
                  <div className="v-meta">
                    <div className="v-name">{entry.name}</div>
                    <div className="v-sub">
                      {fmtBytes(entry.size)} · {fmtDate(entry.date)}
                      {meta && meta.downloads !== undefined && ` · ${meta.downloads} download${meta.downloads === 1 ? '' : 's'}`}
                      {gone && ' · no longer on server'}
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
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
