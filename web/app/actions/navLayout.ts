'use server';

import { revalidatePath } from 'next/cache';
import { getTenantSession } from '@/lib/tenantSession';
import { sanitizeNavLayout } from '@/lib/navConfig';
import { getDict } from '@/lib/i18n/server';

type State = { error?: string; success?: string };

/** Joriy foydalanuvchining shaxsiy menyu tartibini saqlaydi. null — standart holatga qaytaradi. */
export async function saveNavLayoutAction(raw: unknown): Promise<State> {
  const { user, User } = await getTenantSession();
  const t = (await getDict()).shell.actions;
  if (raw === null) {
    await User.updateOne({ _id: user.id }, { $unset: { navLayout: 1 } });
  } else {
    const layout = sanitizeNavLayout(raw);
    if (!layout) return { error: t.navLayoutInvalid };
    await User.updateOne({ _id: user.id }, { $set: { navLayout: layout } });
  }
  revalidatePath('/app', 'layout');
  return { success: raw === null ? t.navLayoutReset : t.navLayoutSaved };
}
