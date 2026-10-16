import Link from 'next/link';
import Icon from '@/components/icons/Icon';
import PublicPage, { PublicSection } from '@/components/auth/PublicPage';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import { Ph, TRIAL_DAYS } from '../terms/legal';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.landing.contact.metaTitle };
}

// TODO(asoschi): telefon raqami vaqtinchalik — haqiqiy qo'llab-quvvatlash raqami bilan almashtirilsin.
const CONTACTS = [
  { key: 'telegram', value: '@savora', href: 'https://t.me/savora', icon: 'send', tone: 'b' },
  { key: 'email', value: 'support@savora.uz', href: 'mailto:support@savora.uz', icon: 'globe', tone: 'o' },
  { key: 'phone', value: '+998 90 000 00 00', href: 'tel:+998900000000', icon: 'phone', tone: 'a' },
] as const;

export default async function ContactPage() {
  const d = await getDict();
  const C = d.landing.contact;
  return (
    <PublicPage title={C.title} lead={C.lead}>
      <section className="au-article-sec">
        <h2>{C.channels}</h2>
        <div className="au-article-list">
          {CONTACTS.map((c) => (
            <a key={c.key} href={c.href} className="au-cell">
              <span className={`au-sq au-sq--${c.tone}`}><Icon name={c.icon} size={17} strokeWidth={2.2} /></span>
              <span className="au-cell-t"><b>{C[c.key]}</b></span>
              <span className="au-cell-v" style={{ fontVariantNumeric: 'tabular-nums' }}>{c.value}</span>
              <span className="au-chev"><Icon name="chevron" size={14} strokeWidth={2.6} /></span>
            </a>
          ))}
        </div>
      </section>

      <PublicSection title={C.hoursTitle}>
        <p>{C.hoursBefore}<Ph>09:00&ndash;19:00</Ph>{C.hoursAfter}</p>
      </PublicSection>

      <PublicSection title={C.demoTitle}>
        <ul>
          <li>{C.demo1}</li>
          <li>{C.demo2}</li>
          <li>{C.demo3Before}<Link href="/help" className="au-link">{d.landing.public.helpCenter}</Link>{C.demo3After}</li>
        </ul>
      </PublicSection>

      <PublicSection title={C.reqTitle}>
        <p>{C.reqBefore}<Ph>{C.reqPh}</Ph>{C.reqAfter}<Link href="/terms" className="au-link">{d.landing.public.terms}</Link>, <Link href="/privacy" className="au-link">{d.landing.public.privacy}</Link>.</p>
      </PublicSection>

      <Link href="/register" className="au-btn au-btn--filled au-btn--block">{tr(C.cta, { days: TRIAL_DAYS })}</Link>
    </PublicPage>
  );
}
