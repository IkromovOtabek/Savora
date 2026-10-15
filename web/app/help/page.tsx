import Link from 'next/link';
import PublicPage, { PublicSection } from '@/components/auth/PublicPage';
import { TRIAL_DAYS } from '../terms/legal';
import { helpArticles } from './articles';
import HelpCenter from './HelpCenter';

export const metadata = {
  title: 'Yordam markazi — Savora',
  description: "Savora bo'yicha qo'llanma: ro'yxatdan o'tish, sotuv, nasiya, PQ-294 (2027) talablari, ombor, kassa, mobil ilova va tariflar.",
};

export default function HelpPage() {
  const articles = helpArticles(TRIAL_DAYS);
  return (
    <PublicPage wide title="Yordam markazi" lead="Savora bilan ishlash bo'yicha qisqa, qadamma-qadam qo'llanma.">
      <HelpCenter articles={articles} />

      <PublicSection title="Javob topmadingizmi?">
        <p>
          Telegram yoki telefon orqali yozing &mdash; <Link href="/contact" className="au-link">Bog&apos;lanish</Link>.
          Ma&apos;lumotlaringizni ko&apos;chirish va xodimlarni o&apos;rgatishda bepul yordam beramiz.
        </p>
      </PublicSection>
    </PublicPage>
  );
}
