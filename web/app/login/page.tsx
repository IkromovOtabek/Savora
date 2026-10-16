import { redirect } from 'next/navigation';
import { getAppZone, getTenantSlug, resolveTenant } from '@/lib/tenantContext';
import { getCurrentUser } from '@/lib/auth';
import { isOrganizationActive } from '@/lib/models/master/Organization';
import { DB_UNAVAILABLE_MESSAGE, isDbConnectionError } from '@/lib/dbError';
import { tenantForgotUrl } from '@/lib/urls';
import { getDict } from '@/lib/i18n/server';
import LoginForm from './LoginForm';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.auth.login.metaTitle };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ blocked?: string; welcome?: string; u?: string; setup?: string }>;
}) {
  const sp = await searchParams;
  const zone = await getAppZone();
  const user = await getCurrentUser();
  if (user && sp?.blocked !== '1') {
    redirect(user.role === 'super_admin' ? '/super' : '/app');
  }

  const d = await getDict();
  const t = d.auth.login;
  let title = t.title;
  let subtitle = '';
  let canLogin = false;
  let notice = '';
  let dbError = '';

  if (zone === 'super') {
    title = t.superTitle;
    subtitle = t.superSubtitle;
    canLogin = true;
  } else if (zone === 'tenant') {
    try {
      const org = await resolveTenant();
      if (!org) {
        title = t.storeNotFound;
        notice = t.storeNotFoundNotice;
      } else if (!isOrganizationActive(org)) {
        title = org.name;
        notice = t.storeInactiveNotice;
      } else {
        title = org.name;
        subtitle = t.storeSubtitle;
        canLogin = true;
      }
    } catch (err) {
      if (isDbConnectionError(err)) {
        title = t.storeSystem;
        dbError = DB_UNAVAILABLE_MESSAGE;
      } else {
        throw err;
      }
    }
  } else {
    // Asosiy sayt — biznes egasi/xodim login + parol bilan to'g'ridan-to'g'ri kiradi.
    // Qaysi do'kon ekani username orqali aniqlanadi (global registr) — manzil (slug) so'ralmaydi.
    title = t.rootTitle;
    subtitle = t.rootSubtitle;
    canLogin = true;
  }

  const tenantSlug = zone === 'tenant' ? await getTenantSlug() : '';
  const forgotUrl = canLogin && zone === 'tenant' && tenantSlug ? tenantForgotUrl(tenantSlug) : undefined;
  // root zonada ham tenant sifatida autentifikatsiya qilinadi (do'kon username orqali topiladi)
  const loginZone: 'super' | 'tenant' | undefined =
    canLogin && zone === 'super' ? 'super' : canLogin ? 'tenant' : undefined;

  return (
    <LoginForm
      title={title}
      subtitle={subtitle}
      canLogin={canLogin}
      notice={notice}
      dbError={dbError}
      blocked={sp?.blocked === '1'}
      welcome={sp?.welcome === '1'}
      defaultUsername={sp?.u ? String(sp.u).slice(0, 64) : undefined}
      loginZone={loginZone}
      tenantSlug={tenantSlug || undefined}
      forgotUrl={forgotUrl}
      showRegister={zone === 'root'}
    />
  );
}
