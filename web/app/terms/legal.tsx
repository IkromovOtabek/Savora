import PublicPage, { PublicSection } from '@/components/auth/PublicPage';
import { getI18n } from '@/lib/i18n/server';

/** Huquqiy hujjatlarning umumiy tahrir sanasi (oferta va maxfiylik bir vaqtda yangilanadi) — tilga mos: d.landing.legal.updated */
export const LEGAL_UPDATED = '2026-yil oktabr';

/** Sinov muddati — register action va landing bilan bir xil manba */
export const TRIAL_DAYS = Number(process.env.TRIAL_DAYS || 14);

/** [Kvadrat qavsdagi] to'ldiriladigan joy — asoschi/yurist tomonidan aniq qiymat qo'yiladi */
export function Ph({ children }: { children: React.ReactNode }) {
  return <em className="pp-ph">[{children}]</em>;
}

export interface LegalSection {
  id: string;
  title: string;
  body: React.ReactNode;
}

/** Raqamlangan bo'limlar + mundarija bilan hujjat. Huquqiy matn tanasi o'zbekcha — ru'da sahifa boshida eslatma. */
export async function LegalDoc({ title, lead, sections }: { title: string; lead: React.ReactNode; sections: LegalSection[] }) {
  const { locale, d } = await getI18n();
  return (
    <PublicPage title={title} lead={lead} updated={d.landing.legal.updated}>
      {locale === 'ru' && <p className="pp-note" lang="ru">{d.landing.public.legalLangNote}</p>}
      <nav className="pp-toc" aria-label={d.landing.public.toc}>
        <b>{d.landing.public.toc}</b>
        <ol>
          {sections.map((s) => (
            <li key={s.id}><a href={`#${s.id}`}>{s.title}</a></li>
          ))}
        </ol>
      </nav>
      {sections.map((s, i) => (
        <PublicSection key={s.id} id={s.id} title={`${i + 1}. ${s.title}`}>
          {s.body}
        </PublicSection>
      ))}
    </PublicPage>
  );
}
