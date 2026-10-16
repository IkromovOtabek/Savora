import { getAppZone, getTenantSlug, resolveTenant } from '@/lib/tenantContext';
import { isOrganizationActive } from '@/lib/models/master/Organization';
import { tenantLoginUrl } from '@/lib/urls';
import { getDict } from '@/lib/i18n/server';
import ForgotForm from './ForgotForm';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.auth.forgot.metaTitle };
}

export default async function ForgotPage() {
  const zone = await getAppZone();
  const d = await getDict();
  const t = d.auth.forgot;

  const title = t.title;
  let storeName = '';
  let canReset = false;
  let notice = '';

  if (zone === 'tenant') {
    const org = await resolveTenant();
    if (!org) {
      notice = t.storeNotFound;
    } else if (!isOrganizationActive(org)) {
      storeName = org.name;
      notice = t.storeSuspended;
    } else {
      storeName = org.name;
      canReset = true;
    }
  } else {
    notice = t.tenantOnly;
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
