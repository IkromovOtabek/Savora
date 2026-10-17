'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
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

const FILTERS: Filter[] = ['all', 'active', 'trial', 'expired'];

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
  const d = useDict();
  const s = d.superPanel.orgList;
  const [q, setQ] = useState('');
  // ?f=expired kabi havoladan (Asosiy paneldagi «Diqqat talab qiladi») boshlang'ich filtr
  const [f, setF] = useState<Filter>(FILTERS.some((x) => x === initialFilter) ? (initialFilter as Filter) : 'all');

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: rows.length, active: 0, trial: 0, expired: 0 };
    for (const r of rows) for (const x of FILTERS) if (x !== 'all' && matches(r, x)) c[x]++;
    return c;
  }, [rows]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => matches(r, f) && (!needle
      || r.name.toLowerCase().includes(needle)
      || r.slug.toLowerCase().includes(needle)
      || r.ownerName.toLowerCase().includes(needle)));
  }, [rows, q, f]);

  // Holat nomi — joriy tildan (serverdan kelgan label o'rniga)
  const statusOf = (r: OrgListRow) => ({ key: r.status.key, label: d.superPanel.status[r.status.key] });

  return (
    <section className="sa-card">
      <div className="sa-card-h sa-list-h">
        <div>
          <h2>{s.title}</h2>
          <p>{shown.length === rows.length ? tr(s.nBiz, { n: rows.length }) : tr(s.nOfBiz, { n: shown.length, total: rows.length })}</p>
        </div>
        <div className="sa-list-tools">
          <div className="sa-searchbox">
            <Icon name="search" size={16} />
            <label htmlFor="org-q" className="sr-only">{s.searchLabel}</label>
            <input
              id="org-q"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={s.searchPlaceholder}
              autoComplete="off"
            />
          </div>
          <div className="sa-seg sa-seg--scroll ux-scrollx" role="group" aria-label={s.filterAria}>
            {FILTERS.map((x) => (
              <button key={x} type="button" aria-pressed={f === x} onClick={() => setF(x)}>
                {s.filters[x]} <span className="sa-seg-n">{counts[x]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="ux-empty">
          <span className="ux-empty-ic"><Icon name="search" size={24} /></span>
          <b>{d.common.nothingFound}</b>
          <p>{s.notFoundHint}</p>
          <button type="button" className="sa-btn sa-btn--tinted sa-btn--sm" onClick={() => { setQ(''); setF('all'); }}>
            {s.clearFilter}
          </button>
        </div>
      ) : (
        <>
          <div className="sa-table-wrap ux-hide-mobile">
            <table className="sa-table">
              <thead>
                <tr>
                  <th>{s.colStore}</th>
                  <th>{s.colType}</th>
                  <th>{s.colPlan}</th>
                  <th className="sa-td-r">{s.colPrice}</th>
                  <th>{s.colStatus}</th>
                  <th>{s.colExpires}</th>
                  <th aria-label={d.common.actions} />
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
                    <td>{r.planLabel}{r.isTrial ? <> <Pill tone="br">{d.superPanel.trial}</Pill></> : null}</td>
                    <td className="sa-td-r">{r.price}</td>
                    <td><OrgStatusPill status={statusOf(r)} /></td>
                    <td>{r.expires}</td>
                    <td className="sa-td-r">
                      <Link href={`/super/organizations/${r.id}`} className="sa-btn sa-btn--tinted sa-btn--sm">{s.manage}</Link>
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
                  <small>{r.planLabel}{r.isTrial ? ` · ${d.superPanel.trial}` : ''} · {r.price} · {r.expires}</small>
                </span>
                <OrgStatusPill status={statusOf(r)} />
                <Chevron />
              </Link>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
