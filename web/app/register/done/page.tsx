import Link from 'next/link';
import { BrandGlyph } from '@/components/BrandMark';
import { getDict } from '@/lib/i18n/server';
import '../../login/login.css';

export async function generateMetadata() {
  return { title: (await getDict()).auth.register.appDoneMeta };
}

/**
 * Mobil ilovadan ro'yxatdan o'tgandan keyingi sahifa: login ko'rsatiladi va
 * "Ilovaga qaytish" ilovani login oldindan to'ldirilgan holda ochadi (savora://login?u=...).
 */
export default async function RegisterDonePage({ searchParams }: { searchParams: Promise<{ u?: string }> }) {
  const raw = (await searchParams).u ?? '';
  const username = /^[a-z0-9_]{3,40}$/.test(raw) ? raw : '';
  const t = (await getDict()).auth.register;
  const appHref = `savora://login${username ? `?u=${username}` : ''}`;

  return (
    <div className="lg">
      <div className="lg-top" />
      <main className="lg-main">
        <div className="lg-card">
          <span className="lg-brand">
            <span className="lg-brand-mark"><BrandGlyph size={34} radius={0} /></span>
            Savora
          </span>
          <header className="lg-head">
            <h1 className="lg-title">{t.appDoneTitle}</h1>
            <p className="lg-sub">{t.appDoneText}</p>
          </header>
          {username && (
            <p className="lg-sub">{t.appDoneLogin} <b style={{ color: 'var(--ink-1)' }}>{username}</b></p>
          )}
          <a href={appHref} className="lg-submit" style={{ display: 'flex', width: '100%', textDecoration: 'none', marginTop: 20 }}>{t.appBack}</a>
          <p className="lg-note">{t.appBackHint}</p>
          <p className="lg-note"><Link href="/app" className="lg-link">{t.appOpenWeb}</Link></p>
        </div>
      </main>
    </div>
  );
}
