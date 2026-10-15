'use client';

import { useActionState } from 'react';
import { cancelSaleAction } from '@/app/actions/sales';
import Icon from '@/components/icons/Icon';

export default function CancelSaleButton({ saleId, saleNo }: { saleId: string; saleNo: string }) {
  const [state, formAction, isPending] = useActionState(cancelSaleAction, null);

  return (
    <section className="sl-card sl-cancel" aria-labelledby="sl-cancel-h">
      <div className="sl-card-head"><h2 id="sl-cancel-h">Sotuvni bekor qilish</h2></div>
      <form action={formAction} className="sl-card-body">
        <input type="hidden" name="saleId" value={saleId} />
        {state?.error && <div className="auth-alert auth-alert--error" style={{ marginBottom: 12 }}>{state.error}</div>}
        {state?.success && <div className="auth-alert auth-alert--info" style={{ marginBottom: 12 }}>{state.success}</div>}
        <p>
          {saleNo} bekor qilinsa, mahsulot qayta omborga qaytadi. Bu amalni faqat ruxsati bor xodim bajara oladi.
        </p>
        <button
          type="submit"
          className="btn btn-danger btn-full btn-with-icon"
          disabled={isPending}
          onClick={(e) => {
            if (!confirm(`${saleNo} sotuvini bekor qilasizmi?`)) e.preventDefault();
          }}
        >
          <Icon name="close" size={16} />
          {isPending ? 'Bekor qilinmoqda...' : 'Bekor qilish'}
        </button>
      </form>
    </section>
  );
}
