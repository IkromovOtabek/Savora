'use client';

import { useActionState } from 'react';
import { useToastOnState } from '@/lib/useToastOnState';
import { transferProductAction } from '@/app/actions/transfer';
import Icon from '@/components/icons/Icon';
import './styles/sales.css';

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
    <section className="sl-card sl-transfer" aria-labelledby="sl-transfer-h">
      <div className="sl-card-head"><h2 id="sl-transfer-h">Boshqa filialga ko&apos;chirish</h2></div>
      <form action={formAction}>
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
        <button type="submit" className="btn btn-primary btn-with-icon" disabled={isPending}>
          <Icon name="repeat" size={16} />
          {isPending ? 'Ko\'chirilmoqda...' : 'Ko\'chirish'}
        </button>
      </form>
    </section>
  );
}
