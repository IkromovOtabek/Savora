import { getMasterModels } from './masterDb';
import { getTenantModels } from './tenantDb';
import { getShopSettings } from './shopSettings';
import { isOrganizationActive } from './models/master/Organization';
import { sendTelegramTo, tgEscape } from './telegram';
import { logError } from './logger';

/**
 * Do'kon egasiga Telegram bildirishnomalari (Do'kon sozlamalari → Bildirishnomalar).
 * Do'konning ulangan Telegram'iga (Organization.telegramChatId) yuboriladi; ulanmagan bo'lsa — jim.
 */

function money(n: number): string {
  return new Intl.NumberFormat('uz-UZ').format(Math.round(n || 0));
}

export function shiftDiffText(p: { shop: string; shiftNo: string; branch: string; by: string; expected: number; counted: number; difference: number }): string {
  const kind = p.difference < 0 ? '🔴 Kamomad' : '🟢 Ortiqcha';
  return [
    `💵 <b>${tgEscape(p.shop)}</b> — smena ${tgEscape(p.shiftNo)} yopildi`,
    `Filial: ${tgEscape(p.branch)} · ${tgEscape(p.by)}`,
    '',
    `Kassada bo'lishi kerak: ${money(p.expected)} so'm`,
    `Sanaldi: ${money(p.counted)} so'm`,
    `${kind}: <b>${money(Math.abs(p.difference))} so'm</b>`,
  ].join('\n');
}

export interface DailySummary { count: number; total: number; newDebt: number; expenses: number; openShifts: number }

export function dailySummaryText(shop: string, date: Date, s: DailySummary): string {
  const day = date.toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const lines = [
    `📊 <b>${tgEscape(shop)}</b> — ${day} yakuni`,
    '',
    `Sotuvlar: <b>${s.count} ta</b> · ${money(s.total)} so'm`,
  ];
  if (s.newDebt > 0) lines.push(`Qarzga/nasiyaga: ${money(s.newDebt)} so'm`);
  if (s.expenses > 0) lines.push(`Xarajatlar: ${money(s.expenses)} so'm`);
  if (s.openShifts > 0) lines.push(`⚠️ Yopilmagan smena: ${s.openShifts} ta`);
  return lines.join('\n');
}

async function orgChat(organizationId?: string): Promise<{ chatId: string; name: string } | null> {
  if (!organizationId) return null;
  const { Organization } = await getMasterModels();
  const org = await Organization.findById(organizationId).select('name telegramChatId').lean();
  return org?.telegramChatId ? { chatId: String(org.telegramChatId), name: org.name } : null;
}

/** Smena farq bilan yopilganda — darhol (xato sotuv/kassa amalini to'xtatmaydi) */
export async function notifyShiftClosed(
  user: { organizationId?: string; dbName?: string },
  p: { shiftNo: string; branch: string; by: string; expected: number; counted: number; difference: number },
): Promise<void> {
  if (!p.difference || !user.dbName) return;
  try {
    const { ShopSettings } = await getTenantModels(user.dbName);
    if (!(await getShopSettings(ShopSettings)).notify.shiftDiff) return;
    const chat = await orgChat(user.organizationId);
    if (chat) await sendTelegramTo(chat.chatId, shiftDiffText({ shop: chat.name, ...p }));
  } catch (e) {
    logError('notifyShiftClosed', e);
  }
}

/** Kunlik cron: "Kunlik yakun" yoqilgan va Telegram ulangan do'konlarga bugungi savdo */
export async function sendDailySummaries(now = new Date()): Promise<{ orgs: number; sent: number }> {
  const { Organization } = await getMasterModels();
  const orgs = await Organization.find({ status: 'active', telegramChatId: { $exists: true, $ne: '' } })
    .select('name dbName status expiresAt telegramChatId').lean();
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const range = { $gte: start, $lte: now };
  let checked = 0, sent = 0;

  for (const org of orgs) {
    if (!isOrganizationActive(org)) continue;
    try {
      const { ShopSettings, Sale, CashFlow, CashShift } = await getTenantModels(org.dbName);
      if (!(await getShopSettings(ShopSettings)).notify.dailySummary) continue;
      checked++;
      const [salesAgg, expAgg, openShifts] = await Promise.all([
        Sale.aggregate<{ count: number; total: number; debt: number }>([
          { $match: { createdAt: range, status: { $ne: 'cancelled' } } },
          { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$totalAmount' }, debt: { $sum: '$remainingAmount' } } },
        ]),
        CashFlow.aggregate<{ total: number }>([
          { $match: { createdAt: range, type: 'expense' } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
        CashShift.countDocuments({ status: 'open' }),
      ]);
      const text = dailySummaryText(org.name, now, {
        count: salesAgg[0]?.count ?? 0,
        total: salesAgg[0]?.total ?? 0,
        newDebt: salesAgg[0]?.debt ?? 0,
        expenses: expAgg[0]?.total ?? 0,
        openShifts,
      });
      if (await sendTelegramTo(String(org.telegramChatId), text)) sent++;
    } catch (e) {
      logError('sendDailySummaries', e, { dbName: org.dbName });
    }
  }
  return { orgs: checked, sent };
}
