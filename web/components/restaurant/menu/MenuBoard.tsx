'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import { fmtMoney } from '@/lib/format';
import { fmtQty } from '@/lib/qty';
import type { MenuAdminView, MenuRow } from '@/lib/restaurant/menuAdmin';
import { setStopListAction, updateMenuItemAction } from '@/app/actions/restaurant';
import { setMenuMembershipAction } from '@/app/actions/menu';
import BranchPicker from '@/components/restaurant/settings/BranchPicker';
import { useRun } from '@/components/restaurant/settings/useRun';
import { searchKey } from './RecipeEditor';

type Filter = 'all' | 'stop' | 'noRecipe' | 'soldOut' | 'hidden';
/** Foyda shundan past bo'lsa — ogohlantirish rangi */
const LOW_MARGIN = 30;

const isNoRecipe = (i: MenuRow) => i.type === 'service' || (i.type === 'dish' && i.recipeCount === 0);

/**
 * Menyu (/app/menu): kategoriyalar bo'yicha taomlar — rasm, narx, porsiya (retsept xom ashyosidan), tannarx va
 * foyda (product.viewCost), stansiya, stop-list; qidiruv va filtrlar; menyudan olish/qaytarish.
 */
export default function MenuBoard({ view }: { view: MenuAdminView }) {
  const d = useDict();
  const t = d.menu;
  const { pending, run } = useRun();
  const [items, setItems] = useState(view.items);
  const [hidden, setHidden] = useState(view.hidden);
  const [q, setQ] = useState('');
  const query = useDeferredValue(searchKey(q));
  const [cat, setCat] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const { can } = view;
  const stationName = useMemo(() => new Map(view.stations.map((s) => [s.id, s.name])), [view.stations]);

  const patch = (id: string, p: Partial<MenuRow>) => setItems((list) => list.map((i) => (i.id === id ? { ...i, ...p } : i)));

  const counts: Record<Filter, number> = useMemo(() => ({
    all: items.length,
    stop: items.filter((i) => i.stopListed).length,
    noRecipe: items.filter(isNoRecipe).length,
    soldOut: items.filter((i) => i.portions === 0).length,
    hidden: hidden.length,
  }), [items, hidden]);

  const groups = useMemo(() => {
    const source = filter === 'hidden' ? hidden : items;
    const list = source.filter((i) => {
      if (query && !searchKey(i.name).includes(query)) return false;
      if (cat && (cat === '\u0000' ? i.category : i.category !== cat)) return false;
      if (filter === 'stop' && !i.stopListed) return false;
      if (filter === 'noRecipe' && !isNoRecipe(i)) return false;
      if (filter === 'soldOut' && i.portions !== 0) return false;
      return true;
    });
    const byCat = new Map<string, MenuRow[]>();
    for (const i of list) byCat.set(i.category ?? '', [...(byCat.get(i.category ?? '') ?? []), i]);
    return [...byCat.entries()].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
  }, [items, hidden, query, cat, filter]);

  const toggleStop = (item: MenuRow) =>
    run(() => setStopListAction({ productId: item.id, stopped: !item.stopListed }), {
      refresh: false,
      after: (r) => patch(item.id, { stopListed: r.stopListed }),
    });

  const setStation = (item: MenuRow, stationId: string) =>
    run(() => updateMenuItemAction({ productId: item.id, stationId: stationId || null }), {
      refresh: false,
      after: () => patch(item.id, { stationId: stationId || null }),
    });

  const remove = (item: MenuRow) => {
    if (!confirm(tr(item.type === 'goods' ? t.removeConfirmGoods : t.removeConfirmDish, { name: item.name }))) return;
    run(() => setMenuMembershipAction({ productId: item.id, inMenu: false }), {
      refresh: false,
      ok: tr(t.removed, { name: item.name }),
      after: () => {
        setItems((list) => list.filter((i) => i.id !== item.id));
        // Tovar omborga qaytadi; taom/xizmat — «Menyudan olingan» ro'yxatiga
        if (item.type !== 'goods') setHidden((list) => [...list, item].sort((a, b) => a.name.localeCompare(b.name)));
      },
    });
  };

  const restore = (item: MenuRow) =>
    run(() => setMenuMembershipAction({ productId: item.id, inMenu: true }), {
      refresh: false,
      ok: tr(t.restored, { name: item.name }),
      after: () => {
        setHidden((list) => list.filter((i) => i.id !== item.id));
        setItems((list) => [...list, item]);
      },
    });

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: t.filters.all },
    { key: 'stop', label: t.filters.stop },
    { key: 'noRecipe', label: t.filters.noRecipe },
    { key: 'soldOut', label: t.filters.soldOut },
    ...(counts.hidden > 0 || filter === 'hidden' ? [{ key: 'hidden' as const, label: t.filters.hidden }] : []),
  ];
  const branchQ = view.branches.length > 1 ? `?branch=${view.branchId}` : '';

  return (
    <div className="rs-stack mn-board">
      <BranchPicker branches={view.branches} value={view.branchId} />
      {!view.flags && <p className="t-note t-note--warn rs-note" role="status">{t.legacy}</p>}

      {items.length === 0 && hidden.length === 0 ? (
        <section className="rs-card mn-empty">
          <span className="ux-empty-ic" aria-hidden="true"><Icon name="utensils" size={26} /></span>
          <b>{t.empty}</b>
          <p className="rs-hint">{t.emptyHint}</p>
          {can.create && (
            <Link href={`/app/menu/new${branchQ}`} className="btn btn-primary btn-with-icon">
              <Icon name="plus" size={18} /> {t.addDish}
            </Link>
          )}
        </section>
      ) : (
        <>
          <section className="rs-card rs-menu-tools" aria-label={d.common.filter}>
            {!can.edit && <p className="t-note t-note--warn rs-note">{t.noEditPerm}</p>}
            {can.edit && view.stations.length === 0 && (
              <p className="rs-hint">
                {t.noStations}{' '}
                <Link href={`/app/restaurant/stations?branch=${view.branchId}`} className="t-link">{t.noStationsLink}</Link>
              </p>
            )}
            <div className="rs-menu-filters">
              <input
                type="search"
                className="input rs-menu-search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t.searchPh}
                aria-label={d.common.search}
              />
              <select className="input rs-menu-cat" value={cat} onChange={(e) => setCat(e.target.value)} aria-label={t.allCategories}>
                <option value="">{t.allCategories}</option>
                {view.categories.map((c) => <option key={c} value={c}>{c}</option>)}
                {[...items, ...hidden].some((i) => !i.category) && <option value={'\u0000'}>{t.noCategory}</option>}
              </select>
            </div>
            <div className="rs-chips" role="group" aria-label={d.common.filter}>
              {filters.map((f) => (
                <button key={f.key} type="button" className={`rs-chip${filter === f.key ? ' is-on' : ''}`} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
                  <span>{f.label}</span>
                  <small>{counts[f.key]}</small>
                </button>
              ))}
            </div>
            {filter === 'hidden' && <p className="rs-hint">{t.hiddenHint}</p>}
          </section>

          {groups.length === 0 ? (
            <p className="rs-empty">{d.common.nothingFound}</p>
          ) : (
            groups.map(([category, list]) => (
              <section key={category || '-'} className="rs-card rs-menu-group" aria-label={category || t.noCategory}>
                <h2 className="rs-menu-cat-h">
                  {category || t.noCategory} <span className="rs-muted">{list.length}</span>
                </h2>
                <ul className="rs-dishes">
                  {list.map((item) => (
                    <DishRow
                      key={item.id}
                      item={item}
                      hiddenMode={filter === 'hidden'}
                      stations={view.stations}
                      stationName={item.stationId ? stationName.get(item.stationId) ?? null : null}
                      pending={pending}
                      can={can}
                      onStop={() => toggleStop(item)}
                      onStation={(sid) => setStation(item, sid)}
                      onRemove={() => remove(item)}
                      onRestore={() => restore(item)}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}
        </>
      )}
    </div>
  );
}

interface RowProps {
  item: MenuRow;
  hiddenMode: boolean;
  stations: MenuAdminView['stations'];
  stationName: string | null;
  pending: boolean;
  can: MenuAdminView['can'];
  onStop: () => void;
  onStation: (stationId: string) => void;
  onRemove: () => void;
  onRestore: () => void;
}

function DishRow({ item, hiddenMode, stations, stationName, pending, can, onStop, onStation, onRemove, onRestore }: RowProps) {
  const d = useDict();
  const t = d.menu;
  const k = d.restaurant.kitchen;
  const options = stations.filter((s) => s.active || s.id === item.stationId);
  const meta: string[] = [t.types[item.type]];
  if (item.type === 'dish') meta.push(item.recipeCount ? tr(t.recipeN, { n: item.recipeCount }) : t.recipeEmpty);
  if (item.modifierCount) meta.push(tr(t.modsN, { n: item.modifierCount }));
  if (!can.edit || !stations.length) meta.push(stationName ?? d.restaurant.common.noStation);

  return (
    <li className={`rs-dish mn-row${item.stopListed ? ' is-stop' : ''}`}>
      <div className="rs-dish-row">
        <span className="rs-dish-img" aria-hidden="true">
          {item.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.photoUrl} alt="" loading="lazy" />
          ) : (
            <Icon name={item.type === 'goods' ? 'box' : 'utensils'} size={18} />
          )}
        </span>
        <span className="rs-dish-t">
          <b>{item.name}</b>
          <small>
            <span className="mn-price">{fmtMoney(item.price)} {d.common.sum}</span> · {meta.join(' · ')}
          </small>
          {item.cost !== null && (
            <small className="mn-cost">
              {tr(t.cost, { sum: fmtMoney(item.cost) })}
              {item.margin !== null && (
                <>
                  {' · '}
                  <span className={item.margin < LOW_MARGIN ? 'mn-low' : 'mn-good'} title={item.margin < LOW_MARGIN ? t.marginLow : undefined}>
                    {tr(t.margin, { pct: fmtQty(item.margin) })}
                  </span>
                </>
              )}
            </small>
          )}
        </span>
        <span className="rs-dish-flags">
          {item.stopListed && <span className="t-pill t-pill--bad">{t.filters.stop}</span>}
          {item.portions === 0 ? (
            <span className="t-pill t-pill--warn">{t.soldOut}</span>
          ) : item.portions !== null ? (
            <span className="t-pill t-pill--ok mn-portions">
              {item.type === 'goods' ? tr(t.left, { qty: fmtQty(item.portions) }) : tr(t.portions, { n: item.portions })}
            </span>
          ) : (
            <span className="t-pill mn-pill-muted">{t.noRecipe}</span>
          )}
        </span>
        <span className="rs-dish-ctrl">
          {hiddenMode ? (
            can.edit && (
              <button type="button" className="btn btn-sm btn-tinted" disabled={pending} onClick={onRestore}>{t.restore}</button>
            )
          ) : (
            <>
              {can.edit && stations.length > 0 && (
                <select
                  className="input rs-dish-station"
                  value={item.stationId ?? ''}
                  onChange={(e) => onStation(e.target.value)}
                  disabled={pending}
                  aria-label={tr(t.stationFor, { name: item.name })}
                >
                  <option value="">{d.restaurant.common.noStation}</option>
                  {options.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}{s.active ? '' : ` (${d.common.inactive.toLowerCase()})`}</option>
                  ))}
                </select>
              )}
              {can.stop && (
                <button
                  type="button"
                  className={`rs-stop${item.stopListed ? ' is-on' : ''}`}
                  aria-pressed={item.stopListed}
                  disabled={pending}
                  onClick={onStop}
                  title={item.stopListed ? k.stopOff : k.stopOn}
                  aria-label={`${item.stopListed ? k.stopOff : k.stopOn}: ${item.name}`}
                >
                  <span className="rs-stop-dot" aria-hidden="true" />
                  {d.restaurant.settings.stopList}
                </button>
              )}
              {can.edit && (
                <>
                  <Link href={`/app/menu/${item.id}`} className="btn btn-sm btn-ghost" aria-label={tr(t.editFor, { name: item.name })}>
                    {t.edit}
                  </Link>
                  <button type="button" className="btn btn-sm btn-plain mn-remove" disabled={pending} onClick={onRemove} title={t.remove} aria-label={`${t.remove}: ${item.name}`}>
                    <Icon name="close" size={16} />
                  </button>
                </>
              )}
            </>
          )}
        </span>
      </div>
    </li>
  );
}
