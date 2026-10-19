'use server';

import { requireSuperAdmin } from '@/lib/auth';
import { runCronJob } from '@/lib/cronRuns';
import { expireOverdueOrganizations } from '@/lib/organizations';
import { sendDailyExpiryNotifications } from '@/lib/notifications';
import { sendDailyInstallmentReminders } from '@/lib/installmentReminders';
import { sendDailyDaftarReminders } from '@/lib/daftarReminders';
import { sendDailySummaries } from '@/lib/shopNotify';
import { getDict } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';

type Result = { error?: string; success?: string; data?: Record<string, unknown> } | null;

async function noCronSecret(): Promise<Result> {
  const d = await getDict();
  return { error: d.superPanel.actions.noCronSecret };
}

export async function runExpireOrgsAction(): Promise<Result> {
  await requireSuperAdmin();
  if (!process.env.CRON_SECRET) return noCronSecret();
  const d = await getDict();
  const run = await runCronJob('expire-orgs', async () => ({ expired: await expireOverdueOrganizations() }), 'manual');
  if (!run.ok) return { error: tr(d.superPanel.actions.cronError, { e: run.error ?? '' }) };
  return { success: tr(d.superPanel.actions.expiredMarked, { n: Number(run.result?.expired ?? 0) }), data: run.result };
}

export async function runExpiryNotifyAction(): Promise<Result> {
  await requireSuperAdmin();
  if (!process.env.CRON_SECRET) return noCronSecret();
  const d = await getDict();
  const run = await runCronJob('expiry-notifications', async () => ({ ...(await sendDailyExpiryNotifications()) }), 'manual');
  if (!run.ok) return { error: tr(d.superPanel.actions.cronError, { e: run.error ?? '' }) };
  return {
    success: tr(d.superPanel.actions.notifySent, { n: Number(run.result?.orgs ?? 0), tg: Number(run.result?.telegramSent ?? 0) }),
    data: run.result,
  };
}

export async function runInstallmentRemindersAction(): Promise<Result> {
  await requireSuperAdmin();
  if (!process.env.CRON_SECRET) return noCronSecret();
  const d = await getDict();
  const run = await runCronJob('installment-reminders', async () => ({ ...(await sendDailyInstallmentReminders()) }), 'manual');
  if (!run.ok) return { error: tr(d.superPanel.actions.cronError, { e: run.error ?? '' }) };
  return { success: d.superPanel.actions.installmentSent, data: run.result };
}

export async function runDaftarRemindersAction(): Promise<Result> {
  await requireSuperAdmin();
  if (!process.env.CRON_SECRET) return noCronSecret();
  const d = await getDict();
  const run = await runCronJob('daftar-reminders', async () => ({ ...(await sendDailyDaftarReminders()) }), 'manual');
  if (!run.ok) return { error: tr(d.superPanel.actions.cronError, { e: run.error ?? '' }) };
  return { success: d.superPanel.actions.daftarSent, data: run.result };
}

export async function runDailySummaryAction(): Promise<Result> {
  await requireSuperAdmin();
  if (!process.env.CRON_SECRET) return noCronSecret();
  const d = await getDict();
  const run = await runCronJob('daily-summary', async () => ({ ...(await sendDailySummaries()) }), 'manual');
  if (!run.ok) return { error: tr(d.superPanel.actions.cronError, { e: run.error ?? '' }) };
  return { success: d.superPanel.actions.summarySent, data: run.result };
}
