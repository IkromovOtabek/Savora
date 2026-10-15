import Link from 'next/link';
import Icon from '@/components/icons/Icon';
import PublicPage from '@/components/auth/PublicPage';

export const metadata = { title: "Bog'lanish — Savora" };

const CONTACTS = [
  { label: 'Telegram', value: '@savora', href: 'https://t.me/savora', icon: 'send', tone: 'b' },
  { label: 'Email', value: 'support@savora.uz', href: 'mailto:support@savora.uz', icon: 'globe', tone: 'o' },
  { label: 'Telefon', value: '+998 90 000 00 00', href: 'tel:+998900000000', icon: 'phone', tone: 'a' },
] as const;

export default function ContactPage() {
  return (
    <PublicPage title="Bog'lanish" lead="Savora jamoasi bilan bog'lanish usullari.">
      <section className="au-article-sec">
        <h2>Aloqa</h2>
        <div className="au-article-list">
          {CONTACTS.map((c) => (
            <a key={c.label} href={c.href} className="au-cell">
              <span className={`au-sq au-sq--${c.tone}`}><Icon name={c.icon} size={17} strokeWidth={2.2} /></span>
              <span className="au-cell-t"><b>{c.label}</b></span>
              <span className="au-cell-v" style={{ fontVariantNumeric: 'tabular-nums' }}>{c.value}</span>
              <span className="au-chev"><Icon name="chevron" size={14} strokeWidth={2.6} /></span>
            </a>
          ))}
        </div>
      </section>

      <Link href="/register" className="au-btn au-btn--filled au-btn--block">14 kun bepul sinab ko&apos;rish</Link>
    </PublicPage>
  );
}
