import { getMasterModels } from './masterDb';
import { getTenantModels } from './tenantDb';
import { resolveOrgFeatures } from './features';
import { isOrganizationActive } from './models/master/Organization';
import { sendTelegramTo } from './telegram';
import { sendSms } from './sms';

function money(n: number): string {
  return new Intl.NumberFormat('uz-UZ').format(Math.round(n || 0));
}
function dateStr(d: Date): string {
  return new Date(d).toLocaleDateString('uz-UZ');
}

/**
 * Kunlik cron: muddati kelgan/o'tgan ochiq daftar yozuvlari uchun har kuni bir marta:
 *  - egasiga (menga) Telegram orqali eslatma,
 *  - qarzdorga (do'stga) SMS orqali eslatma ("berdim" turida).
 * Kunlik takror bo'lmasligi uchun `lastNotifiedAt` ishlatiladi.
 */
export async function sendDailyDaftarReminders(): Promise<{
  orgs: number; telegram: number; sms: number; entries: number;
}> {
  const { Organization, TelegramAccount } = await getMasterModels();
  const orgs = await Organization.find({ status: 'active' }).lean();

  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);

  let telegram = 0, sms = 0, entries = 0, orgCount = 0;

  for (const org of orgs) {
    if (!isOrganizationActive(org)) continue;
    const features = resolveOrgFeatures(org);
    if (!features.daftar) continue;

    let LedgerEntry;
    try {
      ({ LedgerEntry } = await getTenantModels(org.dbName));
    } catch { continue; }

    const due = await LedgerEntry.find({
      status: 'open',
      dueDate: { $lte: todayEnd },
      $or: [{ lastNotifiedAt: { $exists: false } }, { lastNotifiedAt: { $lt: todayStart } }],
    }).limit(500);

    if (due.length === 0) continue;
    orgCount++;

    for (const e of due) {
      entries++;
      const amount = money(e.amount);
      const when = dateStr(e.dueDate);

      // Egasiga (menga) — shaxsiy Telegram bo'lsa unga, aks holda do'kon Telegram'iga
      let ownerChat: string | null = null;
      if (e.createdByUserId) {
        const acc = await TelegramAccount.findOne(
          { dbName: org.dbName, userId: e.createdByUserId, telegramUserId: { $exists: true } },
          { telegramUserId: 1 }
        ).lean();
        if (acc?.telegramUserId) ownerChat = acc.telegramUserId;
      }
      if (!ownerChat && org.telegramChatId) ownerChat = String(org.telegramChatId);

      if (ownerChat) {
        const txt = e.type === 'given'
          ? `⏰ Daftar eslatma\n\n<b>${e.personName}</b> sizga <b>${amount} so'm</b> qarzdor.\nMuddat: ${when}\nTel: ${e.personPhone}`
          : `⏰ Daftar eslatma\n\nSiz <b>${e.personName}</b>ga <b>${amount} so'm</b> qarzdorsiz.\nMuddat: ${when}`;
        if (await sendTelegramTo(ownerChat, txt)) telegram++;
      }

      // Qarzdorga (do'stga) SMS — faqat "qarz berdim" turida
      if (e.type === 'given' && e.personPhone) {
        const msg = `Assalomu alaykum. Sizda ${amount} so'm qarz bor (muddat: ${when}). Iltimos qaytarishni unutmang. ${org.name}`;
        if (await sendSms(e.personPhone, msg)) sms++;
      }

      e.lastNotifiedAt = now;
      await e.save();
    }
  }

  return { orgs: orgCount, telegram, sms, entries };
}
