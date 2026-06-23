'use server';

import { revalidatePath } from 'next/cache';
import { getTenantAdminSession } from '@/lib/tenantSession';
import { getMasterModels } from '@/lib/masterDb';
import { checkImeiBlacklist, normImei, BlacklistHit } from '@/lib/imeiBlacklist';
import { BlacklistReason } from '@/lib/models/master/ImeiBlacklist';
import { logError } from '@/lib/logger';

type State = { error?: string; success?: string } | null;

function parseReason(v: string): BlacklistReason {
  return (['debt', 'fraud', 'stolen', 'other'].includes(v) ? v : 'debt') as BlacklistReason;
}

/** Do'kon admini — IMEI'ni qora ro'yxatga qo'shadi */
export async function addImeiBlacklistAction(_prev: State, formData: FormData): Promise<State> {
  const { user, org } = await getTenantAdminSession();

  const imei = normImei(String(formData.get('imei') || ''));
  const reason = parseReason(String(formData.get('reason') || 'debt'));
  const customerName = String(formData.get('customerName') || '').trim() || undefined;
  const customerPhone = String(formData.get('customerPhone') || '').trim() || undefined;
  const note = String(formData.get('note') || '').trim() || undefined;

  if (imei.length < 6) return { error: 'IMEI noto\'g\'ri (kamida 6 belgi).' };

  try {
    const { ImeiBlacklist } = await getMasterModels();
    const dup = await ImeiBlacklist.findOne({ imei, organizationId: org._id, resolved: false }).lean();
    if (dup) return { error: 'Bu IMEI allaqachon sizning qora ro\'yxatingizda.' };

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
    return { success: 'IMEI qora ro\'yxatga qo\'shildi.' };
  } catch (err) {
    logError('addImeiBlacklistAction failed', err, { org: org.slug });
    return { error: 'Qo\'shishda xatolik.' };
  }
}

/** Do'kon admini — o'z yozuvini hal qilingan deb belgilaydi (qarz yopildi) */
export async function resolveImeiBlacklistAction(_prev: State, formData: FormData): Promise<State> {
  const { org } = await getTenantAdminSession();
  const id = String(formData.get('id') || '');
  if (!id) return { error: 'Yozuv topilmadi.' };

  try {
    const { ImeiBlacklist } = await getMasterModels();
    const res = await ImeiBlacklist.updateOne(
      { _id: id, organizationId: org._id },
      { $set: { resolved: true, resolvedAt: new Date() } },
    );
    if (res.matchedCount === 0) return { error: 'Yozuv topilmadi yoki sizniki emas.' };
    revalidatePath('/app/imei');
    return { success: 'Hal qilingan deb belgilandi.' };
  } catch (err) {
    logError('resolveImeiBlacklistAction failed', err, { id });
    return { error: 'Xatolik.' };
  }
}

/** Qidiruv — IMEI'larni qora ro'yxatdan tekshirish (barcha do'konlar bo'yicha) */
export async function checkImeiBlacklistAction(imeis: string[]): Promise<BlacklistHit[]> {
  await getTenantAdminSession();
  const map = await checkImeiBlacklist(imeis);
  return [...map.values()];
}
