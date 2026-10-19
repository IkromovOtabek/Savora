'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getTenantAdminSession } from '@/lib/tenantSession';
import { saveShopSettingsPart } from '@/lib/shopSettings';
import { getUsdRate } from '@/lib/currency';
import { recordAudit } from '@/lib/audit';
import { formToObject, parseInput, zText } from '@/lib/validation';
import { getDict } from '@/lib/i18n/server';

type State = { error?: string; success?: string } | null;

/** Chek sozlamalari — faqat do'kon egasi */
export async function saveReceiptSettingsAction(_prev: State, formData: FormData): Promise<State> {
  const { user, ShopSettings } = await getTenantAdminSession();
  const k = (await getDict()).shell.shopSettings;

  const parsed = parseInput(z.object({
    headerNote: zText(120),
    footer: zText(160),
    paperWidth: z.enum(['58', '80']),
  }), formToObject(formData), k.failed);
  if (!parsed.ok) return { error: parsed.error };
  const { headerNote, footer, paperWidth } = parsed.data;

  try {
    await saveShopSettingsPart(ShopSettings, 'receipt', {
      headerNote: headerNote || undefined,
      footer: footer || undefined,
      paperWidth: paperWidth === '58' ? 58 : 80,
      showSeller: formData.get('showSeller') === '1',
      showCustomer: formData.get('showCustomer') === '1',
    }, user.username);
  } catch {
    return { error: k.failed };
  }
  await recordAudit(user, { action: 'settings.receipt', entity: 'branch', summary: `Chek sozlamalari o'zgartirildi (${paperWidth} mm)` });
  revalidatePath('/app/settings');
  return { success: k.saved };
}

/** Valyuta: kurs manbai (CBU / qo'lda) va qo'lda kiritilgan kurs */
export async function saveCurrencySettingsAction(_prev: State, formData: FormData): Promise<State> {
  const { user, ShopSettings } = await getTenantAdminSession();
  const k = (await getDict()).shell.shopSettings;
  const mode = formData.get('rateMode') === 'manual' ? 'manual' : 'cbu';
  const rawRate = String(formData.get('manualRate') ?? '').replace(/\s/g, '').replace(',', '.');
  const manualRate = rawRate ? Number(rawRate) : undefined;
  if (manualRate !== undefined && (!Number.isFinite(manualRate) || manualRate < 1000 || manualRate > 100000)) return { error: k.badRate };
  if (mode === 'manual' && !manualRate) return { error: k.badRate };

  try {
    await saveShopSettingsPart(ShopSettings, 'currency', { rateMode: mode, manualRate }, user.username);
  } catch {
    return { error: k.failed };
  }
  await recordAudit(user, {
    action: 'settings.currency', entity: 'branch',
    summary: mode === 'manual' ? `Dollar kursi qo'lda: ${manualRate} so'm` : 'Dollar kursi: Markaziy bank',
  });
  revalidatePath('/app/settings');
  return { success: k.saved };
}

/** CBU kursini hozir qayta so'rash */
export async function refreshCbuRateAction(): Promise<State> {
  const { ShopSettings } = await getTenantAdminSession();
  const k = (await getDict()).shell.shopSettings;
  const info = await getUsdRate(ShopSettings, { force: true });
  revalidatePath('/app/settings');
  return info.cbuRate ? { success: k.refreshed } : { error: k.cbuNone };
}

/** Telegram bildirishnomalari: qaysi xabarlar yuborilsin */
export async function saveNotifySettingsAction(_prev: State, formData: FormData): Promise<State> {
  const { user, ShopSettings } = await getTenantAdminSession();
  const k = (await getDict()).shell.shopSettings;
  const value = { shiftDiff: formData.get('shiftDiff') === '1', dailySummary: formData.get('dailySummary') === '1' };
  try {
    await saveShopSettingsPart(ShopSettings, 'notify', value, user.username);
  } catch {
    return { error: k.failed };
  }
  await recordAudit(user, {
    action: 'settings.notify', entity: 'branch',
    summary: `Bildirishnomalar: smena farqi ${value.shiftDiff ? 'yoqildi' : "o'chirildi"}, kunlik yakun ${value.dailySummary ? 'yoqildi' : "o'chirildi"}`,
  });
  revalidatePath('/app/settings');
  return { success: k.saved };
}
