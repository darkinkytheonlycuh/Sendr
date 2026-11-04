import Link from 'next/link';
import { LegalPage, Operator, AbuseContact } from '@/components/legal';

export const metadata = { title: 'Terms of Service' };

export default function Terms() {
  return (
    <LegalPage title="Terms of Service">
      <p>
        Sendr is a file-sharing service run by <Operator />. By uploading, downloading or
        otherwise using Sendr you agree to these terms. If you do not agree, do not use the service.
      </p>

      <h2>1. Your content</h2>
      <p>
        You keep all rights to what you upload. You give us only the permission we need to store
        your file and deliver it to people who have the link. You are responsible for what you
        upload and for who you share links with.
      </p>

      <h2>2. What you may not upload</h2>
      <p>You may only upload files you own or have permission to share. You must not upload or share:</p>
      <ul>
        <li>
          Material that infringes anyone&apos;s copyright, trademark or other rights (pirated films,
          music, games, software, books, courses and so on).
        </li>
        <li>
          Child sexual abuse material. We report it to the NCMEC and law enforcement and preserve
          related records.
        </li>
        <li>Intimate images of anyone shared without their consent.</li>
        <li>Malware, phishing kits or files designed to harm devices or steal data.</li>
        <li>Personal data of others obtained or shared unlawfully (leaks, doxxing).</li>
        <li>
          Content that promotes terrorism or violent extremism, or anything else illegal where you
          or we are located.
        </li>
      </ul>

      <h2>3. How long files stay</h2>
      <p>
        Links do not expire on a timer and there is no inactivity cleanup: a finished upload stays
        until its uploader deletes it with their delete key, or we remove it under these terms.
        Abandoned unfinished uploads are cleaned up after a few days. We work to keep files
        available but cannot promise that any file or the service will exist forever. Keep your own
        copy of anything important.
      </p>

      <h2>4. Removal and enforcement</h2>
      <p>
        We may remove any file that violates these terms or that we receive a valid legal complaint
        about, and we may block repeat infringers. Copyright complaints follow our{' '}
        <Link href="/copyright">Copyright &amp; DMCA policy</Link>. Other problems can be reported
        through <AbuseContact />.
      </p>

      <h2>5. Passwords and delete keys</h2>
      <p>
        Passwords and delete keys are stored only as hashes. If you lose a delete key we cannot
        recover it. Password protection restricts who can download a file, but files are not
        end-to-end encrypted.
      </p>

      <h2>6. No warranty</h2>
      <p>
        Sendr is provided &quot;as is&quot;, without warranties of any kind. To the extent the law
        allows, we are not liable for lost data, lost profits, or indirect damages arising from your
        use of the service.
      </p>

      <h2>7. Changes</h2>
      <p>
        We may update these terms. The date at the top shows the latest version. Continued use means
        you accept the update.
      </p>
    </LegalPage>
  );
}
