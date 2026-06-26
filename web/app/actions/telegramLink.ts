'use server';

import { getTenantSession } from '@/lib/tenantSession';
import { getMasterModels } from '@/lib/masterDb';
import { generateLinkCode } from '@/lib/telegramAuth';

const CODE_TTL_MS = 10 * 60 * 1000; // 10 daqiqa

export interface TgLinkState {
  ok?: boolean;
  link?: string;
  error?: string;
}

/** Joriy foydalanuvchi uchun Telegram bog'lash deep-link kodi yaratadi. */
export async function createTelegramLinkAction(): Promise<TgLinkState> {
  const botUser = (process.env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, '');
  if (!botUser) return { error: 'Bot sozlanmagan. Platforma egasiga murojaat qiling.' };

  try {
    const { user, org } = await getTenantSession();

    const code = generateLinkCode();
    const { TelegramAccount } = await getMasterModels();
    await TelegramAccount.findOneAndUpdate(
      { dbName: user.dbName, userId: user.id },
      {
        $set: {
          code,
          codeExpiresAt: new Date(Date.now() + CODE_TTL_MS),
          organizationId: org._id,
          orgSlug: org.slug,
          username: user.username,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return { ok: true, link: `https://t.me/${botUser}?start=lu_${code}` };
  } catch {
    return { error: 'Havola yaratilmadi. Qayta urinib ko\'ring.' };
  }
}

/** Joriy foydalanuvchining Telegram bog'langan-bog'lanmaganligini qaytaradi. */
export async function getTelegramLinkStatus(): Promise<{ linked: boolean }> {
  try {
    const { user } = await getTenantSession();
    const { TelegramAccount } = await getMasterModels();
    const doc = await TelegramAccount.findOne(
      { dbName: user.dbName, userId: user.id },
      { telegramUserId: 1 }
    ).lean();
    return { linked: !!doc?.telegramUserId };
  } catch {
    return { linked: false };
  }
}
