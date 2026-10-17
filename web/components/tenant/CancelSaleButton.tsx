'use client';

import { useActionState } from 'react';
import { cancelSaleAction } from '@/app/actions/sales';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';

export default function CancelSaleButton({ saleId, saleNo }: { saleId: string; saleNo: string }) {
  const [state, formAction, isPending] = useActionState(cancelSaleAction, null);
  const d = useDict();

  return (
    <section className="sl-card sl-cancel" aria-labelledby="sl-cancel-h">
      <div className="sl-card-head"><h2 id="sl-cancel-h">{d.sales.cancel.title}</h2></div>
      <form action={formAction} className="sl-card-body">
        <input type="hidden" name="saleId" value={saleId} />
        {state?.error && <div className="auth-alert auth-alert--error" style={{ marginBottom: 12 }}>{state.error}</div>}
        {state?.success && <div className="auth-alert auth-alert--info" style={{ marginBottom: 12 }}>{state.success}</div>}
        <p>{tr(d.sales.cancel.text, { no: saleNo })}</p>
        <button
          type="submit"
          className="btn btn-danger btn-full btn-with-icon"
          disabled={isPending}
          onClick={(e) => {
            if (!confirm(tr(d.sales.cancel.confirm, { no: saleNo }))) e.preventDefault();
          }}
        >
          <Icon name="close" size={16} />
          {isPending ? d.sales.cancel.pending : d.common.cancel}
        </button>
      </form>
    </section>
  );
}
