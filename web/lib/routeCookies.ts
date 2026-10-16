import { cookies } from 'next/headers';

const COOKIE_OPTS = {
  path: '/',
  httpOnly: true,
  sameSite: 'lax' as const,
  maxAge: 8 * 60 * 60,
};

/** maxAge — sessiya bilan bir xil bo'lishi kerak («Eslab qolish»da 30 kun) */
export async function setRouteCookies(zone: 'super' | 'tenant', tenantSlug?: string, maxAge = COOKIE_OPTS.maxAge) {
  const store = await cookies();
  const opts = { ...COOKIE_OPTS, maxAge };
  store.set('sp_zone', zone, opts);
  if (zone === 'tenant' && tenantSlug) {
    store.set('sp_tenant', tenantSlug, opts);
  } else {
    store.delete('sp_tenant');
  }
}

export async function clearRouteCookies() {
  const store = await cookies();
  store.delete('sp_zone');
  store.delete('sp_tenant');
}
