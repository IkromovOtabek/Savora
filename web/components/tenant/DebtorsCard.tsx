'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { bulkDebtPaymentAction } from '@/app/actions/debts';
import PriceInput from '@/components/ui/PriceInput';
import { fmtMoney } from '@/lib/format';
import { toast } from '@/lib/toast';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';

export interface Debtor { id: string; name: string; remaining: number; count: number }

/** Qarzdor mijozlar (o'ng ustun): ommaviy to'lov va solishtirish dalolatnomasi */
export default function DebtorsCard({ debtors, canPay, canAct }: { debtors: Debtor[]; canPay: boolean; canAct: boolean }) {
  const d = useDict();
  const k = d.sales.debts;
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [pending, start] = useTransition();

  function pay(id: string) {
    start(async () => {
      const res = await bulkDebtPaymentAction({ customerId: id, amount: Number(amount) || 0 });
      if (res?.success) { toast(res.success, 'success'); setOpen(null); setAmount(''); router.refresh(); }
      else if (res?.error) toast(res.error, 'error');
    });
  }

  if (debtors.length === 0) return null;
  return (
    <section className="cl-card dc-card" aria-labelledby="dc-h">
      <h2 id="dc-h" className="dc-h">{k.bulkTitle}</h2>
      {canPay && <p className="dc-hint">{k.bulkHint}</p>}
      <ul className="dc-list">
        {debtors.map((x) => (
          <li key={x.id}>
            <div className="dc-row">
              <span className="dc-name"><b>{x.name}</b><small>{tr(k.nDebts, { n: x.count })}</small></span>
              <b className="dc-sum t-num">{fmtMoney(x.remaining)}</b>
            </div>
            <div className="dc-acts">
              {canPay && (
                <button type="button" className="btn btn-sm btn-tinted" aria-expanded={open === x.id} onClick={() => { setOpen(open === x.id ? null : x.id); setAmount(''); }}>
                  {k.bulkPay}
                </button>
              )}
              {canAct && <Link href={`/app/customers/${x.id}/act`} className="btn btn-sm btn-ghost">{k.act}</Link>}
            </div>
            {open === x.id && (
              <form className="dc-pay" onSubmit={(e) => { e.preventDefault(); pay(x.id); }}>
                <label className="sr-only" htmlFor={`dc-a-${x.id}`}>{k.bulkAmount}</label>
                <PriceInput id={`dc-a-${x.id}`} value={amount} onValueChange={setAmount} placeholder={fmtMoney(x.remaining)} className="input" />
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAmount(String(x.remaining))}>100%</button>
                <button type="submit" className="btn btn-sm btn-primary" disabled={pending || !amount}>{k.bulkSubmit}</button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
