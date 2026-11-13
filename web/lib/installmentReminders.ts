import { getMasterModels } from './masterDb';
import { getTenantModels } from './tenantDb';
import { resolveOrgFeatures } from './features';
import { isOrganizationActive } from './models/master/Organization';
import { sendTelegramTo, tgEscape } from './telegram';
import { computeInstallmentPlan } from './installment';
import { pushToShop, orgIdsWithPush, type PushMessage } from './push';

function money(n: number): string {
  return new Intl.NumberFormat('uz-UZ').format(Math.round(n || 0));
}
function dateStr(d: Date): string {
  return new Date(d).toLocaleDateString('uz-UZ');
}

/** Push — do'kon bo'yicha bitta umumlashgan xabar (har sotuvga alohida emas) */
export function installmentPush(p: { sales: number; overdueSum: number; first: string }): PushMessage {
  return {
    title: `Nasiya: ${p.sales} ta to'lov muddati o'tdi`,
    body: p.sales > 1
      ? `Jami muddati o'tgan: ${money(p.overdueSum)} so'm\n${p.first} va boshqalar`
      : `${p.first}\nMuddati o'tgan: ${money(p.overdueSum)} so'm`,
    url: '/(tabs)/nasiya',
  };
}

/**
 * Kunlik cron: muddati kelib to'lanmagan nasiya oylari bo'yicha biznes egasiga
 * Telegram xabarnoma (har sotuvga) va ilovaga push (do'kon bo'yicha bitta) yuboradi.
 * Kunlik takror bo'lmasligi uchun sotuvda `lastInstallmentNotifiedAt` ishlatiladi.
 */
export async function sendDailyInstallmentReminders(): Promise<{
  orgs: number; sales: number; telegram: number; push: number;
}> {
  const { Organization } = await getMasterModels();
  const orgs = await Organization.find({ status: 'active' }).lean();
  const pushOrgs = await orgIdsWithPush();

  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);

  let telegram = 0, push = 0, salesCount = 0, orgCount = 0;

  for (const org of orgs) {
    if (!isOrganizationActive(org)) continue;
    const features = resolveOrgFeatures(org);
    if (!features.variant && !features.nasiya) continue;
    // Egaga yetkazish yo'li — do'kon ulagan Telegram yoki ilova o'rnatilgan telefon
    const hasPush = pushOrgs.has(String(org._id));
    if (!org.telegramChatId && !hasPush) continue;

    let Sale;
    try { ({ Sale } = await getTenantModels(org.dbName)); } catch { continue; }

    const list = await Sale.find({
      paymentType: 'installment',
      status: 'partial',
      remainingAmount: { $gt: 0 },
      $or: [{ lastInstallmentNotifiedAt: { $exists: false } }, { lastInstallmentNotifiedAt: { $lt: todayStart } }],
    }).limit(500);

    let orgNotified = false;
    const pushAgg = { sales: 0, overdueSum: 0, first: '' };
    for (const s of list) {
      const plan = computeInstallmentPlan(s, now);
      if (!plan || plan.overdueCount === 0) continue;

      // Muddati o'tgan va to'liq to'lanmagan oylar (qisman to'langanlar ham) — overdueCount bilan mos
      const overdue = plan.schedule.filter((m) => !m.paid && m.dueDate.getTime() <= now.getTime());
      // Qisman to'langan oyning faqat qolgan qismi — mijoz to'lagani eslatmada qarz bo'lib chiqmasin
      const overdueSum = overdue.reduce((a, m) => a + m.left, 0);
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

      if (org.telegramChatId && await sendTelegramTo(org.telegramChatId, txt)) telegram++;
      pushAgg.sales++;
      pushAgg.overdueSum += overdueSum;
      if (!pushAgg.first) pushAgg.first = `${s.productSnapshot.name} — ${s.customerSnapshot?.fullName ?? '—'}`;
      salesCount++;
      s.lastInstallmentNotifiedAt = now;
      await s.save();
      orgNotified = true;
    }
    if (hasPush && pushAgg.sales > 0) push += await pushToShop(org.dbName, { admins: true }, installmentPush(pushAgg));
    if (orgNotified) orgCount++;
  }

  return { orgs: orgCount, sales: salesCount, telegram, push };
}
