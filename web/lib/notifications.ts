import { getMasterModels } from './masterDb';
import { getTenantModels } from './tenantDb';
import { isOrganizationActive, IOrganization } from './models/master/Organization';
import { sendTelegram } from './telegram';
import { resolveOrgPlan } from './plans';
import { fmtDateTime } from './format';

export function daysUntilExpiry(expiresAt: Date): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const exp = new Date(expiresAt);
  exp.setHours(0, 0, 0, 0);
  return Math.ceil((exp.getTime() - now.getTime()) / 86400000);
}

export function shouldShowExpiryWarning(org: Pick<IOrganization, 'status' | 'expiresAt'>): boolean {
  if (org.status !== 'active' || !isOrganizationActive(org)) return false;
  const days = daysUntilExpiry(org.expiresAt);
  return days >= 0 && days <= 3;
}

export function expiryWarningText(org: { name: string; expiresAt: Date }, monthlyPayment?: number): string {
  const days = daysUntilExpiry(org.expiresAt);
  const date = new Date(org.expiresAt).toLocaleDateString('uz-UZ');
  const pay = monthlyPayment ? ` Oylik to'lov: ${new Intl.NumberFormat('uz-UZ').format(monthlyPayment)} so'm.` : '';
  if (days === 0) return `Diqqat: "${org.name}" obunasi BUGUN tugaydi (${date}).${pay}`;
  if (days === 1) return `Diqqat: "${org.name}" obunasiga 1 kun qoldi (${date}).${pay}`;
  return `Diqqat: "${org.name}" obunasiga ${days} kun qoldi (${date}).${pay}`;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Kunlik cron: muddatga 2 kun qolganda Super Admin + biznes foydalanuvchilariga xabar */
export async function sendDailyExpiryNotifications(): Promise<{ telegramSent: number; orgs: number }> {
  const { Organization, SuperAdmin } = await getMasterModels();
  const now = new Date();
  const inTwoDays = new Date(now);
  inTwoDays.setDate(inTwoDays.getDate() + 2);
  inTwoDays.setHours(23, 59, 59, 999);

  const orgs = await Organization.find({
    status: 'active',
    expiresAt: { $gte: now, $lte: inTwoDays },
  }).lean();

  const today = todayKey();
  let telegramSent = 0;

  for (const org of orgs) {
    if (org.notifyExpiryOn === today) continue;

    const plan = resolveOrgPlan(org);
    const text = expiryWarningText(org, plan.monthlyPayment);

    const sent = await sendTelegram(
      `<b>Savora — obuna eslatmasi</b>\n${text}\n\nSuper Admin panelidan muddatni uzaytiring.`,
    );
    if (sent) telegramSent++;

    try {
      const { User } = await getTenantModels(org.dbName);
      const users = await User.find({ active: true }).select('username role').lean();
      const adminNames = users.filter((u) => u.role === 'admin').map((u) => u.username).join(', ');
      if (adminNames) {
        await sendTelegram(
          `<b>Do'kon: ${org.name}</b>\n${text}\nAdminlar: ${adminNames}\nBarcha foydalanuvchilarga panelda xabar ko'rsatiladi.`,
        );
      }
    } catch {
      /* tenant DB mavjud emas */
    }

    await Organization.updateOne({ _id: org._id }, { $set: { notifyExpiryOn: today } });
  }

  if (orgs.length > 0) {
    const sa = await SuperAdmin.findOne().select('username').lean();
    if (sa && telegramSent === 0) {
      await sendTelegram(
        `<b>Savora</b>\n${orgs.length} ta biznes obunasi 2 kun ichida tugaydi. Super Admin panelini tekshiring.\n${fmtDateTime(new Date())}`,
      );
    }
  }

  return { telegramSent, orgs: orgs.length };
}
