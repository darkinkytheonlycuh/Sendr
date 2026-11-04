import './globals.css';
import Nav from '@/components/nav';
import Footer from '@/components/footer';
import ParticleField from '@/components/fx';
import { ToastProvider } from '@/components/toast';

export const metadata = {
  title: {
    default: 'Sendr: forever file sharing',
    template: '%s · Sendr',
  },
  description:
    'Forever file sharing. Drop any file up to 1 TB, get a link that never expires. No accounts, no tracking, custom storage engine.',
  applicationName: 'Sendr',
  keywords: [
    'file sharing',
    'send files',
    'large file transfer',
    'forever links',
    'no account file upload',
  ],
  openGraph: {
    title: 'Sendr: forever file sharing',
    description:
      'Drop any file up to 1 TB and get a link that never expires. No account or signup required.',
    type: 'website',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#08090c',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="bg-stack" aria-hidden="true">
          <div className="orb orb-a" />
          <div className="orb orb-b" />
          <div className="orb orb-c" />
          <div className="grid-overlay" />
        </div>
        <ParticleField />
        <ToastProvider>
          <div className="page-shell">
            <Nav />
            <main style={{ flex: 1 }}>{children}</main>
            <Footer />
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
