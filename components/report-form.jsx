'use client';

import { useState } from 'react';
import Link from 'next/link';
import { jfetch } from '@/lib/uploader';
import { Btn } from './ui';

const KINDS = [
  { v: 'copyright', label: 'Copyright infringement (DMCA)' },
  { v: 'illegal', label: 'Illegal content' },
  { v: 'abuse', label: 'Malware, phishing or abuse' },
  { v: 'other', label: 'Something else' },
];

export default function ReportForm({ initialFile = '', initialKind = '' }) {
  const [kind, setKind] = useState(KINDS.some((k) => k.v === initialKind) ? initialKind : 'copyright');
  const [form, setForm] = useState({
    file: initialFile,
    name: '',
    email: '',
    work: '',
    details: '',
    signature: '',
    goodFaith: false,
    accurate: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const set = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await jfetch('/api/report', {
        method: 'POST',
        body: JSON.stringify({ ...form, kind }),
      });
      setDone(res.reportId);
    } catch (err) {
      setError(err.message || 'Could not send the report');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="panel report-done">
        <h2>Report received</h2>
        <p>
          Reference <code>{done}</code>. We review every report and will contact you at the email
          you gave if we need more information.
        </p>
        <Link href="/" className="btn btn-ghost">
          Back to Sendr
        </Link>
      </div>
    );
  }

  const isCopyright = kind === 'copyright';

  return (
    <form className="panel report-form" onSubmit={submit}>
      <label>
        <span>What is the problem?</span>
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
          {KINDS.map((k) => (
            <option key={k.v} value={k.v}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Sendr link of the file</span>
        <input className="input" required placeholder="https://…/d/abc123…" value={form.file} onChange={set('file')} />
      </label>
      <div className="report-row">
        <label>
          <span>{isCopyright ? 'Full legal name' : 'Your name (optional)'}</span>
          <input className="input" required={isCopyright} value={form.name} onChange={set('name')} maxLength={120} />
        </label>
        <label>
          <span>Email</span>
          <input className="input" type="email" required value={form.email} onChange={set('email')} maxLength={200} />
        </label>
      </div>
      {isCopyright && (
        <label>
          <span>Copyrighted work being infringed</span>
          <input
            className="input"
            required
            placeholder="Title, and a link to the original if possible"
            value={form.work}
            onChange={set('work')}
            maxLength={2000}
          />
        </label>
      )}
      <label>
        <span>Details</span>
        <textarea className="input" required rows={5} value={form.details} onChange={set('details')} maxLength={5000} />
      </label>
      {isCopyright && (
        <>
          <label className="check">
            <input type="checkbox" checked={form.goodFaith} onChange={set('goodFaith')} required />
            <span>
              I have a good-faith belief that this use is not authorized by the copyright owner, its
              agent, or the law.
            </span>
          </label>
          <label className="check">
            <input type="checkbox" checked={form.accurate} onChange={set('accurate')} required />
            <span>
              Under penalty of perjury, the information in this notice is accurate and I am the
              copyright owner or authorized to act on their behalf.
            </span>
          </label>
          <label>
            <span>Electronic signature (type your full name)</span>
            <input className="input" required value={form.signature} onChange={set('signature')} maxLength={120} />
          </label>
        </>
      )}
      {error && <p className="form-error">{error}</p>}
      <Btn type="submit" disabled={busy}>
        {busy ? 'Sending…' : 'Send report'}
      </Btn>
    </form>
  );
}
