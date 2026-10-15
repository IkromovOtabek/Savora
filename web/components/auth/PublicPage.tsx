import Link from 'next/link';
import BrandMark from '@/components/BrandMark';
import Icon from '@/components/icons/Icon';
import './auth.css';
import './public.css';

/** Ommaviy ikkilamchi sahifalar (yordam, bog'lanish, shartlar) — o'qishga qulay maqola */
export default function PublicPage({
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
  return (
    <div className="au-page">
      <header className="au-nav">
        <div className="au-nav-in">
          <Link href="/" className="au-brand">
            <BrandMark size={30} />
            Savora
          </Link>
          <Link href="/" className="au-btn au-btn--plain au-btn--sm">
            <Icon name="arrowLeft" size={16} /> Bosh sahifa
          </Link>
        </div>
      </header>
      <main className={`au-article${wide ? ' au-article--wide' : ''}`}>
        <div className="au-article-head">
          <h1>{title}</h1>
          {lead && <p>{lead}</p>}
          {updated && <span className="pp-updated">Tahrir: {updated}</span>}
        </div>
        {children}
      </main>
      <footer className="pp-foot">
        <nav aria-label="Hujjatlar">
          <Link href="/help">Yordam</Link>
          <Link href="/terms">Ommaviy oferta</Link>
          <Link href="/privacy">Maxfiylik siyosati</Link>
          <Link href="/contact">Bog&apos;lanish</Link>
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
