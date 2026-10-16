'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import Icon from '@/components/icons/Icon';
import { Avatar, Chevron, OrgStatusPill, Pill } from './ui';

export interface OrgListRow {
  id: string;
  name: string;
  slug: string;
  ownerName: string;
  typeLabel: string;
  planLabel: string;
  isTrial: boolean;
  price: string;
  status: { key: 'active' | 'expired' | 'suspended'; label: string };
  expires: string;
}

type Filter = 'all' | 'active' | 'trial' | 'expired';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Barchasi' },
  { key: 'active', label: 'Faol' },
  { key: 'trial', label: 'Sinovda' },
  { key: 'expired', label: 'Tugagan' },
];

function matches(r: OrgListRow, f: Filter): boolean {
  if (f === 'active') return r.status.key === 'active';
  if (f === 'trial') return r.isTrial && r.status.key === 'active';
  if (f === 'expired') return r.status.key === 'expired';
  return true;
}

/**
 * Do'konlar ro'yxati: allaqachon yuklangan qatorlar ustida mijoz tomonida qidiruv va holat filtri
 * (yangi so'rov yo'q). Kompyuterda jadval, telefonda ixcham qatorlar.
 */
export default function OrgList({ rows, initialFilter = 'all' }: { rows: OrgListRow[]; initialFilter?: string }) {
  const [q, setQ] = useState('');
  // ?f=expired kabi havoladan (Asosiy paneldagi «Diqqat talab qiladi») boshlang'ich filtr
  const [f, setF] = useState<Filter>(FILTERS.some((x) => x.key === initialFilter) ? (initialFilter as Filter) : 'all');

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: rows.length, active: 0, trial: 0, expired: 0 };
    for (const r of rows) for (const x of FILTERS) if (x.key !== 'all' && matches(r, x.key)) c[x.key]++;
    return c;
  }, [rows]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => matches(r, f) && (!needle
      || r.name.toLowerCase().includes(needle)
      || r.slug.toLowerCase().includes(needle)
      || r.ownerName.toLowerCase().includes(needle)));
  }, [rows, q, f]);

  return (
    <section className="sa-card">
      <div className="sa-card-h sa-list-h">
        <div>
          <h2>Barcha do&apos;konlar</h2>
          <p>{shown.length === rows.length ? `${rows.length} ta biznes` : `${shown.length} / ${rows.length} ta biznes`}</p>
        </div>
        <div className="sa-list-tools">
          <div className="sa-searchbox">
            <Icon name="search" size={16} />
            <label htmlFor="org-q" className="sr-only">Do&apos;kon qidirish</label>
            <input
              id="org-q"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nomi yoki egasi bo'yicha…"
              autoComplete="off"
            />
          </div>
          <div className="sa-seg sa-seg--scroll ux-scrollx" role="group" aria-label="Holat bo'yicha">
            {FILTERS.map((x) => (
              <button key={x.key} type="button" aria-pressed={f === x.key} onClick={() => setF(x.key)}>
                {x.label} <span className="sa-seg-n">{counts[x.key]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="ux-empty">
          <span className="ux-empty-ic"><Icon name="search" size={24} /></span>
          <b>Hech narsa topilmadi</b>
          <p>Boshqa so&apos;z bilan qidiring yoki filtrni «Barchasi» ga qaytaring.</p>
          <button type="button" className="sa-btn sa-btn--tinted sa-btn--sm" onClick={() => { setQ(''); setF('all'); }}>
            Filtrni tozalash
          </button>
        </div>
      ) : (
        <>
          <div className="sa-table-wrap ux-hide-mobile">
            <table className="sa-table">
              <thead>
                <tr>
                  <th>Do&apos;kon</th>
                  <th>Turi</th>
                  <th>Tarif</th>
                  <th className="sa-td-r">To&apos;lov/oy</th>
                  <th>Holat</th>
                  <th>Muddat</th>
                  <th aria-label="Amallar" />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/super/organizations/${r.id}`} className="sa-td-main">{r.name}</Link>
                      <span className="sa-td-sub">{r.slug}{r.ownerName ? ` · ${r.ownerName}` : ''}</span>
                    </td>
                    <td>{r.typeLabel}</td>
                    <td>{r.planLabel}{r.isTrial ? <> <Pill tone="br">sinov</Pill></> : null}</td>
                    <td className="sa-td-r">{r.price}</td>
                    <td><OrgStatusPill status={r.status} /></td>
                    <td>{r.expires}</td>
                    <td className="sa-td-r">
                      <Link href={`/super/organizations/${r.id}`} className="sa-btn sa-btn--tinted sa-btn--sm">Boshqarish</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Telefon: ixcham qatorlar — 2 qator ma'lumot, qolgani do'kon sahifasida */}
          <div className="sa-list-m ux-only-mobile">
            {shown.map((r) => (
              <Link key={r.id} href={`/super/organizations/${r.id}`} className="sa-cell sa-cell--av">
                <Avatar name={r.name} />
                <span className="sa-cell-t">
                  <b>{r.name}</b>
                  <small>{r.planLabel}{r.isTrial ? ' · sinov' : ''} · {r.price} · {r.expires}</small>
                </span>
                <OrgStatusPill status={r.status} />
                <Chevron />
              </Link>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
