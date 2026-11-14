'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createFinanceTxAction, createFinanceCategoryAction, deleteFinanceCategoryAction, renameFinanceCategoryAction } from '@/app/actions/finance';
import Icon from '@/components/icons/Icon';
import { toast } from '@/lib/toast';
import { tr } from '@/lib/i18n/fmt';
import { useToastOnState } from '@/lib/useToastOnState';
import PriceInput from '@/components/ui/PriceInput';
import FinanceCategorySelect from '@/components/tenant/FinanceCategorySelect';
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
  const names = (k: Kind) => categories.filter((c) => c.type === k).map((c) => c.name);
  const [category, setCategory] = useState(names('expense')[0] ?? '');
  const switchType = (k: Kind) => { setType(k); setCategory(names(k)[0] ?? ''); };

  return (
    <form ref={formRef} action={action} className="fx-form">
      <h2 className="fx-h">{f.newTx}</h2>
      <input type="hidden" name="type" value={type} />
      <div className="fx-seg" role="radiogroup" aria-label={f.type}>
        <button type="button" role="radio" aria-checked={type === 'expense'} onClick={() => switchType('expense')}>{f.expense}</button>
        <button type="button" role="radio" aria-checked={type === 'income'} onClick={() => switchType('income')}>{f.income}</button>
      </div>
      <div className="auth-field">
        <label htmlFor="fx-amount">{f.amount}</label>
        <PriceInput id="fx-amount" name="amount" required placeholder="0" />
      </div>
      <div className="auth-field">
        <label htmlFor="fx-cat">{f.category}</label>
        {/* key — tur almashganda ro'yxat qayta olinadi; ichida «+», o'ngda tahrirlash/o'chirish */}
        <FinanceCategorySelect key={type} id="fx-cat" type={type} categories={names(type)} value={category} onChange={setCategory} placeholder={f.noCategory} disabled={pending} />
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

/** Toifalar ro'yxatida: qayta nomlash (yozuvlar ham yangi nomga o'tadi) va o'chirish — ikonkalar bilan */
export function FinanceCategoryEdit({ name, type }: { name: string; type: Kind }) {
  const d = useDict();
  const t = d.ui.selectAdd;
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(name);
  const [busy, start] = useTransition();

  const save = () => {
    const v = text.trim();
    if (!v || v === name) { setEditing(false); return; }
    start(async () => {
      const res = await renameFinanceCategoryAction(name, type, v);
      if (!res.ok) { toast(res.error, 'error'); return; }
      setEditing(false);
      router.refresh();
    });
  };
  const remove = () => {
    if (!window.confirm(tr(t.removeConfirm, { name }))) return;
    start(async () => {
      const res = await deleteFinanceCategoryAction(name, type);
      if (!res.ok) { toast(res.message ?? d.sales.actions.saveFailed, 'error'); return; }
      if (res.message) toast(res.message, 'info');
      router.refresh();
    });
  };

  if (editing) {
    return (
      <span className="fx-cat-edit">
        <input
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } if (e.key === 'Escape') setEditing(false); }}
          maxLength={60}
          aria-label={t.editName}
          disabled={busy}
          autoFocus
        />
        <button type="button" className="fx-icon-btn" onClick={save} disabled={busy} aria-label={t.save} title={t.save}><Icon name="check" size={16} /></button>
        <button type="button" className="fx-icon-btn" onClick={() => { setEditing(false); setText(name); }} disabled={busy} aria-label={t.cancel} title={t.cancel}><Icon name="close" size={16} /></button>
      </span>
    );
  }
  return (
    <>
      <button type="button" className="fx-icon-btn" onClick={() => setEditing(true)} disabled={busy} aria-label={`${t.edit}: ${name}`} title={t.edit}><Icon name="edit" size={16} /></button>
      <button type="button" className="fx-icon-btn fx-icon-btn--del" onClick={remove} disabled={busy} aria-label={`${t.remove}: ${name}`} title={t.remove}><Icon name="trash" size={16} /></button>
    </>
  );
}
