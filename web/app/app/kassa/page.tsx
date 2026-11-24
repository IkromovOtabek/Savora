import Link from 'next/link';
import { getTenantSession } from '@/lib/tenantSession';
import Icon from '@/components/icons/Icon';
import { isBranchScoped } from '@/lib/branchScope';
import { KASSA_SALE_FILTER } from '@/lib/kassa';
import NaxtKassaCards, { KassaCard } from '@/components/tenant/NaxtKassaCards';
import QuickExpense from '@/components/tenant/QuickExpense';
import { loadExpenseCategories } from '@/lib/financeCategories';
import { getDict } from '@/lib/i18n/server';
import { plural, tr } from '@/lib/i18n/fmt';
import '@/components/tenant/styles/finance.css';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.sales.kassa.metaTitle };
}

export default async function KassaPage() {
  const { user, Sale, Branch, CashFlow, BankReceipt, FinanceCategory, features } = await getTenantSession();
  const d = await getDict();
  const k = d.sales.kassa;

  const allBranches = await Branch.find({ active: true }).sort({ createdAt: 1 }).lean();
  // Filial login — faqat o'z filiali kassasi
  const branches = isBranchScoped(user)
    ? allBranches.filter((b) => String(b._id) === user.branchId)
    : allBranches;
  const branchIds = branches.map((b) => b._id);

  const [sales, expenseAgg, bankAgg] = await Promise.all([
    // Bekor qilingan (yangi tartib) sotuv to'lovi — realizatsiya; qaytarilgani CashFlow chiqimida (lib/kassa)
    Sale.find({ ...KASSA_SALE_FILTER, branchId: { $in: branchIds } }).limit(5000).lean(),
    CashFlow.aggregate([{ $match: { type: 'expense' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    // Kredit kassada «Bankdan pul olindi» — naqd kassaga qo'shiladi (filial bo'yicha; eski yozuvlar filialsiz)
    BankReceipt.aggregate<{ _id: unknown; total: number }>([{ $group: { _id: '$branchId', total: { $sum: '$amount' } } }]),
  ]);
  const bankByBranch = new Map(bankAgg.map((x) => [x._id ? String(x._id) : '', x.total]));
  const adminTotal = expenseAgg[0]?.total ?? 0;
  // Xarajat qo'shish — do'kon egasi («Kirim-Chiqim» moduli); kassa «Chiqim» summasiga ham kiradi
  const canExpense = user.role === 'admin' && features.kirimChiqim;
  const expenseCategories = canExpense ? await loadExpenseCategories(FinanceCategory) : [];

  // Filial bo'yicha naqd tushum
  const map = new Map<string, KassaCard>();
  for (const b of branches) {
    map.set(String(b._id), { id: String(b._id), name: b.name, naxtSotuv: 0, bankOlgan: bankByBranch.get(String(b._id)) ?? 0, adminOlgan: 0, qolgan: 0 });
  }

  for (const s of sales) {
    const card = map.get(String(s.branchId));
    if (!card) continue;
    // Naqd qo'lga olingan pul: naqd sotuv to'liq, boshqa turlarda bosh to'lov (paidAmount)
    const cashReceived = s.paymentType === 'cash' ? (s.totalAmount ?? 0) : (s.paidAmount ?? 0);
    card.naxtSotuv += cashReceived;
  }

  const cards = [...map.values()];
  for (const c of cards) c.qolgan = c.naxtSotuv + (c.bankOlgan ?? 0) - c.adminOlgan;

  const naxtSotuvTotal = cards.reduce((s, c) => s + c.naxtSotuv, 0);
  // Filial login — faqat o'z filiali; egasi — filialsiz eski tushumlar ham jamida
  const bankTotal = isBranchScoped(user)
    ? cards.reduce((s, c) => s + (c.bankOlgan ?? 0), 0)
    : bankAgg.reduce((s, x) => s + x.total, 0);
  const total: KassaCard = {
    id: 'all',
    // Filial login bitta filialni ko'radi — "barcha filiallar" deyish noto'g'ri
    name: isBranchScoped(user) ? k.yourBranchKassa : k.totalAllBranches,
    naxtSotuv: naxtSotuvTotal,
    bankOlgan: bankTotal,
    adminOlgan: adminTotal,
    qolgan: naxtSotuvTotal + bankTotal - adminTotal,
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
        <div className="t-page-actions">
          {/* Kunlik kirim-chiqim: tanlangan kundagi barcha pul harakati (filial login — o'z filiali) */}
          <Link href="/app/kassa/kunlik" className="btn btn-ghost btn-with-icon">
            <Icon name="history" size={16} /> {k.flowBtn}
          </Link>
          {canExpense && (
            <QuickExpense
              variant="button"
              categories={expenseCategories}
              branches={allBranches.map((b) => ({ id: String(b._id), name: b.name }))}
            />
          )}
        </div>
      </div>
      <NaxtKassaCards
        total={total}
        cards={cards}
        // Jami / Naqd / Kredit filtri: Kredit kassa yoqiq yoki bankdan pul olingan bo'lsa
        hasCredit={features.creditKassa || bankTotal > 0}
        creditHref={user.role === 'admin' && features.creditKassa ? '/app/kredit-kassa' : undefined}
      />
      {/* Kompyuterda yuqori paneldagi "Yangi sotuv" yetarli; telefonda — pastki o'ng tugma */}
      <Link href="/app/pos" className="ux-fab">
        <Icon name="plus" size={20} /> {d.common.sale}
      </Link>
    </>
  );
}
