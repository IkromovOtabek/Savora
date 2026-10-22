import type { Model, Types } from 'mongoose';
import type { IProduct, IProductHistory } from './models/tenant/Product';
import { QTY_DECIMALS, roundQty } from './qty';

type ProductModel = Model<IProduct>;
type ProductDoc = IProduct & { _id: Types.ObjectId };

/** Oddiy tovar (eski yozuvlarda `kind` yo'q — $nin ularga ham mos) */
const GOODS_ONLY = { kind: { $nin: ['service', 'bundle'] } };

/*
 * Miqdor kasr bo'lishi mumkin (kg, m…), shuning uchun atomik yangilashlar `$inc` emas,
 * pipeline update + `$round` (3 xona) bilan — 0.1 + 0.2 kabi float qoldiqlari bazada
 * to'planmaydi va oxirgi 1.1 kg "yetarli emas" deb rad etilmaydi. Butun sonlarda natija o'zgarmaydi.
 */
const roundExpr = (expr: unknown) => ({ $round: [expr, QTY_DECIMALS] });
/** Qoldiq (quantity − soldQuantity) ≥ qty sharti */
export const availableGteExpr = (qty: number) => ({
  $gte: [roundExpr({ $subtract: ['$quantity', '$soldQuantity'] }), qty],
});
/** Pipeline $set da qiymatlar maydon yo'li ("$…") deb talqin qilinmasin */
const literalSet = (set: Record<string, unknown> = {}) =>
  Object.fromEntries(Object.entries(set).map(([k, v]) => [k, { $literal: v }]));
const pushHistoryStage = (history?: IProductHistory) =>
  history ? [{ $set: { history: { $concatArrays: [{ $ifNull: ['$history', []] }, [{ $literal: history }]] } } }] : [];

/** Sotuvda soldQuantity'ni oshiruvchi pipeline (lib/stock testlari shu shaklni tekshiradi) */
export function reservePipeline(qty: number, set?: Record<string, unknown>, history?: IProductHistory) {
  return [
    { $set: { soldQuantity: roundExpr({ $add: ['$soldQuantity', qty] }), ...literalSet(set) } },
    ...pushHistoryStage(history),
  ];
}

/**
 * Ombordan ATOMIK ayirish (sotuv). Tekshiruv va yozuv bitta `findOneAndUpdate` da —
 * ikki kassir bir vaqtda oxirgi donani sota olmaydi (oldin: o'qish → tekshirish → save).
 *
 *  - trackQuantity: `quantity - soldQuantity >= qty` sharti bilan `$inc soldQuantity`
 *  - yagona mahsulot: `status: 'in_stock'` sharti bilan `status: 'sold'`
 *
 * @param scope  qo'shimcha filtr (masalan branchFilter(user))
 * @returns yangilangan mahsulot yoki null (qoldiq yetarli emas / allaqachon sotilgan)
 */
export async function reserveStock(
  Product: ProductModel,
  productId: string | Types.ObjectId,
  qty: number,
  opts: {
    scope?: Record<string, unknown>;
    set?: Record<string, unknown>;
    history?: IProductHistory;
  } = {}
): Promise<(IProduct & { _id: Types.ObjectId }) | null> {
  const now = new Date();
  const push = opts.history ? { $push: { history: opts.history } } : {};
  qty = roundQty(qty);
  if (!(qty > 0)) return null;

  // 1) Sanaladigan mahsulot
  const tracked = await Product.findOneAndUpdate(
    {
      _id: productId,
      ...(opts.scope ?? {}),
      ...GOODS_ONLY,
      status: 'in_stock',
      trackQuantity: true,
      $expr: availableGteExpr(qty),
    },
    reservePipeline(qty, opts.set, opts.history),
    { new: true }
  ).lean<IProduct & { _id: Types.ObjectId }>();
  if (tracked) {
    if (roundQty(tracked.soldQuantity - tracked.quantity) >= 0) {
      await Product.updateOne(
        { _id: tracked._id, $expr: { $gte: ['$soldQuantity', '$quantity'] } },
        { $set: { status: 'sold', soldAt: now } }
      );
      tracked.status = 'sold';
      tracked.soldAt = now;
    }
    return tracked;
  }

  // 2) Yagona mahsulot (IMEI va h.k.) — faqat 1 dona
  if (qty === 1) {
    const single = await Product.findOneAndUpdate(
      { _id: productId, ...(opts.scope ?? {}), ...GOODS_ONLY, status: 'in_stock', trackQuantity: { $ne: true } },
      { $set: { status: 'sold', soldAt: now, ...(opts.set ?? {}) }, ...push },
      { new: true }
    ).lean<ProductDoc>();
    if (single) return single;
  }

  // 3) Xizmat yoki to'plam — o'z qoldig'i yo'q, holati o'zgarmaydi (doim sotuvda)
  const head = await Product.findOne(
    { _id: productId, ...(opts.scope ?? {}), status: 'in_stock', kind: { $in: ['service', 'bundle'] } },
    { kind: 1, bundleItems: 1, branchId: 1, name: 1 }
  ).lean<ProductDoc>();
  if (!head) return null;

  if (head.kind === 'bundle') {
    const items = head.bundleItems ?? [];
    if (!items.length) return null;
    // Tarkib birma-bir atomik ayriladi; bittasi yetmasa — oldingilari qaytariladi (hammasi yoki hech biri)
    const taken: { id: Types.ObjectId; qty: number }[] = [];
    for (const it of items) {
      const need = roundQty(it.qty * qty);
      const part = await reserveStock(Product, it.productId, need, {
        scope: { branchId: head.branchId, ...GOODS_ONLY },
        history: opts.history ? { ...opts.history, detail: `To'plam «${head.name}» × ${qty}` } : undefined,
      });
      if (!part) {
        for (const t of taken) await releaseStock(Product, t.id, t.qty);
        return null;
      }
      taken.push({ id: it.productId, qty: need });
    }
  }

  // Narx/to'lov turi kabi `set` qo'llanadi, lekin status/soldAt emas
  return Product.findOneAndUpdate(
    { _id: head._id },
    { ...(opts.set ? { $set: opts.set } : {}), ...push },
    { new: true }
  ).lean<ProductDoc>();
}

/**
 * Boshqa filialga berish — ATOMIK (qoldiq sharti + yozuv bitta so'rovda).
 *  - trackQuantity: `quantity` dan `qty` ayriladi (hammasi berilsa status → transferred)
 *  - yagona mahsulot: `branchId` maqsad filialga o'zgaradi
 * @returns { product (o'zgarishdan oldingi), fromBranchId } yoki null
 */
export async function transferStock(
  Product: ProductModel,
  productId: string | Types.ObjectId,
  toBranchId: Types.ObjectId,
  qty: number,
  opts: { scope?: Record<string, unknown>; trackQuantity: boolean; history: IProductHistory }
): Promise<{ product: IProduct & { _id: Types.ObjectId }; fromBranchId: Types.ObjectId } | null> {
  const base = {
    _id: productId,
    ...(opts.scope ?? {}),
    // Xizmat/to'plamning ko'chiriladigan qoldig'i yo'q
    ...GOODS_ONLY,
    status: 'in_stock',
    branchId: { $ne: toBranchId },
  };

  if (opts.trackQuantity) {
    qty = roundQty(qty);
    if (!(qty > 0)) return null;
    const before = await Product.findOneAndUpdate(
      {
        ...base,
        trackQuantity: true,
        $expr: availableGteExpr(qty),
      },
      [
        { $set: { quantity: roundExpr({ $subtract: ['$quantity', qty] }) } },
        ...pushHistoryStage(opts.history),
      ],
      { new: false }
    ).lean<IProduct & { _id: Types.ObjectId }>();
    if (!before) return null;
    const quantity = roundQty(before.quantity - qty);
    if (roundQty(quantity - before.soldQuantity) <= 0) {
      const status = before.soldQuantity > 0
        ? (before.soldQuantity >= quantity ? 'sold' : 'in_stock')
        : 'transferred';
      await Product.updateOne({ _id: before._id, quantity, status: 'in_stock' }, { $set: { status } });
    }
    return { product: before, fromBranchId: before.branchId };
  }

  if (qty !== 1) return null;
  const before = await Product.findOneAndUpdate(
    { ...base, trackQuantity: { $ne: true } },
    { $set: { branchId: toBranchId }, $push: { history: opts.history } },
    { new: false }
  ).lean<IProduct & { _id: Types.ObjectId }>();
  if (!before) return null;
  return { product: before, fromBranchId: before.branchId };
}

/**
 * Sotuv bekor qilinganda/xatoda omborga qaytarish (atomik, manfiyga tushmaydi).
 * trackQuantity mahsulotda soldQuantity kamayadi va status qayta hisoblanadi.
 */
export async function releaseStock(
  Product: ProductModel,
  productId: string | Types.ObjectId,
  qty: number,
  history?: IProductHistory
): Promise<void> {
  qty = roundQty(qty);
  const tracked = await Product.updateOne({ _id: productId, trackQuantity: true }, [
    { $set: { soldQuantity: { $max: [0, roundExpr({ $subtract: ['$soldQuantity', qty] })] } } },
    {
      $set: {
        status: {
          $cond: [
            { $in: ['$status', ['in_stock', 'sold', 'transferred']] },
            { $cond: [{ $gte: ['$soldQuantity', '$quantity'] }, 'sold', 'in_stock'] },
            '$status',
          ],
        },
      },
    },
    ...pushHistoryStage(history),
  ]);
  if (tracked.matchedCount > 0) return;

  const single = await Product.updateOne(
    { _id: productId, ...GOODS_ONLY, trackQuantity: { $ne: true }, status: 'sold' },
    { $set: { status: 'in_stock' }, $unset: { soldAt: '' }, ...(history ? { $push: { history } } : {}) }
  );
  if (single.matchedCount > 0) return;

  // Xizmat — omborga hech narsa qaytmaydi; to'plam — tarkibidagi tovarlar qaytadi
  const head = await Product.findOne({ _id: productId, kind: { $in: ['service', 'bundle'] } }, { kind: 1, bundleItems: 1, name: 1 })
    .setOptions({ withDeleted: true })
    .lean<ProductDoc>();
  if (!head) return;
  if (head.kind === 'bundle') {
    for (const it of head.bundleItems ?? []) {
      await releaseStock(Product, it.productId, roundQty(it.qty * qty), history ? { ...history, detail: `To'plam «${head.name}» × ${qty}` } : undefined);
    }
  }
  if (history) await Product.updateOne({ _id: head._id }, { $push: { history } });
}
