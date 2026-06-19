'use client';

import { useActionState } from 'react';
import { cancelSaleAction } from '@/app/actions/sales';

export default function CancelSaleButton({ saleId, saleNo }: { saleId: string; saleNo: string }) {
  const [state, formAction, isPending] = useActionState(cancelSaleAction, null);

  return (
    <div className="panel" style={{ marginTop: 20, borderColor: '#fecaca' }}>
      <div className="panel-head"><h2 style={{ color: '#b91c1c' }}>Sotuvni bekor qilish</h2></div>
      <form action={formAction} className="form-grid">
        <input type="hidden" name="saleId" value={saleId} />
        {state?.error && <div className="auth-alert auth-alert--error">{state.error}</div>}
        {state?.success && <div className="auth-alert auth-alert--info">{state.success}</div>}
        <p style={{ color: 'var(--ink-2)', fontSize: '.88rem' }}>
          {saleNo} bekor qilinsa, mahsulot qayta omborga qaytadi. Faqat admin buni qila oladi.
        </p>
        <button
          type="submit"
          className="btn btn-ghost btn-sm"
          disabled={isPending}
          style={{ color: '#b91c1c', borderColor: '#fecaca', alignSelf: 'flex-start' }}
          onClick={(e) => {
            if (!confirm(`${saleNo} sotuvini bekor qilasizmi?`)) e.preventDefault();
          }}
        >
          {isPending ? '...' : 'Bekor qilish'}
        </button>
      </form>
    </div>
  );
}
