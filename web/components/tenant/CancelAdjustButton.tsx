'use client';

import { useActionState } from 'react';
import { cancelStockAdjustmentAction } from '@/app/actions/stockAdjust';
import { useToastOnState } from '@/lib/useToastOnState';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';

/** Ombor hujjatini bekor qilish (qayta baholash / hisobdan chiqarish) — tasdiq bilan */
export default function CancelAdjustButton({ docId, docNo }: { docId: string; docNo: string }) {
  const [state, formAction, isPending] = useActionState(cancelStockAdjustmentAction, null);
  useToastOnState(state);
  const k = useDict().stock.adjust;
  return (
    <form action={formAction} className="sa-doc-cancel">
      <input type="hidden" name="docId" value={docId} />
      {state?.error && <span className="sa-doc-err" role="alert">{state.error}</span>}
      <button
        type="submit"
        className="btn btn-plain btn-sm btn-with-icon"
        disabled={isPending}
        onClick={(e) => { if (!confirm(tr(k.cancelConfirm, { no: docNo }))) e.preventDefault(); }}
      >
        <Icon name="repeat" size={14} /> {k.cancel}
      </button>
    </form>
  );
}
