'use server';

import { revalidatePath } from 'next/cache';
import { getTenantAdminSession } from '@/lib/tenantSession';
import { getMasterModels } from '@/lib/masterDb';
import { checkImeiBlacklist, normImei, BlacklistHit } from '@/lib/imeiBlacklist';
import { BlacklistReason } from '@/lib/models/master/ImeiBlacklist';
import { logError } from '@/lib/logger';
import { getDict } from '@/lib/i18n/server';
import { hitRateLimit } from '@/lib/rateLimit';

type State = { error?: string; success?: string } | null;

function parseReason(v: string): BlacklistReason {
  return (['debt', 'fraud', 'stolen', 'other'].includes(v) ? v : 'debt') as BlacklistReason;
}

/** Do'kon admini — IMEI'ni qora ro'yxatga qo'shadi */
export async function addImeiBlacklistAction(_prev: State, formData: FormData): Promise<State> {
  const { user, org } = await getTenantAdminSession();
  const m = (await getDict()).stock.msg;

  const imei = normImei(String(formData.get('imei') || ''));
  const reason = parseReason(String(formData.get('reason') || 'debt'));
  const customerName = String(formData.get('customerName') || '').trim().slice(0, 80) || undefined;
  const customerPhone = String(formData.get('customerPhone') || '').trim().slice(0, 20) || undefined;
  const note = String(formData.get('note') || '').trim().slice(0, 300) || undefined;

  if (imei.length < 6) return { error: m.imeiMin6 };

  try {
    const { ImeiBlacklist } = await getMasterModels();
    const dup = await ImeiBlacklist.findOne({ imei, organizationId: org._id, resolved: false }).lean();
    if (dup) return { error: m.blDup };

    await ImeiBlacklist.create({
      imei,
      reason,
      organizationId: org._id,
      orgName: org.name,
      orgSlug: org.slug,
      customerName,
      customerPhone,
      note,
      createdBy: user.username,
    });

    revalidatePath('/app/imei');
    return { success: m.blAdded };
  } catch (err) {
    logError('addImeiBlacklistAction failed', err, { org: org.slug });
    return { error: m.addFailed };
  }
}

/** Do'kon admini — o'z yozuvini hal qilingan deb belgilaydi (qarz yopildi) */
export async function resolveImeiBlacklistAction(_prev: State, formData: FormData): Promise<State> {
  const { org } = await getTenantAdminSession();
  const d = await getDict();
  const m = d.stock.msg;
  const id = String(formData.get('id') || '');
  if (!id) return { error: m.recordNotFound };

  try {
    const { ImeiBlacklist } = await getMasterModels();
    const res = await ImeiBlacklist.updateOne(
      { _id: id, organizationId: org._id },
      { $set: { resolved: true, resolvedAt: new Date() } },
    );
    if (res.matchedCount === 0) return { error: m.recordNotYours };
    revalidatePath('/app/imei');
    return { success: m.resolvedOk };
  } catch (err) {
    logError('resolveImeiBlacklistAction failed', err, { id });
    return { error: d.common.error };
  }
}

/** Qidiruv — IMEI'larni qora ro'yxatdan tekshirish (barcha do'konlar bo'yicha) */
export async function checkImeiBlacklistAction(imeis: string[]): Promise<BlacklistHit[]> {
  const { org } = await getTenantAdminSession();
  // Qora ro'yxat barcha do'konlar bo'yicha umumiy — katta partiyalarda IMEI diapazonlarini
  // sinab boshqa do'konlar mijozlarini yig'ib olish (PII) mumkin edi: massiv va chastota cheklanadi
  if (!Array.isArray(imeis)) return [];
  const clean = imeis
    .filter((v): v is string => typeof v === 'string')
    .map((v) => normImei(v))
    .filter((v) => v.length >= 8 && v.length <= 20)
    .slice(0, 200);
  if (clean.length === 0) return [];
  if (!hitRateLimit(`imei-check:${org._id}`, 60, 60 * 60 * 1000).ok) return [];
  const map = await checkImeiBlacklist(clean);
  return [...map.values()];
}
