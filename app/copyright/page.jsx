import Link from 'next/link';
import { LegalPage, Operator, AbuseContact } from '@/components/legal';

export const metadata = { title: 'Copyright & DMCA Policy' };

export default function Copyright() {
  return (
    <LegalPage title="Copyright & DMCA Policy">
      <p>
        <Operator /> respects intellectual property rights and responds to notices of alleged
        infringement under the U.S. Digital Millennium Copyright Act (17 U.S.C. § 512) and similar
        laws.
      </p>

      <h2>Sending a takedown notice</h2>
      <p>
        The fastest way is the <Link href="/report?kind=copyright">copyright report form</Link>.
        Your notice must include:
      </p>
      <ol>
        <li>Your physical or electronic signature (typing your full legal name counts).</li>
        <li>Identification of the copyrighted work you say is infringed.</li>
        <li>The Sendr link(s) of the infringing file.</li>
        <li>Your contact details (an email address at minimum).</li>
        <li>
          A statement that you believe in good faith the use is not authorized by the owner, its
          agent, or the law.
        </li>
        <li>
          A statement, under penalty of perjury, that the notice is accurate and that you are the
          owner or authorized to act for the owner.
        </li>
      </ol>
      <p>
        You can also send a notice to our designated agent: <AbuseContact />.
      </p>

      <h2>What happens next</h2>
      <p>
        When we receive a complete notice we remove or disable the file promptly. The link then
        shows that the file was removed. Knowingly false notices can make you liable for damages
        under § 512(f).
      </p>

      <h2>Counter-notices</h2>
      <p>
        If your file was removed by mistake or misidentification, you can send a counter-notice
        through <AbuseContact /> with: your signature; the link of the removed file; a statement
        under penalty of perjury that you believe in good faith it was removed by mistake; your name,
        address and phone number; and consent to the jurisdiction of your local federal court (or,
        outside the U.S., any judicial district where we may be found), and to accept service from
        the person who sent the notice. We may restore the file in 10 to 14 business days unless the
        complainant tells us they have filed a court action.
      </p>

      <h2>Repeat infringers</h2>
      <p>We block uploads from users who repeatedly infringe, where we can identify them.</p>
    </LegalPage>
  );
}
