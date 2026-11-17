/**
 * Restoran — holat o'tishlari va ruxsat qoidalari (sof funksiyalar, DB importi yo'q; testlanadi).
 * Server tekshiruvi (lib/restaurant/ops.ts) va UI tugmalari shu bitta manbadan foydalanadi.
 */
import type { PermissionKey } from '../permissions';
import type { ItemStatus, OrderStatus, VoidStage } from './types';

/**
 * Taom holati o'tishlari (bekor qilish — alohida qoida, voidRule):
 *   pending → new (ofitsant tasdiqladi)
 *   new     → sent (faqat «yuborish» amali orqali — ombor band qilinadi; stansiyasiz taom shu amalda darhol served)
 *   sent    → cooking | ready | served
 *   cooking → ready | served
 *   ready   → served | cooking (oshxona «qaytarish»)
 */
export const ITEM_TRANSITIONS: Record<ItemStatus, readonly ItemStatus[]> = {
  pending: ['new'],
  new: ['sent'],
  sent: ['cooking', 'ready', 'served'],
  cooking: ['ready', 'served'],
  ready: ['served', 'cooking'],
  served: [],
  voided: [],
};

export function canTransition(from: ItemStatus, to: ItemStatus): boolean {
  return ITEM_TRANSITIONS[from].includes(to);
}

/** Oshxona/ofitsant belgilashi mumkin bo'lgan holatlar (bump) */
export const BUMP_TARGETS = ['cooking', 'ready', 'served'] as const;
export type BumpTarget = (typeof BUMP_TARGETS)[number];

/** Bump uchun kerakli huquqlar (birortasi yetarli) */
export function bumpPermissions(to: BumpTarget): PermissionKey[] {
  // «Yetkazildi» — ofitsant (o'z stoli) yoki peshtaxta/bar xodimi (KDS)
  return to === 'served' ? ['order.create', 'kitchen.bump'] : ['kitchen.bump'];
}

/** Bekor qilish bosqichi — ombor qaytariladimi va qaysi huquq kerakligini belgilaydi */
export function voidStageOf(status: ItemStatus): VoidStage | null {
  if (status === 'pending' || status === 'new') return 'unsent';
  if (status === 'sent') return 'beforeCook';
  if (status === 'cooking' || status === 'ready' || status === 'served') return 'afterCook';
  return null; // allaqachon bekor qilingan
}

export interface VoidRule {
  stage: VoidStage;
  /** Yuborilgan taom — maxsus huquq; yuborilmagani — oddiy buyurtma huquqi */
  permission: PermissionKey;
  /** Sabab majburiymi */
  reasonRequired: boolean;
  /** Ombor qaytariladimi (tayyorlash boshlanmagan) */
  releaseStock: boolean;
  /** Yo'qotish sifatida auditga (tayyorlangan taom) */
  loss: boolean;
}

/** Taomni bekor qilish qoidasi; null — bekor qilib bo'lmaydi (allaqachon bekor yoki to'langan) */
export function voidRule(
  item: { status: ItemStatus; paidCheckoutId?: string | null; stockReserved?: boolean | null },
  settings: { requireVoidReason: boolean },
): VoidRule | null {
  if (item.paidCheckoutId) return null;
  const stage = voidStageOf(item.status);
  if (!stage) return null;
  const sent = stage !== 'unsent';
  return {
    stage,
    permission: sent ? 'order.voidItem' : 'order.create',
    reasonRequired: sent && settings.requireVoidReason,
    releaseStock: stage === 'beforeCook' && item.stockReserved !== false,
    loss: stage === 'afterCook',
  };
}

/** Buyurtma holatida qaysi amallar mumkin */
export type OrderOp =
  | 'addItems' | 'send' | 'confirm' | 'void' | 'bump' | 'transfer' | 'precheck' | 'reopen' | 'pay' | 'cancel' | 'edit';

const OPS_BY_STATUS: Record<OrderStatus, readonly OrderOp[]> = {
  open: ['addItems', 'send', 'confirm', 'void', 'bump', 'transfer', 'precheck', 'pay', 'cancel', 'edit'],
  // Pre-chekdan keyin tarkib o'zgarmaydi (faqat qayta ochish bilan); oshxona ishlashda davom etadi
  precheck: ['bump', 'transfer', 'reopen', 'pay', 'cancel'],
  // To'langan saboy buyurtma hali tayyorlanayotgan bo'lishi mumkin
  paid: ['bump'],
  cancelled: [],
};

export function orderAllows(status: OrderStatus, op: OrderOp): boolean {
  return OPS_BY_STATUS[status].includes(op);
}

export interface OrderActor {
  id: string;
  role: string;
  branchId?: string;
}

/** Filial doirasi: filial xodimi faqat o'z filiali buyurtmasini ko'radi (admin — hammasini) */
export function inBranchScope(actor: OrderActor, branchId: unknown): boolean {
  if (actor.role === 'admin') return true;
  if (actor.role !== 'user' || !actor.branchId) return false;
  return String(branchId) === actor.branchId;
}

/**
 * Buyurtmani ko'rish/o'zgartirish: filial doirasi + («Barcha buyurtmalar» yoki o'z stoli yoki
 * ofitsanti hali yo'q — mijoz QR orqali ochgan, istalgan ofitsant tasdiqlay oladi).
 */
export function canAccessOrder(
  actor: OrderActor,
  perms: ReadonlySet<PermissionKey>,
  order: { branchId: unknown; waiterId?: string | null },
): boolean {
  if (!inBranchScope(actor, order.branchId)) return false;
  if (perms.has('order.viewAll')) return true;
  if (!perms.has('order.create')) return false;
  return !order.waiterId || order.waiterId === actor.id;
}

/** UI uchun: shu buyurtmada qaysi tugmalar ko'rinadi (server baribir qayta tekshiradi) */
export function orderCapabilities(
  actor: OrderActor,
  perms: ReadonlySet<PermissionKey>,
  order: { branchId: unknown; waiterId?: string | null; status: OrderStatus },
) {
  const access = canAccessOrder(actor, perms, order);
  const can = (op: OrderOp, perm: PermissionKey) => access && orderAllows(order.status, op) && perms.has(perm);
  return {
    view: access,
    edit: can('addItems', 'order.create'),
    send: can('send', 'order.create'),
    voidUnsent: can('void', 'order.create'),
    voidSent: can('void', 'order.voidItem'),
    serve: access && orderAllows(order.status, 'bump') && (perms.has('order.create') || perms.has('kitchen.bump')),
    transfer: can('transfer', 'order.transfer'),
    precheck: can('precheck', 'order.create'),
    reopen: can('reopen', 'order.reopen'),
    pay: can('pay', 'sale.create'),
    split: can('pay', 'sale.create') && perms.has('order.split'),
    discount: can('pay', 'sale.create') && perms.has('sale.discount'),
    cancel: can('cancel', 'order.create'),
  };
}
export type OrderCapabilities = ReturnType<typeof orderCapabilities>;
