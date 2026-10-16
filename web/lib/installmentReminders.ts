import { getMasterModels } from './masterDb';
import { getTenantModels } from './tenantDb';
import { resolveOrgFeatures } from './features';
import { isOrganizationActive } from './models/master/Organization';
import { sendTelegramTo, tgEscape } from './telegram';
import { computeInstallmentPlan } from './installment';

function money(n: number): string {
  return new Intl.NumberFormat('uz-UZ').format(Math.round(n || 0));
}
function dateStr(d: Date): string {
  return new Date(d).toLocaleDateString('uz-UZ');
}

/**
 * Kunlik cron: muddati kelib to'lanmagan nasiya oylari bo'yicha biznes egasiga
 * Telegram xabarnoma yuboradi — mahsulot, mijoz, muddati o'tgan summa va muddat.
 * Kunlik takror bo'lmasligi uchun sotuvda `lastInstallmentNotifiedAt` ishlatiladi.
 */
export async function sendDailyInstallmentReminders(): Promise<{
  orgs: number; sales: number; telegram: number;
}> {
  const { Organization } = await getMasterModels();
  const orgs = await Organization.find({ status: 'active' }).lean();

  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);

  let telegram = 0, salesCount = 0, orgCount = 0;

  for (const org of orgs) {
    if (!isOrganizationActive(org)) continue;
    const features = resolveOrgFeatures(org);
    if (!features.variant && !features.nasiya) continue;
    // Egaga yuborishning yagona yo'li — do'kon ulagan Telegram
    if (!org.telegramChatId) continue;

    let Sale;
    try { ({ Sale } = await getTenantModels(org.dbName)); } catch { continue; }

    const list = await Sale.find({
      paymentType: 'installment',
      status: 'partial',
      remainingAmount: { $gt: 0 },
      $or: [{ lastInstallmentNotifiedAt: { $exists: false } }, { lastInstallmentNotifiedAt: { $lt: todayStart } }],
    }).limit(500);

    let orgNotified = false;
    for (const s of list) {
      const plan = computeInstallmentPlan(s, now);
      if (!plan || plan.overdueCount === 0) continue;

      // Muddati o'tgan va to'liq to'lanmagan oylar (qisman to'langanlar ham) — overdueCount bilan mos
      const overdue = plan.schedule.filter((m) => !m.paid && m.dueDate.getTime() <= now.getTime());
      const overdueSum = overdue.reduce((a, m) => a + m.amount, 0);
      // Mahsulot/mijoz nomi foydalanuvchi kiritgan matn — Telegram HTML uchun ekranlanadi
      const cust = tgEscape(s.customerSnapshot?.fullName ?? '—');
      const phone = s.customerSnapshot?.phone ? ` · ${tgEscape(s.customerSnapshot.phone)}` : '';

      const txt =
        `⏰ <b>Nasiya to'lov muddati o'tdi</b>\n\n` +
        `Mahsulot: <b>${tgEscape(s.productSnapshot.name)}</b>\n` +
        `Mijoz: ${cust}${phone}\n` +
        `Muddati o'tgan: <b>${overdue.length} oy</b> — ${money(overdueSum)} so'm\n` +
        `Eng erta muddat: <b>${dateStr(overdue[0].dueDate)}</b>\n` +
        `Umumiy qoldiq: <b>${money(s.remainingAmount)} so'm</b>`;

      if (await sendTelegramTo(org.telegramChatId, txt)) telegram++;
      salesCount++;
      s.lastInstallmentNotifiedAt = now;
      await s.save();
      orgNotified = true;
    }
    if (orgNotified) orgCount++;
  }

  return { orgs: orgCount, sales: salesCount, telegram };
}
