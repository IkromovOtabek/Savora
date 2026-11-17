/**
 * Ishlab chiqarish/kirim uchun ombor amallari (server, DB) — barqaror kod, atomik sarf, kirim (o'rtacha tannarx).
 *
 * BARQAROR KOD (docs/SEX_API.md §2): `Product.productId` va `imei` butun do'kon bo'yicha noyob — har filialdagi
 * nusxa alohida hujjat. Shuning uchun texkarta/kirim/akt `Product.itemCode` ga bog'lanadi (yo'q bo'lsa — `productId`):
 * bir xil tovarning turli filiallardagi hujjatlari bir xil `itemCode` ga ega. Kod birinchi marta texkarta/kirimda
 * o'rnatiladi (`ensureItemCode`), boshqa filialga kirim/ishlab chiqarishda yangi nusxa shu kod bilan yaratiladi.
 *
 * Miqdor kasr bo'lishi mumkin — yangilashlar pipeline + `$round` (lib/stock.ts bilan bir xil qoida).
 */
import type { Model, Types } from 'mongoose';
import type { IProduct, IProductHistory, ProductDoc } from '../models/tenant/Product';
import { availableGteExpr } from '../stock';
import { QTY_DECIMALS, roundQty } from '../qty';
import { generateProductCode, generateSku } from '../productId';
import { isDupKey } from '../posSync';
import { logError } from '../logger';
import { weightedAverageCost } from './calc';

type ProductModel = Model<IProduct>;

/** Oddiy tovar (xizmat/to'plamning o'z qoldig'i yo'q) */
export const GOODS_ONLY = { kind: { $nin: ['service', 'bundle'] } } as const;
/** Kirim qabul qila oladigan holatlar: omborda, tugagan (sotilgan) yoki to'liq berilgan */
export const RECEIVABLE_STATUSES = ['in_stock', 'sold', 'transferred'] as const;

const round = (expr: unknown) => ({ $round: [expr, QTY_DECIMALS] });
const pushHistory = (h: IProductHistory) => ({
  $set: { history: { $concatArrays: [{ $ifNull: ['$history', []] }, [{ $literal: h }]] } },
});

/* ───────────────────────────── barqaror kod ───────────────────────────── */

/** Mahsulotning barqaror kodi: itemCode, yo'q bo'lsa productId (katta harf) */
export function codeOf(p: Pick<IProduct, 'itemCode' | 'productId'>): string | null {
  const c = p.itemCode || p.productId;
  return c ? c.toUpperCase() : null;
}

/** Kod bo'yicha filtr: itemCode, yoki itemCode'i hali yo'q eski hujjatning productId'si */
export function codeFilter(code: string) {
  return { $or: [{ itemCode: code }, { itemCode: { $exists: false }, productId: code }] };
}

/**
 * Mahsulotga barqaror kod o'rnatadi (yo'q bo'lsa): `productId` bo'lsa — o'sha, aks holda yangi PRD-kod.
 * Parallel chaqiruvda birinchi yozilgani qoladi (qayta o'qiladi).
 */
export async function ensureItemCode(Product: ProductModel, p: Pick<ProductDoc, '_id' | 'itemCode' | 'productId'>): Promise<string> {
  if (p.itemCode) return p.itemCode.toUpperCase();
  const code = (p.productId || generateProductCode()).toUpperCase();
  const res = await Product.updateOne({ _id: p._id, itemCode: { $exists: false } }, { $set: { itemCode: code } });
  if (res.modifiedCount === 1) return code;
  const fresh = await Product.findById(p._id, { itemCode: 1 }).lean();
  return (fresh?.itemCode || code).toUpperCase();
}

/**
 * Filialdagi sanaladigan nusxa (kod bo'yicha). `receivable` — kirim uchun (sotilgan/berilgan ham), aks holda faqat
 * omborda. Bir nechta bo'lsa — avval «omborda», keyin eng eski.
 */
export async function findStockDoc(
  Product: ProductModel,
  code: string,
  branchId: Types.ObjectId | string,
  opts: { receivable?: boolean } = {},
): Promise<ProductDoc | null> {
  const base = { branchId, ...GOODS_ONLY, trackQuantity: true, ...codeFilter(code) };
  const inStock = await Product.findOne({ ...base, status: 'in_stock' }).sort({ createdAt: 1 }).lean<ProductDoc>();
  if (inStock || !opts.receivable) return inStock;
  return Product.findOne({ ...base, status: { $in: RECEIVABLE_STATUSES } }).sort({ createdAt: 1 }).lean<ProductDoc>();
}

/* ───────────────────────────── sarf (ishlab chiqarish) ───────────────────────────── */

/**
 * ATOMIK sarf: `quantity − soldQuantity ≥ qty` sharti bilan `quantity` kamayadi (sotuv emas — soldQuantity
 * o'zgarmaydi, hisobotlarda «sotildi» bo'lib ko'rinmaydi). Butun qoldiq ketsa va ilgari sotuv bo'lgan bo'lsa —
 * «sotilgan» holati (lib/stock.ts transferStock bilan bir xil). Natija: o'zgarishdan oldingi hujjat yoki null.
 */
export async function consumeStock(
  Product: ProductModel,
  productId: Types.ObjectId | string,
  branchId: Types.ObjectId | string,
  qty: number,
  history: IProductHistory,
): Promise<ProductDoc | null> {
  qty = roundQty(qty);
  if (!(qty > 0)) return null;
  const before = await Product.findOneAndUpdate(
    { _id: productId, branchId, ...GOODS_ONLY, trackQuantity: true, status: 'in_stock', $expr: availableGteExpr(qty) },
    [{ $set: { quantity: round({ $subtract: ['$quantity', qty] }) } }, pushHistory(history)],
    { new: false },
  ).lean<ProductDoc>();
  if (!before) return null;
  const quantity = roundQty(before.quantity - qty);
  if ((before.soldQuantity ?? 0) > 0 && roundQty(quantity - before.soldQuantity) <= 0) {
    await Product.updateOne({ _id: before._id, quantity, status: 'in_stock' }, { $set: { status: 'sold' } });
  }
  return before;
}

/** Sarfni qaytarish (kompensatsiya): quantity qaytadi, «sotilgan» bo'lib qolgan bo'lsa — omborga */
export async function unconsumeStock(Product: ProductModel, productId: Types.ObjectId | string, qty: number): Promise<void> {
  qty = roundQty(qty);
  await Product.updateOne({ _id: productId }, [
    { $set: { quantity: round({ $add: ['$quantity', qty] }) } },
    { $set: { status: { $cond: [{ $and: [{ $eq: ['$status', 'sold'] }, { $gt: ['$quantity', '$soldQuantity'] }] }, 'in_stock', '$status'] } } },
  ]);
  await Product.updateOne({ _id: productId }, { $pop: { history: 1 } });
}

/* ───────────────────────────── kirim (o'rtacha tannarx) ───────────────────────────── */

export interface ReceiveInput {
  /** Kirim qilinadigan filial */
  branchId: Types.ObjectId | string;
  /** Tanlangan mahsulot (istalgan filialdan) — boshqa filialda bo'lsa, kod bo'yicha nusxa topiladi/yaratiladi */
  template: ProductDoc;
  /** Barqaror kod (ensureItemCode) */
  code: string;
  /** Asosiy birlikda */
  qty: number;
  /** Asosiy birlik tannarxi (kasr bo'lishi mumkin) */
  unitCost: number;
  history: IProductHistory;
  by: string;
  /** Yaroqlilik muddati — eng yaqini saqlanadi (partiyalar keyingi bosqich) */
  expiryDate?: Date | null;
  /** Yangi nusxa yaratilsa: yetkazib beruvchi (kirim aktidan) */
  supplierId?: Types.ObjectId | string | null;
}

export type ReceiveResult =
  | { ok: true; productId: Types.ObjectId; name: string; created: boolean; prevCost: number; newCost: number; undo: () => Promise<void> }
  | { ok: false; reason: 'notCountable' | 'notReceivable' | 'conflict'; name: string };

const isReceivable = (p: Pick<IProduct, 'status'>) => (RECEIVABLE_STATUSES as readonly string[]).includes(p.status);
const isGoods = (p: Pick<IProduct, 'kind'>) => p.kind !== 'service' && p.kind !== 'bundle';

/**
 * Omborga kirim + o'rtacha tortilgan tannarx. Mavjud nusxa: optimistik (quantity/soldQuantity/narx o'zgarmagan
 * bo'lsa) yangilanadi, to'qnashuvda qayta o'qib hisoblanadi (6 marta). Nusxa yo'q — shablondan yangi hujjat
 * (yangi productId/SKU, o'sha `itemCode`, narxlar, birlik, kategoriya). Natijadagi `undo` — kompensatsiya.
 */
export async function receiveStock(Product: ProductModel, input: ReceiveInput): Promise<ReceiveResult> {
  const qty = roundQty(input.qty);
  const t = input.template;
  if (!isGoods(t) || !(qty > 0)) return { ok: false, reason: 'notCountable', name: t.name };

  let target: ProductDoc | null = null;
  if (String(t.branchId) === String(input.branchId)) {
    if (!t.trackQuantity) return { ok: false, reason: 'notCountable', name: t.name };
    target = t;
  } else {
    target = await findStockDoc(Product, input.code, input.branchId, { receivable: true });
    // Shtrix-kod bir xil, kodi hali yo'q nusxa — bog'lanadi (bir xil tovar)
    if (!target && t.barcode) {
      const byBarcode = await Product.findOne({
        branchId: input.branchId, ...GOODS_ONLY, trackQuantity: true, barcode: t.barcode,
        itemCode: { $exists: false }, status: { $in: RECEIVABLE_STATUSES },
      }).sort({ createdAt: 1 }).lean<ProductDoc>();
      if (byBarcode) {
        await Product.updateOne({ _id: byBarcode._id, itemCode: { $exists: false } }, { $set: { itemCode: input.code } });
        target = byBarcode;
      }
    }
  }

  if (!target) return createCopy(Product, input, qty);

  for (let attempt = 0; attempt < 6; attempt++) {
    const fresh = await Product.findById(target._id).lean<ProductDoc>();
    if (!fresh || !isGoods(fresh) || !fresh.trackQuantity) return { ok: false, reason: 'notCountable', name: target.name };
    if (!isReceivable(fresh)) return { ok: false, reason: 'notReceivable', name: fresh.name };
    const available = Math.max(0, roundQty((fresh.quantity ?? 0) - (fresh.soldQuantity ?? 0)));
    const prevCost = fresh.purchasePrice ?? 0;
    const newCost = weightedAverageCost(available, prevCost, qty, input.unitCost);
    const expiry = input.expiryDate && (!fresh.expiryDate || input.expiryDate < new Date(fresh.expiryDate)) ? input.expiryDate : null;
    const res = await Product.updateOne(
      { _id: fresh._id, quantity: fresh.quantity, soldQuantity: fresh.soldQuantity, purchasePrice: fresh.purchasePrice, status: fresh.status },
      {
        $set: {
          quantity: roundQty((fresh.quantity ?? 0) + qty),
          purchasePrice: newCost,
          status: 'in_stock',
          ...(expiry ? { expiryDate: expiry } : {}),
        },
        $push: { history: input.history },
      },
    );
    if (res.modifiedCount === 1) {
      const prevStatus = fresh.status;
      const id = fresh._id;
      return {
        ok: true, productId: id, name: fresh.name, created: false, prevCost, newCost,
        undo: async () => {
          await Product.updateOne({ _id: id }, [
            { $set: { quantity: { $max: ['$soldQuantity', round({ $subtract: ['$quantity', qty] })] } } },
            {
              $set: {
                purchasePrice: { $cond: [{ $eq: ['$purchasePrice', newCost] }, prevCost, '$purchasePrice'] },
                status: prevStatus === 'in_stock'
                  ? '$status'
                  : { $cond: [{ $lte: ['$quantity', '$soldQuantity'] }, prevStatus, '$status'] },
              },
            },
          ]);
          await Product.updateOne({ _id: id }, { $pop: { history: 1 } });
        },
      };
    }
  }
  return { ok: false, reason: 'conflict', name: target.name };
}

/** Filialda nusxa yo'q — shablondan yangi hujjat (yangi productId/SKU, o'sha barqaror kod) */
async function createCopy(Product: ProductModel, input: ReceiveInput, qty: number): Promise<ReceiveResult> {
  const t = input.template;
  const cost = Math.round(Math.max(0, input.unitCost));
  const doc: Partial<IProduct> = {
    kind: 'goods',
    name: t.name,
    imei: generateSku(),
    barcode: t.barcode || undefined,
    brand: t.brand || undefined,
    color: t.color || undefined,
    size: t.size || undefined,
    category: t.category || undefined,
    categoryId: t.categoryId || undefined,
    unit: t.unit || undefined,
    ikpu: t.ikpu || undefined,
    photoUrl: t.photoUrl || undefined,
    extraFields: t.extraFields?.length ? t.extraFields : undefined,
    purchasePrice: cost,
    salePrice: t.salePrice ?? 0,
    wholesalePrice: t.wholesalePrice || undefined,
    trackQuantity: true,
    quantity: qty,
    soldQuantity: 0,
    status: 'in_stock',
    branchId: input.branchId as Types.ObjectId,
    itemCode: input.code,
    purchaseUnit: t.purchaseUnit || undefined,
    purchaseFactor: t.purchaseFactor || undefined,
    expiryDate: input.expiryDate || undefined,
    supplierId: (input.supplierId as Types.ObjectId | undefined) || t.supplierId || undefined,
    createdBy: input.by,
    history: [{ ...input.history, action: 'created' }],
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const created = await Product.create({ ...doc, productId: generateProductCode() });
      const id = created._id as Types.ObjectId;
      return {
        ok: true, productId: id, name: t.name, created: true, prevCost: 0, newCost: cost,
        undo: async () => {
          // Faqat hali sotilmagan bo'lsa (kompensatsiya millisekundlar ichida)
          await Product.deleteOne({ _id: id, soldQuantity: 0 }).catch((e) => logError('production createCopy undo', e));
        },
      };
    } catch (e) {
      if (!isDupKey(e)) throw e;
    }
  }
  return { ok: false, reason: 'conflict', name: t.name };
}
