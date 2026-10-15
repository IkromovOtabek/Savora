'use client';

import { useRef, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import CameraScanButton from '@/components/ui/CameraScanButton';
import Icon from '@/components/icons/Icon';

interface Props {
  /** Bo'sh bo'lsa (filial login yoki bitta filial) — filial tanlovi ko'rsatilmaydi */
  branches: { id: string; name: string }[];
  initial: { q: string; branch: string; status: string };
  /** Holat chiplari — filial tanlovi bilan bitta gorizontal lentada chiqadi */
  children?: ReactNode;
}

export default function ProductSearch({ branches, initial, children }: Props) {
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
    go(String(fd.get('q') || ''), initial.branch, String(fd.get('status') || ''));
  }

  function onScan(code: string) {
    if (qRef.current) qRef.current.value = code;
    // Skanerlangach darhol qidiramiz (filial/holat saqlanadi)
    go(code, initial.branch, initial.status);
  }

  // Filial tanlansa darhol qo'llanadi — alohida "Qidirish" bosish shart emas
  function onBranch(e: React.ChangeEvent<HTMLSelectElement>) {
    go(qRef.current?.value ?? initial.q, e.target.value, initial.status);
  }

  const showBranches = branches.length > 1;

  return (
    <>
      <form onSubmit={onSubmit} className="st-search" role="search" aria-label="Mahsulot qidiruvi">
        {/* Holat chiplar orqali tanlanadi (sahifada) — qidiruvda saqlanib qoladi */}
        <input type="hidden" name="status" value={initial.status} />
        <div className="st-search-field">
          <Icon name="search" size={18} />
          <label htmlFor="q" className="sr-only">Qidiruv (shtrix, IMEI, nom)</label>
          <input
            key={initial.q}
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
        {/* Mobilda klaviaturadagi "Qidirish" tugmasi yetarli */}
        <button type="submit" className="btn btn-primary st-search-submit ux-hide-mobile">Qidirish</button>
      </form>

      <nav className="st-filterbar ux-scrollx" aria-label="Filtr: filial va holat">
        {showBranches && (
          <>
            <label htmlFor="branch" className="sr-only">Filial</label>
            <span className={`st-branch-pick${initial.branch ? ' is-on' : ''}`}>
              <Icon name="building" size={15} />
              <select key={initial.branch} id="branch" name="branch" defaultValue={initial.branch} onChange={onBranch}>
                <option value="">Barcha filiallar</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </span>
            <span className="st-filterbar-sep" aria-hidden="true" />
          </>
        )}
        {children}
      </nav>
    </>
  );
}
