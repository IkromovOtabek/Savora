'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getDict } from '@/lib/i18n/server';
import { clientIpFrom } from '@/lib/security';
import { getBuyer, loginBuyer, registerBuyer, setBuyerCookie, clearBuyerCookie } from '@/lib/ecom/buyerAuth';
import { cartListings, type ListingCard } from '@/lib/ecom/catalog';
import { cancelBuyerOrder, placeMarketOrders, type CartLine } from '@/lib/ecom/orders';
import { placeErrorText, placeSuccessText } from '@/lib/ecom/api';
import { MARKET_DELIVERY, type MarketDelivery } from '@/lib/models/master/MarketOrder';

/**
 * Savora Market — xaridor amallari (ochiq bozor /market). Xaridor sessiyasi alohida cookie (lib/ecom/buyerAuth).
 */

type AuthState = { error?: string } | null;

/** Ichki yo'l bo'lsagina qaytish (ochiq redirect himoyasi) */
function safeNext(v: FormDataEntryValue | null): string {
  const s = String(v ?? '');
  return s.startsWith('/market') && !s.startsWith('//') ? s : '/market';
}

async function ip(): Promise<string> {
  return clientIpFrom(await headers());
}

export async function buyerLoginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const t = (await getDict()).ecom.market.auth.errors;
  const r = await loginBuyer({ phone: formData.get('phone'), password: formData.get('password') }, await ip());
  if (!r.ok) return { error: t[r.error as keyof typeof t] ?? t.invalid };
  await setBuyerCookie(r.buyer);
  redirect(safeNext(formData.get('next')));
}

export async function buyerRegisterAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const t = (await getDict()).ecom.market.auth.errors;
  const r = await registerBuyer({ name: formData.get('name'), phone: formData.get('phone'), password: formData.get('password') }, await ip());
  if (!r.ok) return { error: t[r.error as keyof typeof t] ?? t.invalid };
  await setBuyerCookie(r.buyer);
  redirect(safeNext(formData.get('next')));
}

export async function buyerLogoutAction(): Promise<void> {
  await clearBuyerCookie();
  redirect('/market');
}

/** Savatdagi tovarlarning joriy holati (narx, qoldiq) */
export async function refreshCartAction(ids: string[]): Promise<ListingCard[]> {
  return cartListings(ids);
}

export type PlaceState =
  | { ok: true; message: string; failedShops: string[] }
  | { ok: false; error: string; listingId?: string; refresh?: boolean }
  | null;

export async function placeOrderAction(payload: { lines: CartLine[]; delivery: string; address?: string; note?: string; clientId?: string }): Promise<PlaceState> {
  const t = (await getDict()).ecom.market;
  const buyer = await getBuyer();
  if (!buyer) return { ok: false, error: t.errors.loginRequired };
  const delivery: MarketDelivery = (MARKET_DELIVERY as readonly string[]).includes(payload?.delivery) ? (payload.delivery as MarketDelivery) : 'pickup';
  const r = await placeMarketOrders(buyer, {
    lines: payload?.lines ?? [], delivery, address: payload?.address, note: payload?.note, clientId: payload?.clientId,
  });
  if (!r.ok) {
    return { ok: false, error: placeErrorText(t, r), listingId: r.listingId, refresh: ['unavailable', 'notEnough', 'priceChanged'].includes(r.error) };
  }
  revalidatePath('/market/orders');
  return { ok: true, message: placeSuccessText(t, r), failedShops: r.failedShops.map((s) => s.slug) };
}

export async function cancelMyOrderAction(orderId: string): Promise<{ ok: boolean; message: string }> {
  const t = (await getDict()).ecom.market.orders;
  const buyer = await getBuyer();
  if (!buyer) return { ok: false, message: t.cancelFailed };
  const ok = await cancelBuyerOrder(buyer.id, String(orderId));
  revalidatePath('/market/orders');
  return { ok, message: ok ? t.cancelled : t.cancelFailed };
}
