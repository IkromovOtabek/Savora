import { NextResponse } from 'next/server';
import { getApiTenantContext } from '@/lib/auth';
import { getTenantModels } from '@/lib/tenantDb';
import { isFeatureEnabled } from '@/lib/features';
import { parsePeriod, periodRange } from '@/lib/period';
import { loadRealization, sumMoney } from '@/lib/realization';
import { buildXlsx, type XCell } from '@/lib/xlsxWrite';
import { fmtDateTime } from '@/lib/format';
import { getDict } from '@/lib/i18n/server';
import { qtyWithUnit } from '@/lib/i18n/fmt';

/**
 * Realizatsiya (Moliya) — Excel (.xlsx): «Pul harakati» va «Sotuvlar» varaqlari.
 * Moliya sahifasi bilan bir xil kirish: faqat do'kon egasi va «Kirim-Chiqim» moduli.
 */
export async function GET(req: Request) {
  const ctx = await getApiTenantContext();
  const d = await getDict();
  const x = d.stock.export;
  if (!ctx) return NextResponse.json({ error: x.authRequired }, { status: 401 });
  const { user, org } = ctx;
  if (user.role !== 'admin') return NextResponse.json({ error: x.noPermission }, { status: 403 });
  if (!isFeatureEnabled(org, 'kirimChiqim')) return NextResponse.json({ error: x.moduleOff }, { status: 403 });

  const period = parsePeriod(new URL(req.url).searchParams.get('p'), 'month');
  const { start, end } = periodRange(period);
  const m = await getTenantModels(user.dbName!);
  const { money, sold, branchNames } = await loadRealization(m, start, end);
  const mk = d.crm.money;
  const branch = (id?: string) => (id ? branchNames.get(id) ?? '' : '');

  // Pul harakati: eskisidan yangisiga (hisobot o'qilishi uchun), oxirida jami
  const sums = sumMoney(money);
  const moneyRows: XCell[][] = [
    [mk.colDate, mk.colKind, mk.colDesc, mk.colBranch, mk.colMethod, mk.colIn, mk.colOut],
    ...[...money].reverse().map((r) => [
      fmtDateTime(r.at),
      mk.kinds[r.kind],
      r.detail ? `${r.title} — ${r.detail}` : r.title,
      branch(r.branchId),
      r.method ? d.sales.payMethods[r.method] : '',
      r.amountIn || null,
      r.amountOut || null,
    ]),
    [],
    [mk.totalIn, null, null, null, null, sums.in, null],
    [mk.totalOut, null, null, null, null, null, sums.out],
    [mk.net, null, null, null, null, sums.net, null],
  ];

  const total = sold.reduce((a, r) => ({ t: a.t + r.total, c: a.c + r.cost, p: a.p + r.profit }), { t: 0, c: 0, p: 0 });
  const salesRows: XCell[][] = [
    [mk.colDate, mk.colSaleNo, mk.colProduct, mk.colQty, mk.colCustomer, mk.colPayType, mk.colBranch, mk.colSum, mk.colCost, mk.colProfit],
    ...[...sold].reverse().map((r) => [
      fmtDateTime(r.at),
      r.saleNo,
      r.product,
      r.unit && r.unit !== 'dona' ? qtyWithUnit(r.qty, r.unit, d.stock.fields.units) : r.qty,
      r.customer,
      d.sales.paymentTypes[r.paymentType],
      branch(r.branchId),
      r.total,
      r.cost,
      r.profit,
    ]),
    [],
    [`${sold.length}`, null, null, null, null, null, null, total.t, total.c, total.p],
  ];

  const bytes = buildXlsx([
    { name: mk.realTabMoney, rows: moneyRows, widths: [17, 22, 44, 18, 12, 14, 14], boldRows: [moneyRows.length - 3, moneyRows.length - 2, moneyRows.length - 1] },
    { name: mk.realTabSales, rows: salesRows, widths: [17, 16, 34, 9, 22, 16, 18, 14, 14, 14], boldRows: [salesRows.length - 1] },
  ]);
  const day = (dt: Date) => dt.toISOString().slice(0, 10);
  const last = new Date(end.getTime() - 1);
  const fileName = `realizatsiya_${day(start)}_${day(last)}.xlsx`;
  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    },
  });
}
