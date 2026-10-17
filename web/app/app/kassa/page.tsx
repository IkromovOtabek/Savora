import Link from 'next/link';
import { getTenantSession } from '@/lib/tenantSession';
import Icon from '@/components/icons/Icon';
import { isBranchScoped } from '@/lib/branchScope';
import NaxtKassaCards, { KassaCard } from '@/components/tenant/NaxtKassaCards';
import { getDict } from '@/lib/i18n/server';
import { plural, tr } from '@/lib/i18n/fmt';
import '@/components/tenant/styles/finance.css';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.sales.kassa.metaTitle };
}

export default async function KassaPage() {
  const { user, Sale, Branch, CashFlow } = await getTenantSession();
  const d = await getDict();
  const k = d.sales.kassa;

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
    // Filial login bitta filialni ko'radi — "barcha filiallar" deyish noto'g'ri
    name: isBranchScoped(user) ? k.yourBranchKassa : k.totalAllBranches,
    naxtSotuv: naxtSotuvTotal,
    adminOlgan: adminTotal,
    qolgan: naxtSotuvTotal - adminTotal,
  };

  return (
    <>
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">{k.title}</h1>
          <p className="t-page-sub">
            {tr(k.sub, { scope: isBranchScoped(user) ? k.yourBranch : tr(plural(branches.length, d.sales.nBranches), { n: branches.length }) })}
          </p>
        </div>
      </div>
      <NaxtKassaCards total={total} cards={cards} />
      {/* Kompyuterda yuqori paneldagi "Yangi sotuv" yetarli; telefonda — pastki o'ng tugma */}
      <Link href="/app/sales/new" className="ux-fab">
        <Icon name="plus" size={20} /> {d.common.sale}
      </Link>
    </>
  );
}
