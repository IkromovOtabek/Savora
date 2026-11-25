import Link from 'next/link';
import { getTenantSession } from '@/lib/tenantSession';
import Icon from '@/components/icons/Icon';
import { isBranchScoped } from '@/lib/branchScope';
import { userCan } from '@/lib/permissionGuard';
import { branchCashOf, loadBranchCash } from '@/lib/branchCash';
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
  const scoped = isBranchScoped(user);
  const branches = scoped ? allBranches.filter((b) => String(b._id) === user.branchId) : allBranches;

  // Naqd kassa qoldig'i — yagona formula (lib/branchCash, Moliya → Hisoblar holati bilan bir xil):
  // naqd to'lovlar − qaytarish + bankdan olingan + filial kirimi − filial chiqimi
  const cashRes = await loadBranchCash({ Sale, CashFlow, BankReceipt }, scoped ? branches.map((b) => String(b._id)) : undefined);
  // Xarajat qo'shish — do'kon egasi («Kirim-Chiqim» moduli); kassa «Chiqim» summasiga ham kiradi.
  // Filial xodimi — «Xarajat yozish» huquqi bilan, o'z filiali kassasidan (lib/branchExpense)
  const branchExpense = scoped && features.kirimChiqim && (await userCan(user, 'kassa.expense'));
  const canExpense = (user.role === 'admin' && features.kirimChiqim) || branchExpense;
  const expenseCategories = canExpense ? await loadExpenseCategories(FinanceCategory) : [];

  // Kartada: «Naqd kirim» — naqd to'lovlar + kassaga kiritilgan pul; «Kassadan chiqim» — xarajat, olingan, qaytarilgan
  const cards: KassaCard[] = branches.map((b) => {
    const c = branchCashOf(cashRes, String(b._id));
    return { id: String(b._id), name: b.name, naxtSotuv: c.cashSales + c.income, bankOlgan: c.bankIn, adminOlgan: c.expense, qolgan: c.cash };
  });
  const sum = (f: (c: KassaCard) => number) => cards.reduce((a, c) => a + f(c), 0);
  // Egasi — filialsiz eski kirim/chiqim va bank tushumlari ham jamida; filial login — faqat o'z filiali
  const un = scoped ? { income: 0, expense: 0, bankIn: 0 } : cashRes.unbranched;
  const total: KassaCard = {
    id: 'all',
    // Filial login bitta filialni ko'radi — "barcha filiallar" deyish noto'g'ri
    name: scoped ? k.yourBranchKassa : k.totalAllBranches,
    naxtSotuv: sum((c) => c.naxtSotuv) + un.income,
    bankOlgan: sum((c) => c.bankOlgan ?? 0) + un.bankIn,
    adminOlgan: sum((c) => c.adminOlgan) + un.expense,
    qolgan: sum((c) => c.qolgan) + un.income + un.bankIn - un.expense,
  };
  const bankTotal = total.bankOlgan ?? 0;

  return (
    <>
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">{k.title}</h1>
          <p className="t-page-sub">
            {tr(k.sub, { scope: scoped ? k.yourBranch : tr(plural(branches.length, d.sales.nBranches), { n: branches.length }) })}
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
              mode={branchExpense ? 'branch' : 'owner'}
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
