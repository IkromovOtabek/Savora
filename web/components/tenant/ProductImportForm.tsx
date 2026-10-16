'use client';

import { useActionState } from 'react';
import { importProductsAction } from '@/app/actions/products';
import { useDict } from '@/lib/i18n/client';

export default function ProductImportForm({
  branches: _branches,
}: {
  branches: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(importProductsAction, null);
  const t = useDict().stock.import;

  return (
    <div className="panel" style={{ marginTop: 20, borderRadius: "var(--r-lg)" }}>
      <div className="panel-head">
        <h2>{t.title}</h2>
        <a href="/api/export/products" className="btn btn-ghost btn-sm">{t.sample}</a>
      </div>
      <form action={action} className="form-grid" style={{ padding: '20px 24px' }}>
        {state?.error && <div className="auth-alert auth-alert--error">{state.error}</div>}
        {state?.success && <div className="auth-alert auth-alert--info">{state.success}</div>}

        <div className="auth-field">
          <label htmlFor="csv">{t.csvLabel}</label>
          <textarea id="csv" name="csv" rows={6} className="text-area" placeholder="353456789012345,iPhone 15,Black,8000000,9500000," disabled={pending} />
        </div>

        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? t.importing : t.submit}
        </button>
      </form>
    </div>
  );
}
