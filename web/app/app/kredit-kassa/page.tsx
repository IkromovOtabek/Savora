import { getTenantAdminSession } from '@/lib/tenantSession';
import CreditKassaPanel from '@/components/tenant/CreditKassaPanel';
import { getDict } from '@/lib/i18n/server';
import { bankBalanceOf, computeBankBalances } from '@/lib/bankCredit';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.sales.creditKassa.metaTitle };
}

/** Oxirgi tushumlar ro'yxati (to'liq jami — aggregate orqali) */
const RECEIPTS_LIMIT = 50;

export default async function CreditKassaPage() {
  const { CreditBank, Sale, BankReceipt } = await getTenantAdminSession();
  const d = await getDict();

  const [banks, creditSales, receiptSums, recent] = await Promise.all([
    CreditBank.find().sort({ name: 1 }).lean(),
    Sale.find({ paymentType: 'bank_credit', status: { $ne: 'cancelled' } })
      .select('paymentType status bankName bankParts totalAmount paidAmount remainingAmount')
      .lean(),
    BankReceipt.aggregate<{ _id: string; total: number }>([
      { $group: { _id: '$bankName', total: { $sum: '$amount' } } },
    ]),
    BankReceipt.find().sort({ receivedAt: -1, _id: -1 }).limit(RECEIPTS_LIMIT).lean(),
  ]);

  // Kiritilgan (sotuvlardagi bank ulushlari) − Olingan (bankdan tushgan pul) = Qoldiq
  const balances = computeBankBalances(
    creditSales,
    receiptSums.map((r) => ({ bankName: r._id, amount: r.total })),
  );

  // Bir sotuv bir nechta bankda bo'lishi mumkin — sotuvlar soni banklar bo'yicha emas, alohida sanaladi
  const totals = { financed: 0, received: 0, balance: 0, salesCount: creditSales.length };
  const bankCards = banks.map((b) => {
    const st = bankBalanceOf(balances, b.name);
    // O'chirilgan (vaqtincha) bank ham hisobda — undagi pul hali yopilmagan bo'lishi mumkin
    totals.financed += st.financed;
    totals.received += st.received;
    totals.balance += st.balance;
    return { id: String(b._id), name: b.name, active: b.active, ...st };
  });

  const receipts = recent.map((r) => ({
    id: String(r._id),
    bankName: r.bankName,
    amount: r.amount,
    receivedAt: r.receivedAt.toISOString(),
    note: r.note ?? '',
    recordedBy: r.recordedBy,
  }));

  return (
    <>
      <div className="t-page-head">
        <div>
          <h1 className="t-page-title">{d.sales.creditKassa.title}</h1>
          <p className="t-page-sub">{d.sales.creditKassa.sub}</p>
        </div>
      </div>
      <CreditKassaPanel banks={bankCards} totals={totals} receipts={receipts} />
    </>
  );
}
