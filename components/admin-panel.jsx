'use client';

import { useCallback, useEffect, useState } from 'react';
import { jfetch } from '@/lib/uploader';
import { fmtBytes, fmtDate } from '@/lib/format';
import { Btn, Chip } from './ui';
import { useToast } from './toast';

const KEY = 'sendr:admin';

export default function AdminPanel() {
  const toast = useToast();
  const [token, setToken] = useState('');
  const [input, setInput] = useState('');
  const [reports, setReports] = useState(null);
  const [error, setError] = useState('');
  const [manualId, setManualId] = useState('');
  const [filter, setFilter] = useState('open');

  useEffect(() => {
    try {
      const t = sessionStorage.getItem(KEY);
      if (t) setToken(t);
    } catch {}
  }, []);

  const call = useCallback(
    (url, opts = {}) =>
      jfetch(url, { ...opts, headers: { 'x-sendr-admin': token, ...(opts.headers || {}) } }),
    [token]
  );

  const load = useCallback(async () => {
    if (!token) return;
    setError('');
    try {
      const res = await call('/api/admin/reports');
      setReports(res.reports);
      try {
        sessionStorage.setItem(KEY, token);
      } catch {}
    } catch (err) {
      setError(err.message);
      setReports(null);
      if (err.status === 403) setToken('');
    }
  }, [token, call]);

  useEffect(() => {
    load();
  }, [load]);

  const takedown = async (id, reportId, reason) => {
    if (!window.confirm(`Remove file ${id}? Its bytes are deleted permanently.`)) return;
    try {
      await call('/api/admin/takedown', {
        method: 'POST',
        body: JSON.stringify({ id, reportId, reason }),
      });
      toast.push('File removed', 'ok');
      load();
    } catch (err) {
      toast.push(err.message, 'err');
    }
  };

  const [migrating, setMigrating] = useState(false);
  const migrate = async () => {
    setMigrating(true);
    let total = 0;
    try {
      for (let round = 0; round < 200; round += 1) {
        const res = await call('/api/admin/migrate', { method: 'POST', body: '{}' });
        total += res.migrated || 0;
        if (!res.supported || !res.remaining) break;
      }
      toast.push(total ? `Secured ${total} older file${total === 1 ? '' : 's'}` : 'All files already use secure storage paths', 'ok');
    } catch (err) {
      toast.push(err.message, 'err');
    } finally {
      setMigrating(false);
    }
  };

  const setStatus = async (reportId, status) => {
    try {
      await call('/api/admin/reports', { method: 'POST', body: JSON.stringify({ reportId, status }) });
      load();
    } catch (err) {
      toast.push(err.message, 'err');
    }
  };

  if (!token) {
    return (
      <form
        className="panel report-form"
        onSubmit={(e) => {
          e.preventDefault();
          setToken(input.trim());
        }}
      >
        <label>
          <span>Admin token (the SENDR_ADMIN_TOKEN value on the server)</span>
          <input className="input" type="password" value={input} onChange={(e) => setInput(e.target.value)} />
        </label>
        {error && <p className="form-error">{error}</p>}
        <Btn type="submit" disabled={!input.trim()}>
          Open
        </Btn>
      </form>
    );
  }

  const shown = (reports || []).filter((r) => filter === 'all' || r.status === filter);

  return (
    <div className="admin">
      <div className="panel report-form">
        <label>
          <span>Remove a file directly (link or id)</span>
          <div className="report-row">
            <input className="input" value={manualId} onChange={(e) => setManualId(e.target.value)} />
            <Btn
              variant="danger"
              disabled={!manualId.trim()}
              onClick={() => {
                const m = /([a-z0-9]{6,40})\/?$/.exec(manualId.trim());
                if (m) takedown(m[1], null, 'policy');
              }}
            >
              Remove
            </Btn>
          </div>
        </label>
      </div>

      <div className="admin-bar">
        {['open', 'actioned', 'dismissed', 'all'].map((f) => (
          <button key={f} className={`lock-toggle ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>
            {f}
          </button>
        ))}
        <button className="lock-toggle" onClick={load}>
          Refresh
        </button>
        <button className="lock-toggle" onClick={migrate} disabled={migrating}>
          {migrating ? 'Securing…' : 'Secure older files'}
        </button>
        <button
          className="lock-toggle"
          onClick={() => {
            try {
              sessionStorage.removeItem(KEY);
            } catch {}
            setToken('');
            setReports(null);
          }}
        >
          Sign out
        </button>
      </div>

      {error && <p className="form-error">{error}</p>}
      {reports && shown.length === 0 && <p className="legal-lead">No {filter === 'all' ? '' : filter} reports.</p>}

      {shown.map((r) => (
        <div className="panel admin-report" key={r.id}>
          <div className="admin-head">
            <Chip tone={r.kind === 'copyright' ? 'chip-warn' : ''}>{r.kind}</Chip>
            <Chip>{r.status}</Chip>
            <span className="admin-date">{fmtDate(r.createdAt)}</span>
          </div>
          <div className="admin-file">
            <a href={`/d/${r.fileId}`} target="_blank" rel="noreferrer">
              /d/{r.fileId}
            </a>{' '}
            {r.file ? `· ${r.file.name} · ${fmtBytes(r.file.size)} · ${r.file.status}` : '· file no longer exists'}
          </div>
          <dl className="admin-dl">
            <dt>From</dt>
            <dd>
              {r.name || '(no name)'} &lt;{r.email}&gt;
            </dd>
            {r.work && (
              <>
                <dt>Work</dt>
                <dd>{r.work}</dd>
              </>
            )}
            <dt>Details</dt>
            <dd className="pre">{r.details}</dd>
            {r.kind === 'copyright' && (
              <>
                <dt>Signed</dt>
                <dd>
                  {r.signature || '-'} · good faith {r.goodFaith ? 'yes' : 'no'} · accurate {r.accurate ? 'yes' : 'no'}
                </dd>
              </>
            )}
          </dl>
          <div className="admin-actions">
            {r.file && r.file.status !== 'removed' && (
              <Btn variant="danger" onClick={() => takedown(r.fileId, r.id, r.kind)}>
                Remove file
              </Btn>
            )}
            {r.status === 'open' ? (
              <Btn variant="ghost" onClick={() => setStatus(r.id, 'dismissed')}>
                Dismiss
              </Btn>
            ) : (
              <Btn variant="ghost" onClick={() => setStatus(r.id, 'open')}>
                Reopen
              </Btn>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
