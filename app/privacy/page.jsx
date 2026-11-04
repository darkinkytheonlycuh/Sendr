import { LegalPage, Operator, AbuseContact } from '@/components/legal';

export const metadata = { title: 'Privacy Policy' };

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        Sendr is run by <Operator />. This page explains what data Sendr handles and why.
      </p>

      <h2>What we store</h2>
      <ul>
        <li>
          <b>Your files</b> and their name, size, type, and upload time.
        </li>
        <li>
          <b>A download counter</b> for each file.
        </li>
        <li>
          <b>Hashes</b> of delete keys, passwords and claimed sender names. We never store these in
          plain text.
        </li>
        <li>
          <b>Reports</b> you send through the report form, including the name and email you give us,
          and a hash of your IP address to fight spam.
        </li>
      </ul>

      <h2>What we do not do</h2>
      <ul>
        <li>No advertising, no third-party analytics or trackers.</li>
        <li>
          We do not sell or share your data, except where the law requires it or to deal with
          illegal content.
        </li>
      </ul>

      <h2>Your browser</h2>
      <p>
        Your Vault (the list of your uploads and their delete keys) lives only in your browser&apos;s
        local storage. Clearing site data removes it, and we cannot restore it.
      </p>

      <h2>Server logs</h2>
      <p>
        The hosting server may keep standard access logs (IP address, time, requested URL) for
        security and abuse handling.
      </p>

      <h2>Copyright notices</h2>
      <p>
        If you send a copyright notice, we may forward it, including your name and contact details,
        to the uploader and to services such as Lumen that publish takedown notices.
      </p>

      <h2>Contact</h2>
      <p>
        For privacy questions or deletion requests, contact us through <AbuseContact />.
      </p>
    </LegalPage>
  );
}
