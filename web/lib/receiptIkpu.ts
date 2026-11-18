import type { Model } from 'mongoose';
import type { IProduct } from './models/tenant/Product';

type SaleLike = { productId?: unknown; productSnapshot: { ikpu?: string | null } };

/**
 * Chek uchun MXIK (sotuvlar tartibida): sotuvda saqlangan (productSnapshot.ikpu — kassa sotuvi) bo'lmasa —
 * mahsulotning joriy MXIK'i. O'chirilgan mahsulot ham o'qiladi (eski chek). Kiritilmagan bo'lsa — undefined.
 */
export async function saleIkpuList(Product: Model<IProduct>, sales: readonly SaleLike[]): Promise<(string | undefined)[]> {
  const ids = [...new Set(sales.filter((s) => !s.productSnapshot.ikpu && s.productId).map((s) => String(s.productId)))];
  const found = ids.length
    ? await Product.find({ _id: { $in: ids }, ikpu: { $nin: [null, ''] } }, { ikpu: 1 }).setOptions({ withDeleted: true }).lean()
    : [];
  const byId = new Map(found.map((p) => [String(p._id), p.ikpu as string]));
  return sales.map((s) => s.productSnapshot.ikpu || (s.productId ? byId.get(String(s.productId)) : undefined));
}

/** Ichki chek sahifalari uchun: productSnapshot.ikpu to'ldirilgan nusxa (bazadagi Sale o'zgarmaydi) */
export async function withSaleIkpu<T extends SaleLike>(Product: Model<IProduct>, sales: T[]): Promise<T[]> {
  const list = await saleIkpuList(Product, sales);
  return sales.map((s, i) => (list[i] && !s.productSnapshot.ikpu ? { ...s, productSnapshot: { ...s.productSnapshot, ikpu: list[i] } } : s));
}
