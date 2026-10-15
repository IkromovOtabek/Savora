import PublicPage, { PublicSection } from '@/components/auth/PublicPage';

/** Huquqiy hujjatlarning umumiy tahrir sanasi (oferta va maxfiylik bir vaqtda yangilanadi) */
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

/** Raqamlangan bo'limlar + mundarija bilan hujjat */
export function LegalDoc({ title, lead, sections }: { title: string; lead: React.ReactNode; sections: LegalSection[] }) {
  return (
    <PublicPage title={title} lead={lead} updated={LEGAL_UPDATED}>
      <nav className="pp-toc" aria-label="Mundarija">
        <b>Mundarija</b>
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
