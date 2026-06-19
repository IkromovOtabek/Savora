import { getAppZone, getTenantSlug, resolveTenant } from '@/lib/tenantContext';
import { isOrganizationActive } from '@/lib/models/master/Organization';
import { tenantLoginUrl } from '@/lib/urls';
import ForgotForm from './ForgotForm';

export const metadata = { title: 'Parolni tiklash — Savora' };

export default async function ForgotPage() {
  const zone = await getAppZone();

  let title = 'Parolni tiklash';
  let storeName = '';
  let canReset = false;
  let notice = '';

  if (zone === 'tenant') {
    const org = await resolveTenant();
    if (!org) {
      notice = 'Do\'kon topilmadi. Manzilni tekshiring.';
    } else if (!isOrganizationActive(org)) {
      storeName = org.name;
      notice = 'Bu do\'kon obunasi to\'xtatilgan. Platforma egasiga murojaat qiling.';
    } else {
      storeName = org.name;
      canReset = true;
    }
  } else {
    notice = 'Parolni tiklash faqat do\'kon kirish sahifasidan mavjud.';
  }

  const slug = zone === 'tenant' ? await getTenantSlug() : '';

  return (
    <ForgotForm
      title={title}
      storeName={storeName}
      canReset={canReset}
      notice={notice}
      tenantSlug={slug || undefined}
      loginUrl={slug ? tenantLoginUrl(slug) : '/login'}
    />
  );
}
