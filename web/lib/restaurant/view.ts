/**
 * Buyurtma → JSON ko'rinishi (API va server action javoblari). ObjectId'lar satrga, hisob va
 * vaqt o'lchovlari qo'shiladi. UI shu shaklga tayanadi (docs/RESTORAN_API.md → «OrderView»).
 */
import type { OrderDoc, IOrderItem } from '../models/tenant/Order';
import type { PermissionKey } from '../permissions';
import { receiptPath } from '../receiptLink';
import { computeBill, itemTotal, type BillSummary } from './bill';
import { itemDisplayName } from './modifiers';
import { orderCapabilities, type OrderActor, type OrderCapabilities } from './rules';
import { itemTimings, type ItemTimings } from './timings';
import { DEFAULT_RESTAURANT_SETTINGS, type ItemStatus, type OrderModifier, type OrderSource, type OrderStatus, type OrderType, type StationKind, type VoidStage } from './types';

const iso = (d?: Date | string | null): string | null => (d ? new Date(d).toISOString() : null);
const sid = (v: unknown): string | null => (v === undefined || v === null ? null : String(v));

export interface OrderItemView {
  id: string;
  clientItemId: string | null;
  productId: string;
  name: string;
  /** Nom + modifikatorlar: «Osh (Katta, Achchiq)» */
  displayName: string;
  basePrice: number;
  price: number;
  qty: number;
  unit: string | null;
  /** price × qty (so'm) */
  total: number;
  modifiers: OrderModifier[];
  note: string | null;
  stationId: string | null;
  stationKind: StationKind | null;
  status: ItemStatus;
  stockReserved: boolean;
  fromQr: boolean;
  addedBy: string;
  addedAt: string | null;
  sentAt: string | null;
  cookStartedAt: string | null;
  readyAt: string | null;
  servedAt: string | null;
  voidedAt: string | null;
  voidedBy: string | null;
  voidReason: string | null;
  voidStage: VoidStage | null;
  paid: boolean;
  paidCheckoutId: string | null;
  saleId: string | null;
  timings: ItemTimings;
}

export interface OrderPaymentView {
  checkoutId: string;
  itemIds: string[];
  saleIds: string[];
  subtotal: number;
  discount: number;
  serviceCharge: number;
  packFee: number;
  total: number;
  parts: { method: string; amount: number }[];
  change: number;
  paidAt: string | null;
  by: string;
  /** Mijozga ulashiladigan ochiq chek (/r/…) */
  publicPath: string;
}

export interface OrderView {
  id: string;
  orderNo: string;
  branchId: string;
  type: OrderType;
  source: OrderSource;
  status: OrderStatus;
  tableId: string | null;
  tableNumber: number | null;
  hallId: string | null;
  /** Zal nomi (pre-chekda) — null: stolsiz yoki zal o'chirilgan */
  hallName: string | null;
  guests: number | null;
  waiterId: string | null;
  waiterName: string | null;
  note: string | null;
  serviceChargePct: number;
  packFee: number;
  packFeePaid: boolean;
  openedBy: string;
  openedAt: string | null;
  precheckAt: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  updatedAt: string | null;
  /** Optimistik qulf versiyasi (ma'lumot uchun) */
  rev: number;
  /** Do'kon sozlamasi: yuborilgan taomni bekor qilishda sabab majburiy (UI alohida sozlama o'qimasin) */
  requireVoidReason: boolean;
  items: OrderItemView[];
  payments: OrderPaymentView[];
  bill: BillSummary;
  /** Joriy foydalanuvchi uchun mumkin bo'lgan amallar (UI tugmalari) */
  can?: OrderCapabilities;
}

export function itemView(i: IOrderItem): OrderItemView {
  return {
    id: String(i._id),
    clientItemId: i.clientItemId ?? null,
    productId: String(i.productId),
    name: i.name,
    displayName: itemDisplayName(i.name, i.modifiers),
    basePrice: i.basePrice,
    price: i.price,
    qty: i.qty,
    unit: i.unit ?? null,
    total: itemTotal(i),
    modifiers: (i.modifiers ?? []).map((m) => ({ group: m.group, name: m.name, price: m.price })),
    note: i.note ?? null,
    stationId: sid(i.stationId),
    stationKind: i.stationKind ?? null,
    status: i.status,
    stockReserved: !!i.stockReserved,
    fromQr: !!i.fromQr,
    addedBy: i.addedBy,
    addedAt: iso(i.addedAt),
    sentAt: iso(i.sentAt),
    cookStartedAt: iso(i.cookStartedAt),
    readyAt: iso(i.readyAt),
    servedAt: iso(i.servedAt),
    voidedAt: iso(i.voidedAt),
    voidedBy: i.voidedBy ?? null,
    voidReason: i.voidReason ?? null,
    voidStage: i.voidStage ?? null,
    paid: !!i.paidCheckoutId,
    paidCheckoutId: i.paidCheckoutId ?? null,
    saleId: sid(i.saleId),
    timings: itemTimings(i),
  };
}

export function orderView(
  o: OrderDoc,
  opts: {
    orgId: string;
    actor?: OrderActor;
    perms?: ReadonlySet<PermissionKey>;
    /** Zal nomi (ops.orderViewFor to'ldiradi) */
    hallName?: string | null;
    /** Sozlamadagi qiymat; berilmasa — standart (true) */
    requireVoidReason?: boolean;
  },
): OrderView {
  const view: OrderView = {
    id: String(o._id),
    orderNo: o.orderNo,
    branchId: String(o.branchId),
    type: o.type,
    source: o.source,
    status: o.status,
    tableId: sid(o.tableId),
    tableNumber: o.tableNumber ?? null,
    hallId: sid(o.hallId),
    hallName: opts.hallName ?? null,
    guests: o.guests ?? null,
    waiterId: o.waiterId ?? null,
    waiterName: o.waiterName ?? null,
    note: o.note ?? null,
    serviceChargePct: o.serviceChargePct ?? 0,
    packFee: o.packFee ?? 0,
    packFeePaid: !!o.packFeePaid,
    openedBy: o.openedBy,
    openedAt: iso(o.openedAt),
    precheckAt: iso(o.precheckAt),
    paidAt: iso(o.paidAt),
    cancelledAt: iso(o.cancelledAt),
    cancelReason: o.cancelReason ?? null,
    updatedAt: iso(o.updatedAt),
    rev: o.rev ?? 0,
    requireVoidReason: opts.requireVoidReason ?? DEFAULT_RESTAURANT_SETTINGS.requireVoidReason,
    items: (o.items ?? []).map(itemView),
    payments: (o.payments ?? []).map((p) => ({
      checkoutId: p.checkoutId,
      itemIds: (p.itemIds ?? []).map(String),
      saleIds: (p.saleIds ?? []).map(String),
      subtotal: p.subtotal,
      discount: p.discount ?? 0,
      serviceCharge: p.serviceCharge ?? 0,
      packFee: p.packFee ?? 0,
      total: p.total,
      parts: (p.parts ?? []).map((x) => ({ method: x.method, amount: x.amount })),
      change: p.change ?? 0,
      paidAt: iso(p.paidAt),
      by: p.by,
      publicPath: receiptPath(opts.orgId, p.checkoutId),
    })),
    bill: computeBill(o),
  };
  if (opts.actor && opts.perms) view.can = orderCapabilities(opts.actor, opts.perms, o);
  return view;
}

/** Ro'yxatlar uchun yengil ko'rinish (stollar, buyurtmalar ro'yxati) */
export interface OrderSummary {
  id: string;
  orderNo: string;
  type: OrderType;
  status: OrderStatus;
  source: OrderSource;
  tableId: string | null;
  tableNumber: number | null;
  guests: number | null;
  waiterId: string | null;
  waiterName: string | null;
  openedAt: string | null;
  updatedAt: string | null;
  /** Joriy foydalanuvchi buyurtmani ochib ko'ra oladimi (boshqa ofitsant stolida — false, summalar yashirin) */
  access: boolean;
  mine: boolean;
  total: number | null;
  due: number | null;
  counts: BillSummary['counts'] | null;
}

export function orderSummary(o: OrderDoc, actorId: string, access: boolean): OrderSummary {
  const bill = access ? computeBill(o) : null;
  return {
    id: String(o._id),
    orderNo: o.orderNo,
    type: o.type,
    status: o.status,
    source: o.source,
    tableId: sid(o.tableId),
    tableNumber: o.tableNumber ?? null,
    guests: o.guests ?? null,
    waiterId: o.waiterId ?? null,
    waiterName: o.waiterName ?? null,
    openedAt: iso(o.openedAt),
    updatedAt: iso(o.updatedAt),
    access,
    mine: !!o.waiterId && o.waiterId === actorId,
    total: bill ? bill.total : null,
    due: bill ? bill.due : null,
    counts: bill ? bill.counts : null,
  };
}
