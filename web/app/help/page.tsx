import Link from 'next/link';
import PublicPage, { PublicSection } from '@/components/auth/PublicPage';
import { getDict } from '@/lib/i18n/server';
import { TRIAL_DAYS } from '../terms/legal';
import { helpArticles } from './articles';
import HelpCenter from './HelpCenter';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.landing.help.metaTitle, description: d.landing.help.metaDesc };
}

export default async function HelpPage() {
  const d = await getDict();
  const H = d.landing.help;
  const articles = helpArticles(TRIAL_DAYS);
  return (
    <PublicPage wide title={H.title} lead={H.lead}>
      <HelpCenter articles={articles} />

      <PublicSection title={H.notFoundTitle}>
        <p>
          {H.notFoundBefore}<Link href="/contact" className="au-link">{d.landing.public.contact}</Link>{H.notFoundAfter}
        </p>
      </PublicSection>
    </PublicPage>
  );
}
