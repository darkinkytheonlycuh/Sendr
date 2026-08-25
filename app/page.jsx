import Uploader from '@/components/uploader';
import Vault from '@/components/vault';
import { Faq, Features, Hero, StatsBand } from '@/components/home-sections';

export default function Home() {
  return (
    <>
      <Hero />
      <section className="section" style={{ paddingTop: 8 }}>
        <div className="container">
          <Uploader />
        </div>
      </section>
      <Features />
      <StatsBand />
      <Vault />
      <Faq />
    </>
  );
}
