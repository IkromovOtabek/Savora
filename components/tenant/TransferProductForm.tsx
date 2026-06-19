'use client';

import { useActionState } from 'react';
import { useToastOnState } from '@/lib/useToastOnState';
import { transferProductAction } from '@/app/actions/transfer';

export default function TransferProductForm({
  productId,
  branches,
  currentBranchId,
}: {
  productId: string;
  branches: { id: string; name: string }[];
  currentBranchId: string;
}) {
  const [state, formAction, isPending] = useActionState(transferProductAction, null);
  useToastOnState(state);
  const options = branches.filter((b) => b.id !== currentBranchId);

  if (options.length === 0) return null;

  return (
    <div className="panel" style={{ marginTop: 16, maxWidth: 640 }}>
      <div className="panel-head"><h2>Boshqa filialga ko&apos;chirish</h2></div>
      <form action={formAction} className="form-grid">
        <input type="hidden" name="productId" value={productId} />
        {state?.error && <div className="auth-alert auth-alert--error">{state.error}</div>}
        {state?.success && <div className="auth-alert auth-alert--info">{state.success}</div>}
        <div className="auth-field">
          <label htmlFor="branchId">Maqsad filial</label>
          <select id="branchId" name="branchId" required disabled={isPending}>
            {options.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-primary btn-sm" disabled={isPending}>Ko&apos;chirish</button>
      </form>
    </div>
  );
}
