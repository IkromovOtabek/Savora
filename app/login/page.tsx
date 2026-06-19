import { redirect } from 'next/navigation';
import { getAppZone, getTenantSlug, resolveTenant } from '@/lib/tenantContext';
import { getCurrentUser } from '@/lib/auth';
import { isOrganizationActive } from '@/lib/models/master/Organization';
import { DB_UNAVAILABLE_MESSAGE, isDbConnectionError } from '@/lib/dbError';
import LoginForm from './LoginForm';

export const metadata = { title: 'Kirish — Savora' };

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

  let title = 'Kirish';
  let subtitle = '';
  let canLogin = false;
  let notice = '';
  let dbError = '';

  if (zone === 'super') {
    title = 'Platforma boshqaruvi';
    subtitle = 'Super admin kirishi';
    canLogin = true;
  } else if (zone === 'tenant') {
    try {
      const org = await resolveTenant();
      if (!org) {
        title = "Do'kon topilmadi";
        notice = 'Bunday manzildagi do\'kon mavjud emas. Manzilni tekshiring.';
      } else if (!isOrganizationActive(org)) {
        title = org.name;
        notice = "Bu do'kon obunasi to'xtatilgan yoki muddati tugagan. Platforma egasiga murojaat qiling.";
      } else {
        title = org.name;
        subtitle = "Do'kon tizimiga kirish";
        canLogin = true;
      }
    } catch (err) {
      if (isDbConnectionError(err)) {
        title = "Do'kon tizimi";
        dbError = DB_UNAVAILABLE_MESSAGE;
      } else {
        throw err;
      }
    }
  } else {
    title = 'Tizimga kirish';
    notice = 'Super Admin: http://localhost:3000/super/login · Do\'kon: http://localhost:3000/t/dokon-slug/login';
  }

  const tenantSlug = zone === 'tenant' ? await getTenantSlug() : '';

  return (
    <LoginForm
      title={title}
      subtitle={subtitle}
      canLogin={canLogin}
      notice={notice}
      dbError={dbError}
      blocked={sp?.blocked === '1'}
      welcome={sp?.welcome === '1'}
      defaultUsername={sp?.u ? decodeURIComponent(sp.u) : undefined}
      loginZone={canLogin && zone === 'super' ? 'super' : canLogin && zone === 'tenant' ? 'tenant' : undefined}
      tenantSlug={tenantSlug || undefined}
    />
  );
}
