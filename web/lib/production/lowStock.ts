/**
 * Ombor ogohlantirishi — kuniga bir marta (mavjud `/api/cron/daily-summary` cron'iga ulangan), bitta xabarda:
 *  1) minimal qoldiqdan kam — `purchasing`, `production` yoki `tables` (restoran: xom ashyo) moduli yoqiq do'konlarda.
 *     Restoranda kun davomida ham ilova ichida xabar bor (lib/restaurant/stockAlerts.ts — taom yuborilganda); bu esa
 *     kunlik yig'ma (Telegram + egasiga push). Faqat `minStock` kiritilgan mahsulotlar — kiritilmagan do'konga xabar bormaydi;
 *  2) yaroqlilik muddati yaqin/o'tgan — `ShopSettings.stock.expiryWarnDays` o'rnatilgan do'konlarda (ro'yxatdan
 *     o'tish ustasi yozadi), omborda qoldig'i bor tovarlar.
 * Shart: do'kon faol, Telegram ulangan yoki ilovada push qurilmasi bor. Telegram — do'kon chatiga, push — adminlarga.
 * Matn — d.production.lowStock (uz; cron'da til tanlovi yo'q, mavjud bildirishnomalar kabi).
 */
import { getMasterModels } from '../masterDb';
import { getTenantModels } from '../tenantDb';
import { isOrganizationActive } from '../models/master/Organization';
import { resolveOrgFeatures } from '../features';
import { sendTelegramTo, tgEscape } from '../telegram';
import { pushToShop, orgIdsWithPush } from '../push';
import { getDictionary } from '../i18n/dict';
import { tr } from '../i18n/fmt';
import { fmtQty, roundQty } from '../qty';
import { logError } from '../logger';
import { daysUntil, expiringFilter, lowStockFilter } from './catalog';

const SHOW = 10;

export interface LowItem { name: string; available: number; minStock: number; unit?: string | null; branch?: string }
/** Muddati yaqin tovar: `days` — bugundan necha kun (0 — bugun, manfiy — o'tgan) */
export interface ExpiringItem { name: string; days: number; available: number; unit?: string | null; branch?: string }

/** Telegram (HTML) va push matni — sof, testlanadi. `expiring` bo'lmasa — faqat minimal qoldiq (avvalgidek) */
export function lowStockMessage(
  shop: string,
  items: readonly LowItem[],
  expiring: readonly ExpiringItem[] = [],
): { text: string; push: { title: string; body: string; url: string } } {
  const t = getDictionary('uz').production.lowStock;
  const units = getDictionary('uz').stock.fields.units as Record<string, string>;
  const u = (x: { unit?: string | null }) => (x.unit ? ` ${units[x.unit] ?? x.unit}` : '');
  const where = (x: { name: string; branch?: string }) => `${x.name}${x.branch ? ` (${x.branch})` : ''}`;
  const line = (x: LowItem) => tr(t.notifyLine, { name: where(x), qty: `${fmtQty(x.available)}${u(x)}`, min: `${fmtQty(x.minStock)}${u(x)}` });
  const when = (days: number) => (days < 0 ? tr(t.expPast, { n: -days }) : days === 0 ? t.expToday : tr(t.expDays, { n: days }));
  const expLine = (x: ExpiringItem) => tr(t.expLine, { name: where(x), qty: `${fmtQty(x.available)}${u(x)}`, when: when(x.days) });
  const exp = [...expiring].sort((a, b) => a.days - b.days);

  const lowTitle = tr(t.notifyTitle, { shop, n: items.length });
  const expTitle = tr(t.expTitle, { shop, n: exp.length });
  const title = items.length ? lowTitle : expTitle;
  const section = <T,>(list: readonly T[], fmt: (x: T) => string, max: number) => [
    ...list.slice(0, max).map(fmt),
    ...(list.length > max ? [tr(t.more, { n: list.length - max })] : []),
  ];
  const text: string[] = [];
  if (items.length) {
    text.push(`📦 <b>${tgEscape(lowTitle)}</b>`, '', ...section(items, (x) => `• ${tgEscape(line(x))}`, SHOW).map((l) => (l.startsWith('• ') ? l : tgEscape(l))));
  }
  if (exp.length) {
    if (text.length) text.push('');
    text.push(`⏳ <b>${tgEscape(items.length ? tr(t.expSection, { n: exp.length }) : expTitle)}</b>`, '', ...section(exp, (x) => `• ${tgEscape(expLine(x))}`, SHOW).map((l) => (l.startsWith('• ') ? l : tgEscape(l))));
  }
  const body = [...section(items, line, 5), ...section(exp, expLine, items.length ? 3 : 5)];
  return { text: text.join('\n'), push: { title, body: body.join('\n'), url: '/' } };
}

/** Kunlik cron: minimal qoldiqdan kam mahsulotlar haqida do'kon egasiga xabar */
export async function sendLowStockAlerts(): Promise<{ orgs: number; sent: number; push: number }> {
  const { Organization } = await getMasterModels();
  const pushOrgs = [...(await orgIdsWithPush())];
  const orgs = await Organization.find({
    status: 'active',
    $or: [{ telegramChatId: { $exists: true, $ne: '' } }, { _id: { $in: pushOrgs } }],
  }).select('name dbName status expiresAt telegramChatId plan features businessType').lean();
  let checked = 0, sent = 0, push = 0;
  const now = new Date();
  for (const org of orgs) {
    if (!isOrganizationActive(org)) continue;
    const f = resolveOrgFeatures(org);
    try {
      const { Product, Branch, ShopSettings } = await getTenantModels(org.dbName);
      const warnDays = (await ShopSettings.findOne({ key: 'main' }).select('stock').lean())?.stock?.expiryWarnDays ?? 0;
      const wantLow = f.purchasing || f.production || f.tables;
      if (!wantLow && !(warnDays > 0)) continue;
      const fields = 'name quantity soldQuantity status minStock unit branchId expiryDate';
      const [low, exp] = await Promise.all([
        wantLow ? Product.find(lowStockFilter()).select(fields).sort({ name: 1 }).limit(200).lean() : Promise.resolve([]),
        warnDays > 0 ? Product.find(expiringFilter(warnDays, now)).select(fields).sort({ expiryDate: 1 }).limit(200).lean() : Promise.resolve([]),
      ]);
      if (!low.length && !exp.length) continue;
      checked++;
      const branches = new Map((await Branch.find({ active: true }).select('name').lean()).map((b) => [String(b._id), b.name]));
      const multi = branches.size > 1;
      const avail = (p: { status?: string; quantity?: number; soldQuantity?: number }) =>
        p.status === 'in_stock' ? Math.max(0, roundQty((p.quantity ?? 0) - (p.soldQuantity ?? 0))) : 0;
      const items: LowItem[] = low.map((p) => ({
        name: p.name,
        available: avail(p),
        minStock: p.minStock ?? 0,
        unit: p.unit,
        ...(multi ? { branch: branches.get(String(p.branchId)) } : {}),
      }));
      const expiring: ExpiringItem[] = exp.filter((p) => p.expiryDate).map((p) => ({
        name: p.name,
        days: daysUntil(p.expiryDate!, now),
        available: avail(p),
        unit: p.unit,
        ...(multi ? { branch: branches.get(String(p.branchId)) } : {}),
      }));
      const msg = lowStockMessage(org.name, items, expiring);
      if (org.telegramChatId && await sendTelegramTo(String(org.telegramChatId), msg.text)) sent++;
      push += await pushToShop(org.dbName, { admins: true }, msg.push);
    } catch (e) {
      logError('sendLowStockAlerts', e, { dbName: org.dbName });
    }
  }
  return { orgs: checked, sent, push };
}
