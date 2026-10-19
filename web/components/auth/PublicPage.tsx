import Link from 'next/link';
import BrandMark, { Wordmark } from '@/components/BrandMark';
import Icon from '@/components/icons/Icon';
import LangSwitch from '@/components/LangSwitch';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import './auth.css';
import './public.css';

/** Ommaviy ikkilamchi sahifalar (yordam, bog'lanish, shartlar) — o'qishga qulay maqola */
export default async function PublicPage({
  title,
  lead,
  updated,
  wide,
  children,
}: {
  title: string;
  lead?: React.ReactNode;
  /** Hujjat sanasi (masalan, "2026-yil oktabr") — sarlavha ostida ko'rsatiladi */
  updated?: string;
  /** Kengroq maqola (yordam markazi) */
  wide?: boolean;
  children: React.ReactNode;
}) {
  const d = await getDict();
  const P = d.landing.public;
  return (
    <div className="au-page">
      <header className="au-nav">
        <div className="au-nav-in">
          <Link href="/" className="au-brand">
            <BrandMark size={30} />
            <Wordmark height={15} />
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <LangSwitch compact />
            <Link href="/" className="au-btn au-btn--plain au-btn--sm">
              <Icon name="arrowLeft" size={16} /> {d.common.home}
            </Link>
          </div>
        </div>
      </header>
      <main className={`au-article${wide ? ' au-article--wide' : ''}`}>
        <div className="au-article-head">
          <h1>{title}</h1>
          {lead && <p>{lead}</p>}
          {updated && <span className="pp-updated">{tr(P.updated, { date: updated })}</span>}
        </div>
        {children}
      </main>
      <footer className="pp-foot">
        <nav aria-label={P.docsAria}>
          <Link href="/help">{P.help}</Link>
          <Link href="/terms">{P.terms}</Link>
          <Link href="/privacy">{P.privacy}</Link>
          <Link href="/contact">{P.contact}</Link>
        </nav>
        <span>© {new Date().getFullYear()} Savora</span>
      </footer>
    </div>
  );
}

/** Guruhlangan bo'lim: kichik sarlavha + oq karta */
export function PublicSection({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <section className="au-article-sec" id={id}>
      <h2>{title}</h2>
      <div className="au-article-card">{children}</div>
    </section>
  );
}
