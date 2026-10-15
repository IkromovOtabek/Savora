import type { Model, Types } from 'mongoose';
import type { IProduct, IProductHistory } from './models/tenant/Product';

type ProductModel = Model<IProduct>;

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

  // 1) Sanaladigan mahsulot
  const tracked = await Product.findOneAndUpdate(
    {
      _id: productId,
      ...(opts.scope ?? {}),
      status: 'in_stock',
      trackQuantity: true,
      $expr: { $gte: [{ $subtract: ['$quantity', '$soldQuantity'] }, qty] },
    },
    { $inc: { soldQuantity: qty }, ...(opts.set ? { $set: opts.set } : {}), ...push },
    { new: true }
  ).lean<IProduct & { _id: Types.ObjectId }>();
  if (tracked) {
    if (tracked.soldQuantity >= tracked.quantity) {
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
  if (qty !== 1) return null;
  return Product.findOneAndUpdate(
    { _id: productId, ...(opts.scope ?? {}), status: 'in_stock', trackQuantity: { $ne: true } },
    { $set: { status: 'sold', soldAt: now, ...(opts.set ?? {}) }, ...push },
    { new: true }
  ).lean<IProduct & { _id: Types.ObjectId }>();
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
    status: 'in_stock',
    branchId: { $ne: toBranchId },
  };

  if (opts.trackQuantity) {
    const before = await Product.findOneAndUpdate(
      {
        ...base,
        trackQuantity: true,
        $expr: { $gte: [{ $subtract: ['$quantity', '$soldQuantity'] }, qty] },
      },
      { $inc: { quantity: -qty }, $push: { history: opts.history } },
      { new: false }
    ).lean<IProduct & { _id: Types.ObjectId }>();
    if (!before) return null;
    const quantity = before.quantity - qty;
    if (quantity - before.soldQuantity <= 0) {
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
  const tracked = await Product.updateOne({ _id: productId, trackQuantity: true }, [
    { $set: { soldQuantity: { $max: [0, { $subtract: ['$soldQuantity', qty] }] } } },
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
    ...(history ? [{ $set: { history: { $concatArrays: [{ $ifNull: ['$history', []] }, [history]] } } }] : []),
  ]);
  if (tracked.matchedCount > 0) return;

  await Product.updateOne(
    { _id: productId, trackQuantity: { $ne: true }, status: 'sold' },
    { $set: { status: 'in_stock' }, $unset: { soldAt: '' }, ...(history ? { $push: { history } } : {}) }
  );
}
