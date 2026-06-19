'use client';

import { useRouter } from 'next/navigation';
import { PRODUCT_STATUS_LABELS, ProductStatus } from '@/lib/models/tenant/Product';

interface Props {
  branches: { id: string; name: string }[];
  initial: { q: string; branch: string; status: string };
}

export default function ProductSearch({ branches, initial }: Props) {
  const router = useRouter();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const params = new URLSearchParams();
    const q = String(fd.get('q') || '').trim();
    const branch = String(fd.get('branch') || '');
    const status = String(fd.get('status') || '');
    if (q) params.set('q', q);
    if (branch) params.set('branch', branch);
    if (status) params.set('status', status);
    router.push(`/app/products?${params.toString()}`);
  }

  return (
    <form onSubmit={onSubmit} className="search-bar panel" style={{ padding: '16px 20px' }}>
      <div className="search-bar-grid">
        <div className="auth-field" style={{ margin: 0 }}>
          <label htmlFor="q">Qidiruv (IMEI, nom, brend)</label>
          <input id="q" name="q" type="search" defaultValue={initial.q} placeholder="IMEI yoki nom..." />
        </div>
        <div className="auth-field" style={{ margin: 0 }}>
          <label htmlFor="branch">Filial</label>
          <select id="branch" name="branch" defaultValue={initial.branch}>
            <option value="">Barchasi</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <div className="auth-field" style={{ margin: 0 }}>
          <label htmlFor="status">Holat</label>
          <select id="status" name="status" defaultValue={initial.status}>
            <option value="">Barchasi</option>
            {(Object.keys(PRODUCT_STATUS_LABELS) as ProductStatus[]).map((s) => (
              <option key={s} value={s}>{PRODUCT_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
        <div className="search-bar-actions">
          <button type="submit" className="btn btn-primary btn-sm">Qidirish</button>
        </div>
      </div>
    </form>
  );
}
