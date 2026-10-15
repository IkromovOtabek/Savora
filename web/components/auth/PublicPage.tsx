import Link from 'next/link';
import BrandMark from '@/components/BrandMark';
import Icon from '@/components/icons/Icon';
import './auth.css';

/** Ommaviy ikkilamchi sahifalar (yordam, bog'lanish, shartlar) — o'qishga qulay maqola */
export default function PublicPage({
  title,
  lead,
  children,
}: {
  title: string;
  lead?: React.ReactNode;
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
      <main className="au-article">
        <div className="au-article-head">
          <h1>{title}</h1>
          {lead && <p>{lead}</p>}
        </div>
        {children}
      </main>
    </div>
  );
}

/** Guruhlangan bo'lim: kichik sarlavha + oq karta */
export function PublicSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="au-article-sec">
      <h2>{title}</h2>
      <div className="au-article-card">{children}</div>
    </section>
  );
}
