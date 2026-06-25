'use server';

import { requireSuperAdmin } from '@/lib/auth';
import { getMasterModels } from '@/lib/masterDb';
import { sendDailyExpiryNotifications } from '@/lib/notifications';

type Result = { error?: string; success?: string; data?: Record<string, unknown> } | null;

export async function runExpireOrgsAction(): Promise<Result> {
  await requireSuperAdmin();
  if (!process.env.CRON_SECRET) {
    return { error: "CRON_SECRET .env faylida yo'q. .env.example dan nusxa oling." };
  }

  const { Organization } = await getMasterModels();
  const now = new Date();
  const result = await Organization.updateMany(
    { status: 'active', expiresAt: { $lt: now } },
    { $set: { status: 'expired', updatedAt: now } },
  );

  return {
    success: `${result.modifiedCount} ta biznes "muddati tugagan" deb belgilandi.`,
    data: { expired: result.modifiedCount },
  };
}

export async function runExpiryNotifyAction(): Promise<Result> {
  await requireSuperAdmin();
  if (!process.env.CRON_SECRET) {
    return { error: "CRON_SECRET .env faylida yo'q. .env.example dan nusxa oling." };
  }

  const result = await sendDailyExpiryNotifications();
  return {
    success: `${result.orgs} ta biznes uchun eslatma yuborildi (Telegram: ${result.telegramSent}).`,
    data: result,
  };
}
