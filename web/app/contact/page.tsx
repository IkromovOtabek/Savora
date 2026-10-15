import Link from 'next/link';
import Icon from '@/components/icons/Icon';
import PublicPage, { PublicSection } from '@/components/auth/PublicPage';
import { Ph, TRIAL_DAYS } from '../terms/legal';

export const metadata = { title: "Bog'lanish — Savora" };

// TODO(asoschi): telefon raqami vaqtinchalik — haqiqiy qo'llab-quvvatlash raqami bilan almashtirilsin.
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

      <PublicSection title="Ish vaqti">
        <p>Dushanba&ndash;shanba, <Ph>09:00&ndash;19:00</Ph> (Toshkent vaqti). Telegram&apos;ga yozilgan xabarlarga odatda shu kunning o&apos;zida javob beramiz.</p>
      </PublicSection>

      <PublicSection title="Demo va ko'chirish">
        <ul>
          <li>10 daqiqalik onlayn demo yoki do&apos;koningizga borib ko&apos;rsatish &mdash; Telegram orqali vaqt belgilang.</li>
          <li>Excel yoki daftardagi tovar va qarz ro&apos;yxatini ko&apos;chirishda bepul yordam beramiz.</li>
          <li>Ko&apos;p uchraydigan savollar &mdash; <Link href="/help" className="au-link">Yordam markazi</Link>da.</li>
        </ul>
      </PublicSection>

      <PublicSection title="Rekvizitlar">
        <p>Savora (yuridik shaxs ma&apos;lumotlari: <Ph>nomi, STIR, manzil</Ph>). Hujjatlar: <Link href="/terms" className="au-link">Ommaviy oferta</Link>, <Link href="/privacy" className="au-link">Maxfiylik siyosati</Link>.</p>
      </PublicSection>

      <Link href="/register" className="au-btn au-btn--filled au-btn--block">{TRIAL_DAYS} kun bepul sinab ko&apos;rish</Link>
    </PublicPage>
  );
}
