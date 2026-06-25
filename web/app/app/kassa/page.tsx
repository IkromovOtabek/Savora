import { getTenantSession } from '@/lib/tenantSession';
import { isBranchScoped } from '@/lib/branchScope';
import NaxtKassaCards, { KassaCard } from '@/components/tenant/NaxtKassaCards';

export const metadata = { title: 'Naxt kassa — Savora' };

export default async function KassaPage() {
  const { user, Sale, Branch, CashFlow } = await getTenantSession();

  const allBranches = await Branch.find({ active: true }).sort({ createdAt: 1 }).lean();
  // Filial login — faqat o'z filiali kassasi
  const branches = isBranchScoped(user)
    ? allBranches.filter((b) => String(b._id) === user.branchId)
    : allBranches;
  const branchIds = branches.map((b) => b._id);

  const [sales, expenseAgg] = await Promise.all([
    Sale.find({ status: { $ne: 'cancelled' }, branchId: { $in: branchIds } }).limit(5000).lean(),
    CashFlow.aggregate([{ $match: { type: 'expense' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
  ]);
  const adminTotal = expenseAgg[0]?.total ?? 0;

  // Filial bo'yicha naqd tushum
  const map = new Map<string, KassaCard>();
  for (const b of branches) {
    map.set(String(b._id), { id: String(b._id), name: b.name, naxtSotuv: 0, adminOlgan: 0, qolgan: 0 });
  }

  for (const s of sales) {
    const card = map.get(String(s.branchId));
    if (!card) continue;
    // Naqd qo'lga olingan pul: naqd sotuv to'liq, boshqa turlarda bosh to'lov (paidAmount)
    const cashReceived = s.paymentType === 'cash' ? (s.totalAmount ?? 0) : (s.paidAmount ?? 0);
    card.naxtSotuv += cashReceived;
  }

  const cards = [...map.values()];
  for (const c of cards) c.qolgan = c.naxtSotuv - c.adminOlgan;

  const naxtSotuvTotal = cards.reduce((s, c) => s + c.naxtSotuv, 0);
  const total: KassaCard = {
    id: 'all',
    name: 'JAMI (BARCHA FILIALLAR)',
    naxtSotuv: naxtSotuvTotal,
    adminOlgan: adminTotal,
    qolgan: naxtSotuvTotal - adminTotal,
  };

  return <NaxtKassaCards total={total} cards={cards} />;
}
