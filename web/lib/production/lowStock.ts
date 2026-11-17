/**
 * Minimal qoldiq ogohlantirishi — kuniga bir marta (mavjud `/api/cron/daily-summary` cron'iga ulangan).
 * Shart: do'kon faol, `purchasing` yoki `production` moduli yoqiq, Telegram ulangan yoki ilovada push qurilmasi bor,
 * kamida bitta mahsulotda `minStock` dan kam qoldiq. Telegram — do'kon chatiga, push — adminlarga.
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
import { lowStockFilter } from './catalog';

const SHOW = 10;

export interface LowItem { name: string; available: number; minStock: number; unit?: string | null; branch?: string }

/** Telegram (HTML) va push matni — sof, testlanadi */
export function lowStockMessage(shop: string, items: readonly LowItem[]): { text: string; push: { title: string; body: string; url: string } } {
  const t = getDictionary('uz').production.lowStock;
  const units = getDictionary('uz').stock.fields.units as Record<string, string>;
  const u = (x: LowItem) => (x.unit ? ` ${units[x.unit] ?? x.unit}` : '');
  const line = (x: LowItem) => tr(t.notifyLine, {
    name: `${x.name}${x.branch ? ` (${x.branch})` : ''}`,
    qty: `${fmtQty(x.available)}${u(x)}`,
    min: `${fmtQty(x.minStock)}${u(x)}`,
  });
  const shown = items.slice(0, SHOW);
  const more = items.length > SHOW ? [tr(t.more, { n: items.length - SHOW })] : [];
  const title = tr(t.notifyTitle, { shop, n: items.length });
  return {
    text: [`📦 <b>${tgEscape(title)}</b>`, '', ...shown.map((x) => `• ${tgEscape(line(x))}`), ...more.map(tgEscape)].join('\n'),
    push: { title, body: [...shown.slice(0, 5).map(line), ...(items.length > 5 ? [tr(t.more, { n: items.length - 5 })] : [])].join('\n'), url: '/' },
  };
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
  for (const org of orgs) {
    if (!isOrganizationActive(org)) continue;
    const f = resolveOrgFeatures(org);
    if (!f.purchasing && !f.production) continue;
    try {
      const { Product, Branch } = await getTenantModels(org.dbName);
      const low = await Product.find(lowStockFilter()).select('name quantity soldQuantity status minStock unit branchId').sort({ name: 1 }).limit(200).lean();
      if (!low.length) continue;
      checked++;
      const branches = new Map((await Branch.find({ active: true }).select('name').lean()).map((b) => [String(b._id), b.name]));
      const multi = branches.size > 1;
      const items: LowItem[] = low.map((p) => ({
        name: p.name,
        available: p.status === 'in_stock' ? Math.max(0, roundQty((p.quantity ?? 0) - (p.soldQuantity ?? 0))) : 0,
        minStock: p.minStock ?? 0,
        unit: p.unit,
        ...(multi ? { branch: branches.get(String(p.branchId)) } : {}),
      }));
      const msg = lowStockMessage(org.name, items);
      if (org.telegramChatId && await sendTelegramTo(String(org.telegramChatId), msg.text)) sent++;
      push += await pushToShop(org.dbName, { admins: true }, msg.push);
    } catch (e) {
      logError('sendLowStockAlerts', e, { dbName: org.dbName });
    }
  }
  return { orgs: checked, sent, push };
}
