'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { createFinanceTxAction, createFinanceCategoryAction } from '@/app/actions/finance';
import { useToastOnState } from '@/lib/useToastOnState';
import PriceInput from '@/components/ui/PriceInput';
import { useDict } from '@/lib/i18n/client';

type Kind = 'income' | 'expense';

/** Yangi moliyaviy yozuv (o'ng ustun) */
export function FinanceTxForm({ categories, branches }: {
  categories: { name: string; type: Kind }[];
  branches: { id: string; name: string }[];
}) {
  const f = useDict().sales.fin;
  const [state, action, pending] = useActionState(createFinanceTxAction, null);
  const [type, setType] = useState<Kind>('expense');
  const formRef = useRef<HTMLFormElement>(null);
  useToastOnState(state);
  useEffect(() => { if (state?.success) formRef.current?.reset(); }, [state]);
  const list = categories.filter((c) => c.type === type);

  return (
    <form ref={formRef} action={action} className="fx-form">
      <h2 className="fx-h">{f.newTx}</h2>
      <input type="hidden" name="type" value={type} />
      <div className="fx-seg" role="radiogroup" aria-label={f.type}>
        <button type="button" role="radio" aria-checked={type === 'expense'} onClick={() => setType('expense')}>{f.expense}</button>
        <button type="button" role="radio" aria-checked={type === 'income'} onClick={() => setType('income')}>{f.income}</button>
      </div>
      <div className="auth-field">
        <label htmlFor="fx-amount">{f.amount}</label>
        <PriceInput id="fx-amount" name="amount" required placeholder="0" />
      </div>
      <div className="auth-field">
        <label htmlFor="fx-cat">{f.category}</label>
        <select id="fx-cat" name="category" key={type} defaultValue={list[0]?.name ?? ''}>
          <option value="">{f.noCategory}</option>
          {list.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
        </select>
      </div>
      <div className="auth-field">
        <label htmlFor="fx-desc">{f.description}</label>
        <input id="fx-desc" name="description" required maxLength={300} placeholder={f.descriptionPh} autoComplete="off" />
      </div>
      {branches.length > 0 && (
        <div className="auth-field">
          <label htmlFor="fx-branch">{f.branch}</label>
          <select id="fx-branch" name="branchId" defaultValue="">
            <option value="">{f.noBranch}</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      )}
      <button type="submit" className="btn btn-primary btn-full" disabled={pending}>{f.save}</button>
    </form>
  );
}

/** Yangi toifa qo'shish */
export function FinanceCategoryForm() {
  const f = useDict().sales.fin;
  const [state, action, pending] = useActionState(createFinanceCategoryAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  useToastOnState(state);
  useEffect(() => { if (state?.success) formRef.current?.reset(); }, [state]);
  return (
    <form ref={formRef} action={action} className="fx-catform">
      <label className="sr-only" htmlFor="fx-cname">{f.catName}</label>
      <input id="fx-cname" name="name" className="input" required maxLength={60} placeholder={f.catName} autoComplete="off" />
      <label className="sr-only" htmlFor="fx-ctype">{f.type}</label>
      <select id="fx-ctype" name="type" className="input" defaultValue="expense">
        <option value="expense">{f.expense}</option>
        <option value="income">{f.income}</option>
      </select>
      <button type="submit" className="btn btn-primary" disabled={pending}>{f.catAdd}</button>
    </form>
  );
}
