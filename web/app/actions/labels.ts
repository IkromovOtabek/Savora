'use server';

import { revalidatePath } from 'next/cache';
import { getTenantAdminSession, getTenantSession } from '@/lib/tenantSession';
import { loadUserPermissions } from '@/lib/permissionGuard';
import { permissionDeniedError } from '@/lib/permissions';
import { saveShopSettingsPart } from '@/lib/shopSettings';
import { recordAudit } from '@/lib/audit';
import { getDict } from '@/lib/i18n/server';
import {
  LABEL_FIELDS, LABEL_LIMITS, LABEL_TEXT_SIZES,
  type LabelItem, type LabelSettings, type LabelTextSize,
} from '@/lib/labels/settings';
import { cleanLabelIds, labelScope, loadLabelData } from '@/lib/labels/data';

export type LabelData =
  | { ok: true; settings: LabelSettings; shopName: string; items: LabelItem[] }
  | { ok: false; error: string };

/**
 * Yorliq ma'lumoti (tanlangan mahsulotlar + do'kon sozlamasi). Huquq va filial cheklovi — lib/labels/data.ts
 * (mobil API ham aynan shuni ishlatadi).
 */
export async function getLabelDataAction(ids: string[]): Promise<LabelData> {
  const { user, org, Product, ShopSettings } = await getTenantSession();
  const t = (await getDict()).labels.print;
  const scope = labelScope(user, await loadUserPermissions(user));
  if (!scope) return { ok: false, error: permissionDeniedError('products.view').error };

  const clean = cleanLabelIds(ids);
  if (!clean.length) return { ok: false, error: t.none };

  const data = await loadLabelData({ user, org, scope, Product, ShopSettings }, clean);
  if (!data.items.length) return { ok: false, error: t.none };
  return { ok: true, ...data };
}

type State = { error?: string; success?: string } | null;

/** Yorliq sozlamalari — faqat do'kon egasi (Sozlamalar sahifasi) */
export async function saveLabelSettingsAction(_prev: State, formData: FormData): Promise<State> {
  const { user, ShopSettings } = await getTenantAdminSession();
  const k = (await getDict()).labels.settings;

  const width = Number(formData.get('width'));
  const height = Number(formData.get('height'));
  if (
    !Number.isInteger(width) || !Number.isInteger(height)
    || width < LABEL_LIMITS.minW || width > LABEL_LIMITS.maxW
    || height < LABEL_LIMITS.minH || height > LABEL_LIMITS.maxH
  ) {
    return { error: k.badSize };
  }
  const picked = formData.getAll('fields').map(String);
  const fields = LABEL_FIELDS.filter((f) => picked.includes(f));
  const rawSize = String(formData.get('textSize') ?? '');
  const textSize: LabelTextSize = (LABEL_TEXT_SIZES as readonly string[]).includes(rawSize) ? (rawSize as LabelTextSize) : 'm';
  const copies = Math.min(LABEL_LIMITS.maxCopies, Math.max(1, Math.round(Number(formData.get('copies')) || 1)));
  const autoPrint = formData.get('autoPrint') === '1';

  try {
    await saveShopSettingsPart(ShopSettings, 'label', { width, height, fields, textSize, copies, autoPrint }, user.username);
  } catch {
    return { error: k.failed };
  }
  await recordAudit(user, {
    action: 'settings.label',
    entity: 'branch',
    summary: `Barkod yorlig'i: ${width}×${height} mm, ${fields.length} maydon, avto-chop etish ${autoPrint ? 'yoqiq' : "o'chiq"}`,
  });
  revalidatePath('/app/settings');
  revalidatePath('/app/products');
  return { success: k.saved };
}
