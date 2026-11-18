'use server';

import { revalidatePath } from 'next/cache';
import { getTenantAdminSession } from '@/lib/tenantSession';
import { saveShopSettingsPart } from '@/lib/shopSettings';
import { recordAudit } from '@/lib/audit';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import { syncOrgListingsById } from '@/lib/ecom/sync';
import { applyEcomEdit, setEcomListed, type EcomEditInput } from '@/lib/ecom/manage';
import { completeShopOrder, setShopOrderStatus } from '@/lib/ecom/orders';

/**
 * E-commerce — biznes egasi amallari (faqat admin). Mantiq lib/ecom/* da (mobil API bilan umumiy).
 */

type State = { error?: string; success?: string } | null;

/** Sozlama: avtomatik chiqarish + xaridor uchun shartlar. Katalog darhol qayta yig'iladi */
export async function saveEcomSettingsAction(_prev: State, formData: FormData): Promise<State> {
  const { user, org, ShopSettings } = await getTenantAdminSession();
  const k = (await getDict()).ecom.settings;
  const autoPublish = formData.get('autoPublish') === '1';
  const note = String(formData.get('note') ?? '').trim().slice(0, 300);
  try {
    await saveShopSettingsPart(ShopSettings, 'ecom', { autoPublish, note: note || undefined }, user.username);
  } catch {
    return { error: k.failed };
  }
  await recordAudit(user, {
    action: 'settings.ecom', entity: 'branch',
    summary: `E-commerce: avtomatik chiqarish ${autoPublish ? 'yoqildi' : "o'chirildi"}`,
  });
  await syncOrgListingsById(String(org._id));
  revalidatePath('/app/settings');
  revalidatePath('/app/ecom');
  return { success: k.saved };
}

/** Ko'rsatish/yashirish (bitta yoki tanlanganlar): 'show' | 'hide' | 'auto' */
export async function setEcomListedAction(keys: string[], mode: 'show' | 'hide' | 'auto'): Promise<State> {
  const { user, org, Product, ShopSettings } = await getTenantAdminSession();
  const k = (await getDict()).ecom.panel;
  try {
    await setEcomListed({ Product, ShopSettings }, user, Array.isArray(keys) ? keys.map(String) : [], mode === 'auto' ? null : mode === 'show');
  } catch {
    return { error: k.failed };
  }
  await syncOrgListingsById(String(org._id));
  revalidatePath('/app/ecom');
  return { success: k.saved };
}

export type EcomEditState = { error?: string; success?: string; key?: string } | null;

/** Tovarning e-commerce ma'lumotlari: nom, narx, eski narx, tavsif, rasmlar, ko'rinish */
export async function saveEcomItemAction(_prev: EcomEditState, formData: FormData): Promise<EcomEditState> {
  const { user, org, Product, ShopSettings } = await getTenantAdminSession();
  const k = (await getDict()).ecom.edit;
  const key = String(formData.get('key') ?? '');
  let images: unknown = undefined;
  try {
    images = JSON.parse(String(formData.get('images') ?? '[]'));
  } catch {
    return { error: k.errors.badImages };
  }
  const input: EcomEditInput = {
    name: formData.get('name') ?? undefined,
    description: formData.get('description') ?? undefined,
    oldPrice: formData.get('oldPrice') ?? undefined,
    images,
    listed: formData.get('listed') ?? undefined,
  };
  // Narx faqat egasi o'zgartirganda yuboriladi (guruhda narxlar har xil bo'lsa — tegilmasin)
  if (formData.get('priceChanged') === '1') input.salePrice = formData.get('salePrice') ?? '';

  let r;
  try {
    r = await applyEcomEdit({ Product, ShopSettings }, { ...user, dbName: user.dbName! }, key, input);
  } catch {
    return { error: k.errors.failed };
  }
  if (!r.ok) return { error: k.errors[r.error] };
  await syncOrgListingsById(String(org._id));
  revalidatePath('/app/ecom');
  revalidatePath(`/app/ecom/${r.key}`);
  return { success: k.saved, key: r.key };
}

/** Buyurtma: qabul / rad / yakunlash */
export async function shopOrderAction(orderId: string, action: 'accept' | 'reject' | 'complete', reason?: string): Promise<State> {
  const { user, org } = await getTenantAdminSession();
  const k = (await getDict()).ecom.orders;
  const actor = { id: user.id, username: user.username, role: 'admin' as const, dbName: user.dbName! };
  let r;
  try {
    r = action === 'complete'
      ? await completeShopOrder(String(org._id), actor, String(orderId))
      : await setShopOrderStatus(String(org._id), actor, String(orderId), action, reason);
  } catch {
    return { error: k.errors.failed };
  }
  if (!r.ok) return { error: r.error === 'notEnough' ? tr(k.errors.notEnough, { item: r.item ?? '' }) : k.errors[r.error] };
  revalidatePath('/app/ecom/orders');
  if (action === 'complete') {
    revalidatePath('/app/sales');
    revalidatePath('/app/products');
  }
  return { success: k.done[action] };
}
