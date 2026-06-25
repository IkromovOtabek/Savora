import { getTenantAdminSession } from '@/lib/tenantSession';
import { lineFromProduct } from '@/lib/inventoryFlow';
import KirimChiqimCards, { BranchFlowCard } from '@/components/tenant/KirimChiqimCards';

export const metadata = { title: 'Kirim-Chiqim — Savora' };

export default async function KirimChiqimPage() {
  const { Product, Branch, Sale } = await getTenantAdminSession();
  const branches = await Branch.find({ active: true }).sort({ createdAt: 1 }).lean();
  const branchIds = branches.map((b) => b._id);

  const [products, sales] = await Promise.all([
    Product.find({ branchId: { $in: branchIds } }).limit(5000).lean(),
    Sale.find({ status: { $ne: 'cancelled' }, branchId: { $in: branchIds } }).limit(5000).lean(),
  ]);

  // Filial bo'yicha agregatsiya
  const map = new Map<string, BranchFlowCard>();
  for (const b of branches) {
    map.set(String(b._id), {
      id: String(b._id), name: b.name,
      kirimValue: 0, kirimCount: 0, chiqimValue: 0, chiqimCount: 0, foyda: 0,
    });
  }

  // Kirim (ombordagi) — mahsulot qoldig'idan
  for (const p of products) {
    const card = map.get(String(p.branchId));
    if (!card) continue;
    const stock = lineFromProduct(p, card.name, 'stock');
    if (stock) { card.kirimValue += stock.cost; card.kirimCount += stock.qty; }
  }

  // Chiqim (sotilgan) — Sotuv yozuvlaridan (Sotildi sahifasi bilan bir manba)
  for (const s of sales) {
    const card = map.get(String(s.branchId));
    if (!card) continue;
    const qty = s.productSnapshot?.saleQuantity ?? 1;
    const cost = (s.productSnapshot?.purchasePrice ?? 0) * qty;
    card.chiqimValue += s.totalAmount ?? 0;
    card.chiqimCount += qty;
    card.foyda += (s.totalAmount ?? 0) - cost;
  }

  const cards = [...map.values()];
  const total: BranchFlowCard = {
    id: 'all', name: 'JAMI (BARCHA FILIALLAR)',
    kirimValue: cards.reduce((s, c) => s + c.kirimValue, 0),
    kirimCount: cards.reduce((s, c) => s + c.kirimCount, 0),
    chiqimValue: cards.reduce((s, c) => s + c.chiqimValue, 0),
    chiqimCount: cards.reduce((s, c) => s + c.chiqimCount, 0),
    foyda: cards.reduce((s, c) => s + c.foyda, 0),
  };

  return (
    <>
      <KirimChiqimCards total={total} cards={cards} />
    </>
  );
}
