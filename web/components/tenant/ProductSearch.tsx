'use client';

import { useRef, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import CameraScanButton from '@/components/ui/CameraScanButton';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';

interface Props {
  /** Bo'sh bo'lsa (filial login yoki bitta filial) — filial tanlovi ko'rsatilmaydi */
  branches: { id: string; name: string }[];
  /** Turkumlar (daraxt yo'li bilan) va brend nomlari — bo'sh bo'lsa tanlov ko'rsatilmaydi */
  categories?: { id: string; name: string }[];
  brands?: string[];
  initial: { q: string; branch: string; status: string; cat?: string; brand?: string };
  /** Holat chiplari — filial tanlovi bilan bitta gorizontal lentada chiqadi */
  children?: ReactNode;
}

export default function ProductSearch({ branches, categories = [], brands = [], initial, children }: Props) {
  const d = useDict();
  const t = d.stock.search;
  const router = useRouter();
  const qRef = useRef<HTMLInputElement>(null);

  function go(q: string, branch: string, status: string, cat = initial.cat ?? '', brand = initial.brand ?? '') {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (branch) params.set('branch', branch);
    if (cat) params.set('cat', cat);
    if (brand) params.set('brand', brand);
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
  const currentQ = () => qRef.current?.value ?? initial.q;

  return (
    <>
      <form onSubmit={onSubmit} className="st-search" role="search" aria-label={t.label}>
        {/* Holat chiplar orqali tanlanadi (sahifada) — qidiruvda saqlanib qoladi */}
        <input type="hidden" name="status" value={initial.status} />
        <div className="st-search-field">
          <Icon name="search" size={18} />
          <label htmlFor="q" className="sr-only">{t.srLabel}</label>
          <input
            key={initial.q}
            ref={qRef}
            id="q"
            name="q"
            type="search"
            defaultValue={initial.q}
            placeholder={t.placeholder}
            autoComplete="off"
            enterKeyHint="search"
          />
          <CameraScanButton onScan={onScan} label={t.scanner} />
        </div>
        {/* Mobilda klaviaturadagi "Qidirish" tugmasi yetarli */}
        <button type="submit" className="btn btn-primary st-search-submit ux-hide-mobile">{d.common.search}</button>
      </form>

      <nav className="st-filterbar ux-scrollx" aria-label={t.filterLabel}>
        {showBranches && (
          <>
            <label htmlFor="branch" className="sr-only">{d.common.branch}</label>
            <span className={`st-branch-pick${initial.branch ? ' is-on' : ''}`}>
              <Icon name="building" size={15} />
              <select key={initial.branch} id="branch" name="branch" defaultValue={initial.branch} onChange={onBranch}>
                <option value="">{t.allBranches}</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </span>
            <span className="st-filterbar-sep" aria-hidden="true" />
          </>
        )}
        {categories.length > 0 && (
          <span className={`st-branch-pick${initial.cat ? ' is-on' : ''}`}>
            <Icon name="grid" size={15} />
            <select
              key={`c${initial.cat}`}
              defaultValue={initial.cat ?? ''}
              aria-label={t.allCategories}
              onChange={(e) => go(currentQ(), initial.branch, initial.status, e.target.value)}
            >
              <option value="">{t.allCategories}</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </span>
        )}
        {brands.length > 0 && (
          <span className={`st-branch-pick${initial.brand ? ' is-on' : ''}`}>
            <Icon name="sparkles" size={15} />
            <select
              key={`b${initial.brand}`}
              defaultValue={initial.brand ?? ''}
              aria-label={t.allBrands}
              onChange={(e) => go(currentQ(), initial.branch, initial.status, initial.cat ?? '', e.target.value)}
            >
              <option value="">{t.allBrands}</option>
              {/* Ro'yxatdan o'chirilgan, lekin filtrda turgan brend ham ko'rinsin */}
              {initial.brand && !brands.some((b) => b.toLowerCase() === initial.brand!.toLowerCase()) && <option value={initial.brand}>{initial.brand}</option>}
              {brands.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </span>
        )}
        {(categories.length > 0 || brands.length > 0) && <span className="st-filterbar-sep" aria-hidden="true" />}
        {children}
      </nav>
    </>
  );
}
