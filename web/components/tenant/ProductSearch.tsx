'use client';

import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import CameraScanButton from '@/components/ui/CameraScanButton';
import Icon from '@/components/icons/Icon';

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
    <form onSubmit={onSubmit} className="st-search" role="search" aria-label="Mahsulot qidiruvi">
      {/* Holat chiplar orqali tanlanadi (sahifada) — qidiruvda saqlanib qoladi */}
      <input type="hidden" name="status" value={initial.status} />
      <div className="st-search-field">
        <Icon name="search" size={18} />
        <label htmlFor="q" className="sr-only">Qidiruv (shtrix, IMEI, nom)</label>
        <input
          ref={qRef}
          id="q"
          name="q"
          type="search"
          defaultValue={initial.q}
          placeholder="Shtrix-kod, IMEI yoki nom…"
          autoComplete="off"
          enterKeyHint="search"
        />
        <CameraScanButton onScan={onScan} label="Skaner" />
      </div>
      <div>
        <label htmlFor="branch" className="sr-only">Filial</label>
        <select id="branch" name="branch" defaultValue={initial.branch}>
          <option value="">Barcha filiallar</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>
      <button type="submit" className="btn btn-primary st-search-submit">Qidirish</button>
    </form>
  );
}
