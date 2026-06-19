import { cookies } from 'next/headers';

const COOKIE_OPTS = {
  path: '/',
  httpOnly: true,
  sameSite: 'lax' as const,
  maxAge: 8 * 60 * 60,
};

export async function setRouteCookies(zone: 'super' | 'tenant', tenantSlug?: string) {
  const store = await cookies();
  store.set('sp_zone', zone, COOKIE_OPTS);
  if (zone === 'tenant' && tenantSlug) {
    store.set('sp_tenant', tenantSlug, COOKIE_OPTS);
  } else {
    store.delete('sp_tenant');
  }
}

export async function clearRouteCookies() {
  const store = await cookies();
  store.delete('sp_zone');
  store.delete('sp_tenant');
}
