// Kassir oynasi, «Hisoblar» va saboyning stoli — UI render smoke (RESTORAN_API.md §16)
import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh() {}, push() {}, replace() {} }),
  usePathname: () => '/app/tables/cashier',
  useSearchParams: () => new URLSearchParams(''),
  redirect: () => { throw new Error('redirect'); },
}));
vi.mock('@/app/actions/restaurant', () => {
  const f = async () => ({ ok: true, data: {} });
  return {
    openOrderAction: f, ackTableCallAction: f, precheckOrderAction: f, payOrderAction: f, addOrderItemsAction: f,
    bumpItemsAction: f, confirmQrItemsAction: f, reopenOrderAction: f, sendToKitchenAction: f, cancelOrderAction: f,
    transferOrderAction: f, updateOrderInfoAction: f, voidOrderItemAction: f,
  };
});

import TablesBoard from '@/components/restaurant/order/TablesBoard';
import BillsList, { BillsSummaryBar, billTitle } from '@/components/restaurant/order/BillsList';
import CashierScreen from '@/components/restaurant/cashier/CashierScreen';
import PrecheckPaper from '@/components/restaurant/order/PrecheckPaper';
import ReceiptPaper from '@/components/tenant/ReceiptPaper';
import { buildBills } from '@/lib/restaurant/bills';
import { getDictionary } from '@/lib/i18n/dict';
import type { TablesBoard as Board } from '@/lib/restaurant/queries';
import type { OrderSummary, OrderView } from '@/lib/restaurant/view';
import { DEFAULT_SHOP_SETTINGS } from '@/lib/shopSettings';

const id = (n: number) => n.toString(16).padStart(24, 'a');
/** HTML matni: apostrof va bo'linmas bo'sh joy (summalar) oddiy ko'rinishga */
const render = (el: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(el).replace(/&#x27;/g, "'").replace(/[\u00a0\u202f]/g, ' ');
const NOW = Date.parse('2026-11-20T12:00:00.000Z');
const d = getDictionary('uz');

const sum = (n: number, p: Partial<OrderSummary> = {}): OrderSummary => ({
  id: id(n), orderNo: `B20261120-${String(n).padStart(4, '0')}`, type: 'dine_in', status: 'open', source: 'waiter',
  tableId: null, tableNumber: null, forTableId: null, forTableNumber: null, guests: 2,
  waiterId: 'u1', waiterName: 'Ali Valiyev', openedAt: '2026-11-20T11:00:00.000Z', precheckAt: null, updatedAt: null,
  access: true, mine: true, total: 50000, due: 50000, counts: { items: 2, pending: 0, unsent: 0, active: 0, ready: 0, voided: 0, unpaid: 2 }, ...p,
});

const board: Board = {
  serverTime: new Date(NOW).toISOString(),
  branchId: id(1),
  branches: [],
  halls: [{ id: id(2), name: 'Asosiy zal', sort: 0 }],
  tables: [
    { id: id(10), hallId: id(2), number: 5, seats: 4, x: null, y: null, calls: { waiterAt: null, billAt: '2026-11-20T11:50:00.000Z' }, order: sum(20, { tableId: id(10), tableNumber: 5 }), reservation: null },
    { id: id(11), hallId: id(2), number: 6, seats: 2, x: null, y: null, calls: { waiterAt: null, billAt: null }, order: null, reservation: null },
  ],
  takeaway: [
    sum(30, { type: 'takeaway', source: 'cashier', forTableId: id(10), forTableNumber: 5, due: 25000 }),
    sum(31, { type: 'takeaway', source: 'cashier', due: 12000, status: 'precheck' }),
  ],
};

describe('hisoblar UI', () => {
  it('stol kartochkasida «+ saboy N · summa», saboy kartochkasida stol', () => {
    const html = render(createElement(TablesBoard, { initial: board, serverNow: NOW, canCreate: true, canAck: true, canManage: false }));
    expect(html).toContain('+ saboy 1 · 25 000');
    expect(html).toContain('rt-table-badges');
    expect(html).toContain('5-stol');
    // «Stollar | Hisoblar» almashtirgich, hisoblar soni
    expect(html).toContain(d.cashier.viewBills);
    expect(html).toContain('role="radiogroup"');
  });

  it('hisoblar ro\'yxati: guruhlangan saboy, hisob so\'radi, havolalar', () => {
    const { rows, summary } = buildBills(board);
    const html = render(createElement(BillsList, { rows, now: NOW, label: 'x', canAck: true, ackingTable: null, onAck: () => {} }));
    expect(html).toContain(`/app/tables/${id(20)}`);
    expect(html).toContain(`/app/tables/${id(30)}`);
    expect(html).toContain('rt-bill-kids');
    expect(html).toContain(d.cashier.billRequested);
    expect(html).toContain('Saboy №0030 · 5-stol');
    expect(html).toContain('Saboy №0031');
    const bar = render(createElement(BillsSummaryBar, { summary }));
    expect(bar).toContain('87 000');
    expect(billTitle(sum(1, { tableNumber: 3 }), d)).toBe('3-stol');
  });

  it('kassir oynasi: navbat, qidiruv, smena ogohlantirishi', () => {
    const html = render(createElement(CashierScreen, { initial: board, serverNow: NOW, noShift: true, canShift: true, canAck: true, shopName: 'Osh markazi' }));
    expect(html).toContain(d.cashier.queue);
    expect(html).toContain(d.cashier.searchPh);
    expect(html).toContain('/app/shifts');
    expect(html).toContain(d.cashier.pickBill);
    // Tanlash tugmalari (havola emas)
    expect(html).not.toContain(`href="/app/tables/${id(20)}"`);
    const noWarn = render(createElement(CashierScreen, { initial: board, serverNow: NOW, noShift: false, canShift: true, canAck: true, shopName: 'x' }));
    expect(noWarn).not.toContain('/app/shifts');
  });

  it('pre-chek va chek: «Saboy · 5-stol»', () => {
    const order = {
      id: id(30), orderNo: 'B20261120-0030', branchId: id(1), type: 'takeaway', source: 'cashier', status: 'precheck',
      tableId: null, tableNumber: null, hallId: null, hallName: null, forTableId: id(10), forTableNumber: 5, guests: null,
      waiterId: 'u1', waiterName: 'Ali', note: null, serviceChargePct: 0, packFee: 0, packFeePaid: false, openedBy: 'ali',
      openedAt: null, precheckAt: null, paidAt: null, cancelledAt: null, cancelReason: null, updatedAt: null, rev: 1,
      requireVoidReason: true, items: [], payments: [],
      bill: { subtotal: 0, paid: 0, dueSubtotal: 0, dueServiceCharge: 0, duePackFee: 0, due: 0, total: 0, servicePct: 0, counts: { items: 0, pending: 0, unsent: 0, active: 0, ready: 0, voided: 0, unpaid: 0 } },
    } as OrderView;
    const pre = render(createElement(PrecheckPaper, { order, org: { name: 'Osh' }, receipt: DEFAULT_SHOP_SETTINGS.receipt, d, printedAt: new Date(NOW).toISOString() }));
    expect(pre).toContain('Saboy · 5-stol');
    const sale = {
      saleNo: 'S-1', productSnapshot: { name: 'Osh', imei: '-', purchasePrice: 0, saleQuantity: 1 }, paymentType: 'cash', totalAmount: 45000,
      paidAmount: 45000, remainingAmount: 0, soldBy: 'ali', createdAt: new Date(NOW), forTableNumber: 5, payments: [],
    };
    const rc = render(createElement(ReceiptPaper, { sales: [sale as never], org: { name: 'Osh' }, receipt: DEFAULT_SHOP_SETTINGS.receipt, d }));
    expect(rc).toContain('5-stol');
    expect(rc).toContain(d.restaurant.common.orderTypes.takeaway);
  });
});
