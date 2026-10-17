import { getTenantAdminSession } from '@/lib/tenantSession';
import CreditKassaPanel from '@/components/tenant/CreditKassaPanel';
import { getDict } from '@/lib/i18n/server';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.sales.creditKassa.metaTitle };
}

export default async function CreditKassaPage() {
  const { CreditBank, Sale } = await getTenantAdminSession();
  const d = await getDict();
  const banks = await CreditBank.find().sort({ name: 1 }).lean();

  const creditSales = await Sale.find({
    paymentType: 'bank_credit',
    status: { $ne: 'cancelled' },
  }).lean();

  const statsMap = new Map<string, { balance: number; count: number }>();
  for (const s of creditSales) {
    const name = s.bankName?.trim();
    if (!name) continue;
    const cur = statsMap.get(name) ?? { balance: 0, count: 0 };
    // Bank moliyalashtirgan qoldiq summa (bosh to'lov naqd kassaga tushadi)
    const financed = s.remainingAmount ?? Math.max(0, (s.totalAmount ?? 0) - (s.paidAmount ?? 0));
    cur.balance += financed;
    cur.count += s.productSnapshot?.saleQuantity ?? 1;
    statsMap.set(name, cur);
  }

  let totalBalance = 0;
  let totalCount = 0;
  const bankCards = banks.map((b) => {
    const st = statsMap.get(b.name) ?? { balance: 0, count: 0 };
    if (b.active) {
      totalBalance += st.balance;
      totalCount += st.count;
    }
    return {
      id: String(b._id),
      name: b.name,
      active: b.active,
      balance: st.balance,
      salesCount: st.count,
    };
  });

  return (
    <>
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">{d.sales.creditKassa.title}</h1>
          <p className="t-page-sub">{d.sales.creditKassa.sub}</p>
        </div>
      </div>
      <CreditKassaPanel
        banks={bankCards}
        totals={{ balance: totalBalance, salesCount: totalCount }}
      />
    </>
  );
}
