import { getMasterModels } from './masterDb';
import { getTenantModels } from './tenantDb';
import { getShopSettings } from './shopSettings';
import { isOrganizationActive } from './models/master/Organization';
import { sendTelegramTo, tgEscape } from './telegram';
import { pushToShop, orgIdsWithPush, type PushMessage } from './push';
import { PAYMENT_TYPE_LABELS, type PaymentType } from './models/tenant/Sale';
import { logError } from './logger';

/**
 * Do'kon egasiga bildirishnomalar (Do'kon sozlamalari → Bildirishnomalar):
 *  - Telegram — do'konning ulangan Telegram'iga (Organization.telegramChatId); ulanmagan bo'lsa — yo'q;
 *  - push — mobil ilova o'rnatilgan adminlar telefoniga (lib/push.ts), ovoz bilan.
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

/** Push uchun oddiy matn (HTML'siz) */
export function shiftDiffPush(p: { shiftNo: string; branch: string; by: string; expected: number; counted: number; difference: number }): PushMessage {
  const kind = p.difference < 0 ? 'Kamomad' : 'Ortiqcha';
  return {
    title: `Smena ${p.shiftNo}: ${kind.toLowerCase()} ${money(Math.abs(p.difference))} so'm`,
    body: `${p.branch} · ${p.by}\nKerak edi: ${money(p.expected)} so'm, sanaldi: ${money(p.counted)} so'm`,
    url: '/shifts',
  };
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

export function dailySummaryPush(shop: string, s: DailySummary): PushMessage {
  const lines = [`Sotuvlar: ${s.count} ta · ${money(s.total)} so'm`];
  if (s.newDebt > 0) lines.push(`Qarzga/nasiyaga: ${money(s.newDebt)} so'm`);
  if (s.expenses > 0) lines.push(`Xarajatlar: ${money(s.expenses)} so'm`);
  if (s.openShifts > 0) lines.push(`Yopilmagan smena: ${s.openShifts} ta`);
  return { title: `${shop} — kun yakuni`, body: lines.join('\n'), url: '/' };
}

const METHOD_LABELS: Record<string, string> = { cash: 'Naqd', uzcard: 'Uzcard', humo: 'Humo', click: 'Click', payme: 'Payme' };

/** Push uchun to'lov yorlig'i: qarz/nasiya/kredit — turi; to'liq to'lovda — usuli (naqd, Uzcard...) */
export function salePayLabel(paymentType: PaymentType, methods: (string | undefined)[] = []): string {
  if (paymentType !== 'cash') return PAYMENT_TYPE_LABELS[paymentType] ?? paymentType;
  const uniq = [...new Set(methods.map((m) => m || 'cash'))];
  if (uniq.length > 1) return "Aralash to'lov";
  return METHOD_LABELS[uniq[0] ?? 'cash'] ?? uniq[0];
}

export interface NewSale { saleNo?: string; items: number; firstItem: string; total: number; payment: string; by: string }

export function newSalePush(s: NewSale): PushMessage {
  const what = s.items > 1 ? `${s.firstItem} va yana ${s.items - 1} ta` : s.firstItem;
  return {
    title: `Yangi sotuv · ${money(s.total)} so'm`,
    body: `${s.saleNo ? `${s.saleNo} · ` : ''}${what}\n${s.payment} · ${s.by}`,
    url: '/(tabs)/sales',
  };
}

async function orgChat(organizationId?: string): Promise<{ chatId: string; name: string } | null> {
  if (!organizationId) return null;
  const { Organization } = await getMasterModels();
  const org = await Organization.findById(organizationId).select('name telegramChatId').lean();
  return org?.telegramChatId ? { chatId: String(org.telegramChatId), name: org.name } : null;
}

/** Smena farq bilan yopilganda — darhol (xato sotuv/kassa amalini to'xtatmaydi) */
export async function notifyShiftClosed(
  user: { id?: string; organizationId?: string; dbName?: string },
  p: { shiftNo: string; branch: string; by: string; expected: number; counted: number; difference: number },
): Promise<void> {
  if (!p.difference || !user.dbName) return;
  try {
    const { ShopSettings } = await getTenantModels(user.dbName);
    if (!(await getShopSettings(ShopSettings)).notify.shiftDiff) return;
    const chat = await orgChat(user.organizationId);
    await Promise.all([
      chat ? sendTelegramTo(chat.chatId, shiftDiffText({ shop: chat.name, ...p })) : null,
      pushToShop(user.dbName, { admins: true }, shiftDiffPush(p), { exceptUserId: user.id }),
    ]);
  } catch (e) {
    logError('notifyShiftClosed', e);
  }
}

/**
 * Sotuv bo'lganda — adminlar telefoniga push ("Yangi sotuv" yoqilgan bo'lsa; sukut bo'yicha o'chiq).
 * Sotuvni qilgan odamning o'ziga yuborilmaydi. Javobni kutmang: `void notifyNewSale(...)`.
 */
export async function notifyNewSale(user: { id?: string; dbName?: string }, s: NewSale): Promise<void> {
  if (!user.dbName) return;
  try {
    const { ShopSettings } = await getTenantModels(user.dbName);
    if (!(await getShopSettings(ShopSettings)).notify.newSale) return;
    await pushToShop(user.dbName, { admins: true }, newSalePush(s), { exceptUserId: user.id });
  } catch (e) {
    logError('notifyNewSale', e);
  }
}

/** Kunlik cron: "Kunlik yakun" yoqilgan va Telegram yoki ilova ulangan do'konlarga bugungi savdo */
export async function sendDailySummaries(now = new Date()): Promise<{ orgs: number; sent: number; push: number }> {
  const { Organization } = await getMasterModels();
  const pushOrgs = [...(await orgIdsWithPush())];
  const orgs = await Organization.find({
    status: 'active',
    $or: [{ telegramChatId: { $exists: true, $ne: '' } }, { _id: { $in: pushOrgs } }],
  }).select('name dbName status expiresAt telegramChatId').lean();
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const range = { $gte: start, $lte: now };
  let checked = 0, sent = 0, push = 0;

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
      const summary: DailySummary = {
        count: salesAgg[0]?.count ?? 0,
        total: salesAgg[0]?.total ?? 0,
        newDebt: salesAgg[0]?.debt ?? 0,
        expenses: expAgg[0]?.total ?? 0,
        openShifts,
      };
      if (org.telegramChatId && await sendTelegramTo(String(org.telegramChatId), dailySummaryText(org.name, now, summary))) sent++;
      push += await pushToShop(org.dbName, { admins: true }, dailySummaryPush(org.name, summary));
    } catch (e) {
      logError('sendDailySummaries', e, { dbName: org.dbName });
    }
  }
  return { orgs: checked, sent, push };
}
