'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getTenantAdminSession } from '@/lib/tenantSession';
import { saveShopSettingsPart } from '@/lib/shopSettings';
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
