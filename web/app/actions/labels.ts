'use server';

import { revalidatePath } from 'next/cache';
import { Types } from 'mongoose';
import { getTenantAdminSession, getTenantSession } from '@/lib/tenantSession';
import { branchFilter } from '@/lib/branchScope';
import { isPhoneShop } from '@/lib/businessTypes';
import { loadUserPermissions } from '@/lib/permissionGuard';
import { permissionDeniedError } from '@/lib/permissions';
import { getShopSettings, saveShopSettingsPart } from '@/lib/shopSettings';
import { getStockQty } from '@/lib/productQuantity';
import { tashkentDayKey } from '@/lib/period';
import { recordAudit } from '@/lib/audit';
import { getDict } from '@/lib/i18n/server';
import {
  LABEL_FIELDS, LABEL_LIMITS, LABEL_TEXT_SIZES, labelCodeOf, resolveLabelSettings,
  type LabelItem, type LabelSettings, type LabelTextSize,
} from '@/lib/labels/settings';

/** Bir chop etishda eng ko'p mahsulot (Excel importi natijasi ham shu orqali) */
const MAX_IDS = 500;

export type LabelData =
  | { ok: true; settings: LabelSettings; shopName: string; items: LabelItem[] }
  | { ok: false; error: string };

/**
 * Yorliq ma'lumoti (tanlangan mahsulotlar + do'kon sozlamasi). Huquq: «Omborni ko'rish»; u bo'lmasa —
 * «Mahsulot qo'shish» bilan faqat o'zi qo'shgan tovarlar (yangi qo'shilgan tovar kartochkasi kabi).
 * Filial xodimi — faqat o'z filiali.
 */
export async function getLabelDataAction(ids: string[]): Promise<LabelData> {
  const { user, org, Product, ShopSettings } = await getTenantSession();
  const t = (await getDict()).labels.print;
  const perms = await loadUserPermissions(user);
  const canView = perms.has('products.view');
  if (!canView && !perms.has('product.create')) return { ok: false, error: permissionDeniedError('products.view').error };

  const clean = Array.isArray(ids)
    ? [...new Set(ids.filter((id): id is string => typeof id === 'string' && Types.ObjectId.isValid(id)))].slice(0, MAX_IDS)
    : [];
  if (!clean.length) return { ok: false, error: t.none };

  const phoneShop = isPhoneShop(org);
  const [settings, docs] = await Promise.all([
    getShopSettings(ShopSettings),
    Product.find({
      _id: { $in: clean },
      ...branchFilter(user),
      ...(canView ? {} : { createdBy: user.username }),
    })
      .select('name imei imeiPending barcode productId kind salePrice color deviceModel size warrantyMonths createdAt trackQuantity quantity soldQuantity status')
      .lean(),
  ]);
  const byId = new Map(docs.map((p) => [String(p._id), p]));
  const items: LabelItem[] = [];
  for (const id of clean) {
    const p = byId.get(id);
    if (!p) continue;
    const { code, codeKind } = labelCodeOf(p, phoneShop);
    const attrs = [p.color, p.deviceModel, p.size].filter((x): x is string => !!x?.trim()).join(' · ');
    items.push({
      id,
      name: p.name,
      code,
      codeKind,
      price: p.salePrice ?? 0,
      productId: p.productId,
      attrs: attrs || undefined,
      warrantyMonths: p.warrantyMonths || undefined,
      date: p.createdAt ? tashkentDayKey(new Date(p.createdAt)) : undefined,
      imeiPending: phoneShop && !!p.imeiPending && (p.kind ?? 'goods') === 'goods' ? true : undefined,
      available: p.trackQuantity ? getStockQty(p) : 1,
    });
  }
  if (!items.length) return { ok: false, error: t.none };
  return { ok: true, settings: resolveLabelSettings(settings.label, phoneShop), shopName: org.name, items };
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
