'use client';

import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { PRODUCT_STATUS_LABELS, ProductStatus } from '@/lib/models/tenant/Product';
import CameraScanButton from '@/components/ui/CameraScanButton';

interface Props {
  branches: { id: string; name: string }[];
  initial: { q: string; branch: string; status: string };
}

export default function ProductSearch({ branches, initial }: Props) {
  const router = useRouter();
  const qRef = useRef<HTMLInputElement>(null);

  function go(q: string, branch: string, status: string) {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (branch) params.set('branch', branch);
    if (status) params.set('status', status);
    router.push(`/app/products?${params.toString()}`);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    go(String(fd.get('q') || ''), String(fd.get('branch') || ''), String(fd.get('status') || ''));
  }

  function onScan(code: string) {
    if (qRef.current) qRef.current.value = code;
    // Skanerlangach darhol qidiramiz (filial/holat saqlanadi)
    go(code, initial.branch, initial.status);
  }

  return (
    <form onSubmit={onSubmit} className="search-bar panel" style={{ padding: '16px 20px' }}>
      <div className="search-bar-grid">
        <div className="auth-field" style={{ margin: 0 }}>
          <label htmlFor="q">Qidiruv (shtrix, IMEI, nom)</label>
          <input ref={qRef} id="q" name="q" type="search" defaultValue={initial.q} placeholder="Shtrix, IMEI yoki nom..." />
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
        <div className="search-bar-actions" style={{ display: 'flex', gap: 8 }}>
          <CameraScanButton onScan={onScan} label="Skaner" />
          <button type="submit" className="btn btn-primary btn-sm">Qidirish</button>
        </div>
      </div>
    </form>
  );
}
