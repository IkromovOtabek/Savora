'use client';

import { useActionState, useState } from 'react';
import { openShiftAction, closeShiftAction } from '@/app/actions/cashShift';
import { useToastOnState } from '@/lib/useToastOnState';
import PriceInput from '@/components/ui/PriceInput';
import Icon from '@/components/icons/Icon';
import { fmtMoney } from '@/lib/format';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';

/** Smena ochish — ochiq smenasi yo'q filiallar va ochilishdagi naqd summa */
export function OpenShiftForm({ branches }: { branches: { id: string; name: string }[] }) {
  const k = useDict().sales.shifts;
  const [state, action, pending] = useActionState(openShiftAction, null);
  useToastOnState(state);

  return (
    <form action={action} className="sh-open">
      <h2 className="sh-card-title">{k.openTitle}</h2>
      {branches.length > 1 ? (
        <div className="auth-field">
          <label htmlFor="sh-branch">{k.branch}</label>
          <select id="sh-branch" name="branchId" required defaultValue={branches[0].id}>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      ) : (
        <>
          <input type="hidden" name="branchId" value={branches[0].id} />
          <p className="sh-branch-one"><Icon name="building" size={15} />{branches[0].name}</p>
        </>
      )}
      <div className="auth-field">
        <label htmlFor="sh-opening">{k.openingCash}</label>
        <PriceInput id="sh-opening" name="openingCash" required placeholder="0" />
        <span className="field-hint">{k.openingHint}</span>
      </div>
      <button type="submit" className="btn btn-primary btn-full btn-with-icon" disabled={pending}>
        <Icon name="plus" size={16} />{k.openBtn}
      </button>
    </form>
  );
}

/** Smena yopish — sanalgan summa kiritilganda farq darhol ko'rinadi (yakuniy hisob serverda) */
export function CloseShiftForm({ shiftId, expected }: { shiftId: string; expected: number }) {
  const d = useDict();
  const k = d.sales.shifts;
  const [state, action, pending] = useActionState(closeShiftAction, null);
  const [counted, setCounted] = useState('');
  useToastOnState(state);

  const n = counted === '' ? null : Number(counted);
  const diff = n === null ? null : n - expected;

  return (
    <form action={action} className="sh-close">
      <input type="hidden" name="shiftId" value={shiftId} />
      <div className="sh-close-grid">
        <div className="auth-field">
          <label htmlFor={`sh-c-${shiftId}`}>{k.counted}</label>
          <PriceInput id={`sh-c-${shiftId}`} name="countedCash" required placeholder={k.countedHint} value={counted} onValueChange={setCounted} />
        </div>
        <div className="auth-field">
          <label htmlFor={`sh-n-${shiftId}`}>{k.note}</label>
          <input id={`sh-n-${shiftId}`} name="note" maxLength={300} autoComplete="off" />
        </div>
      </div>
      <div className="sh-close-foot">
        <span className={`sh-diff${diff === null ? '' : diff === 0 ? ' sh-diff--ok' : diff < 0 ? ' sh-diff--bad' : ' sh-diff--warn'}`} aria-live="polite">
          {diff === null ? `${k.expected}: ${fmtMoney(expected)} ${d.common.sum}`
            : diff === 0 ? k.diffOk
            : tr(diff < 0 ? k.shortage : k.surplus, { v: `${fmtMoney(Math.abs(diff))} ${d.common.sum}` })}
        </span>
        <button type="submit" className="btn btn-primary" disabled={pending}>{k.closeBtn}</button>
      </div>
    </form>
  );
}
