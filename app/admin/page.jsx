import AdminPanel from '@/components/admin-panel';

export const metadata = { title: 'Moderation', robots: { index: false, follow: false } };

export default function AdminPage() {
  return (
    <section className="section">
      <div className="container legal">
        <p className="legal-kicker">Operator only</p>
        <h1 className="section-title">Moderation</h1>
        <AdminPanel />
      </div>
    </section>
  );
}
