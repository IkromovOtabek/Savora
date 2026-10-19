import { getTenantAdminSession } from '@/lib/tenantSession';
import { lineFromProduct } from '@/lib/inventoryFlow';
import KirimChiqimCards, { BranchFlowCard } from '@/components/tenant/KirimChiqimCards';
import { getDict } from '@/lib/i18n/server';
import { plural, tr } from '@/lib/i18n/fmt';
import { priceTimesQty } from '@/lib/qty';
import { addQtyByUnit, mergeQtyByUnit } from '@/lib/unitTotals';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.sales.kirimChiqim.metaTitle };
}

export default async function KirimChiqimPage() {
  const { Product, Branch, Sale } = await getTenantAdminSession();
  const d = await getDict();
  const k = d.sales.kirimChiqim;
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
      kirimValue: 0, kirimQty: {}, chiqimValue: 0, chiqimQty: {}, foyda: 0,
    });
  }

  // Kirim (ombordagi) — mahsulot qoldig'idan
  for (const p of products) {
    const card = map.get(String(p.branchId));
    if (!card) continue;
    const stock = lineFromProduct(p, card.name, 'stock');
    if (stock) { card.kirimValue += stock.cost; addQtyByUnit(card.kirimQty, stock.qty, stock.unit); }
  }

  // Chiqim (sotilgan) — Sotuv yozuvlaridan (Sotildi sahifasi bilan bir manba)
  for (const s of sales) {
    const card = map.get(String(s.branchId));
    if (!card) continue;
    const qty = s.productSnapshot?.saleQuantity ?? 1;
    const cost = priceTimesQty(s.productSnapshot?.purchasePrice ?? 0, qty);
    card.chiqimValue += s.totalAmount ?? 0;
    addQtyByUnit(card.chiqimQty, qty, s.productSnapshot?.unit);
    card.foyda += (s.totalAmount ?? 0) - cost;
  }

  const cards = [...map.values()];
  const total: BranchFlowCard = {
    id: 'all', name: k.totalAll,
    kirimValue: cards.reduce((s, c) => s + c.kirimValue, 0),
    kirimQty: mergeQtyByUnit(cards.map((c) => c.kirimQty)),
    chiqimValue: cards.reduce((s, c) => s + c.chiqimValue, 0),
    chiqimQty: mergeQtyByUnit(cards.map((c) => c.chiqimQty)),
    foyda: cards.reduce((s, c) => s + c.foyda, 0),
  };

  return (
    <>
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">{k.title}</h1>
          <p className="t-page-sub">{tr(k.sub, { branches: tr(plural(branches.length, d.sales.nBranches), { n: branches.length }) })}</p>
        </div>
      </div>
      <KirimChiqimCards total={total} cards={cards} />
    </>
  );
}
