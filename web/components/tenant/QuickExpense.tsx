'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createQuickExpenseAction } from '@/app/actions/finance';
import { useToastOnState } from '@/lib/useToastOnState';
import PriceInput from '@/components/ui/PriceInput';
import FinanceCategorySelect from '@/components/tenant/FinanceCategorySelect';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';

/**
 * Tez «Xarajat qo'shish»: bosh sahifa va kassada (smenasiz do'konlar ham ishlatadi).
 * Toifa majburiy — yozuv Hisobotdagi sof foydadan ayiriladi.
 */
export default function QuickExpense({ categories, branches, variant = 'tile' }: {
  /** Faol xarajat toifalari (tizimdan tashqari) */
  categories: string[];
  branches: { id: string; name: string }[];
  /** tile — bosh sahifadagi «Tezkor amallar» plitkasi; button — sahifa sarlavhasidagi tugma */
  variant?: 'tile' | 'button';
}) {
  const d = useDict();
  const f = d.sales.fin;
  const t = d.shell.dash;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(categories[0] ?? '');
  const [state, action, pending] = useActionState(createQuickExpenseAction, null);
  useToastOnState(state);

  // Saqlangach — oyna yopiladi, sahifa raqamlari yangilanadi
  useEffect(() => {
    if (state?.success) {
      setOpen(false);
      router.refresh();
    }
  }, [state, router]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !pending) setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [open, pending]);

  const trigger = variant === 'tile' ? (
    <button type="button" className="t-qa" onClick={() => setOpen(true)} aria-haspopup="dialog">
      <span className="t-qa-ic t-qa-ic--out"><Icon name="wallet" size={20} /></span>
      <span className="t-qa-t">{t.qaExpense}<small>{t.qaExpenseSub}</small></span>
    </button>
  ) : (
    <button type="button" className="btn btn-tinted btn-with-icon" onClick={() => setOpen(true)} aria-haspopup="dialog">
      <Icon name="plus" size={16} /> {f.qeTitle}
    </button>
  );

  return (
    <>
      {trigger}
      {open && (
        <div className="u-modal-overlay" onClick={() => !pending && setOpen(false)}>
          <div className="u-modal" role="dialog" aria-modal="true" aria-labelledby="qe-title" onClick={(e) => e.stopPropagation()}>
            <div className="u-modal-head">
              <h3 id="qe-title">{f.qeTitle}</h3>
              <button type="button" className="u-icon-btn" onClick={() => setOpen(false)} disabled={pending} aria-label={d.common.close}>
                <Icon name="close" size={18} />
              </button>
            </div>
            <form action={action}>
              <p className="field-hint" style={{ margin: 0 }}>{f.qeHint}</p>
              <div className="auth-field">
                <label htmlFor="qe-amount">{f.amount}</label>
                <PriceInput id="qe-amount" name="amount" required placeholder="0" disabled={pending} />
              </div>
              <div className="auth-field">
                <label htmlFor="qe-cat">{f.category}</label>
                {/* Ichida «+» — yangi toifa; o'ngda tanlanganini tahrirlash/o'chirish */}
                <FinanceCategorySelect id="qe-cat" type="expense" categories={categories} value={category} onChange={setCategory} required disabled={pending} />
              </div>
              <div className="auth-field">
                <label htmlFor="qe-note">{f.qeNote}</label>
                <input id="qe-note" name="note" maxLength={300} placeholder={f.qeNotePh} autoComplete="off" disabled={pending} />
              </div>
              {/* Bitta filial — avtomatik o'sha (filial foydasida ko'rinadi); bir nechta — tanlanadi */}
              {branches.length === 1 && <input type="hidden" name="branchId" value={branches[0].id} />}
              {branches.length > 1 && (
                <div className="auth-field">
                  <label htmlFor="qe-branch">{f.branch}</label>
                  <select id="qe-branch" name="branchId" defaultValue="" disabled={pending}>
                    <option value="">{f.noBranch}</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}
              <div className="u-modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)} disabled={pending}>{d.common.cancel}</button>
                <button type="submit" className="btn btn-primary" disabled={pending}>{f.save}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
