'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import { fmtMoney } from '@/lib/format';
import type { MenuEditorItem, MenuEditorView } from '@/lib/restaurant/settingsExtra';
import type { ModifierGroupInput } from '@/lib/restaurant/types';
import { setStopListAction, updateMenuItemAction } from '@/app/actions/restaurant';
import ModifierGroupsEditor, { toDraft, validateGroups, type DraftGroup } from './ModifierGroupsEditor';
import { useRun } from './useRun';
import { parseMxikInput } from '@/lib/mxik';

type Filter = 'all' | 'stop' | 'noStation' | 'mods';
type Station = MenuEditorView['stations'][number];

interface Props {
  view: MenuEditorView;
  /** `product.edit` — stansiya, modifikator, MXIK */
  canEdit: boolean;
  /** `menu.stopList` */
  canStop: boolean;
}

/** Menyu: taomlar (kategoriya bo'yicha, qidiruv) — stansiya, modifikatorlar, MXIK, stop-list */
export default function MenuEditor({ view, canEdit, canStop }: Props) {
  const d = useDict();
  const t = d.restaurant.settings;
  const { pending, run } = useRun();
  const [items, setItems] = useState(view.items);
  const [q, setQ] = useState('');
  const query = useDeferredValue(q.trim().toLowerCase());
  const [cat, setCat] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<string | null>(null);

  const patch = (id: string, p: Partial<MenuEditorItem>) => setItems((list) => list.map((i) => (i.id === id ? { ...i, ...p } : i)));

  const counts = useMemo(() => ({
    all: items.length,
    stop: items.filter((i) => i.stopListed).length,
    noStation: items.filter((i) => !i.stationId).length,
    mods: items.filter((i) => i.modifierGroups.length > 0).length,
  }), [items]);

  const groups = useMemo(() => {
    const list = items.filter((i) => {
      if (query && !i.name.toLowerCase().includes(query)) return false;
      if (cat && (cat === '\u0000' ? i.category : i.category !== cat)) return false;
      if (filter === 'stop' && !i.stopListed) return false;
      if (filter === 'noStation' && i.stationId) return false;
      if (filter === 'mods' && !i.modifierGroups.length) return false;
      return true;
    });
    const byCat = new Map<string, MenuEditorItem[]>();
    for (const i of list) {
      const k = i.category ?? '';
      byCat.set(k, [...(byCat.get(k) ?? []), i]);
    }
    return [...byCat.entries()].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
  }, [items, query, cat, filter]);

  if (!items.length) {
    return (
      <section className="rs-card">
        <p className="rs-empty">{t.menuEmpty}</p>
        <Link href="/app/products/new" className="btn btn-sm btn-tinted btn-with-icon rs-center">
          <Icon name="plus" size={15} /> {d.common.add}
        </Link>
      </section>
    );
  }

  const setStation = (item: MenuEditorItem, stationId: string) =>
    run(() => updateMenuItemAction({ productId: item.id, stationId: stationId || null }), {
      refresh: false,
      after: () => patch(item.id, { stationId: stationId || null }),
    });

  const toggleStop = (item: MenuEditorItem) =>
    run(() => setStopListAction({ productId: item.id, stopped: !item.stopListed }), {
      refresh: false,
      after: (r) => patch(item.id, { stopListed: r.stopListed }),
    });

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: t.filterAll },
    { key: 'stop', label: t.filterStop },
    { key: 'noStation', label: t.filterNoStation },
    { key: 'mods', label: t.filterMods },
  ];

  return (
    <div className="rs-stack">
      <section className="rs-card rs-menu-tools" aria-label={d.common.filter}>
        <p className="rs-hint">{t.menuHint}</p>
        {!canEdit && <p className="t-note t-note--warn rs-note">{t.noEditPerm}</p>}
        {view.stations.length === 0 && (
          <p className="rs-hint">
            {t.stationsHint}{' '}
            <Link href={`/app/restaurant/stations?branch=${view.branchId}`} className="t-link">{t.noStationsLink}</Link>
          </p>
        )}
        <div className="rs-menu-filters">
          <input
            type="search"
            className="input rs-menu-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.menuSearchPh}
            aria-label={d.common.search}
          />
          <select className="input rs-menu-cat" value={cat} onChange={(e) => setCat(e.target.value)} aria-label={t.allCategories}>
            <option value="">{t.allCategories}</option>
            {view.categories.map((c) => <option key={c} value={c}>{c}</option>)}
            {items.some((i) => !i.category) && <option value={'\u0000'}>{t.noCategory}</option>}
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
                  stations={view.stations}
                  open={openId === item.id}
                  onToggleOpen={() => setOpenId(openId === item.id ? null : item.id)}
                  pending={pending}
                  canEdit={canEdit}
                  canStop={canStop}
                  onStation={(sid) => setStation(item, sid)}
                  onStop={() => toggleStop(item)}
                  onSave={(ikpu, groups) =>
                    run(() => updateMenuItemAction({ productId: item.id, ikpu: ikpu || null, modifierGroups: groups }), {
                      refresh: false,
                      after: () => {
                        patch(item.id, {
                          ikpu: ikpu || null,
                          modifierGroups: groups.map((g, gi) => ({
                            id: `${item.id}-${gi}`,
                            ...g,
                            options: g.options.map((o, oi) => ({ id: `${item.id}-${gi}-${oi}`, ...o })),
                          })),
                        });
                        setOpenId(null);
                      },
                    })
                  }
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

interface RowProps {
  item: MenuEditorItem;
  stations: Station[];
  open: boolean;
  onToggleOpen: () => void;
  pending: boolean;
  canEdit: boolean;
  canStop: boolean;
  onStation: (stationId: string) => void;
  onStop: () => void;
  onSave: (ikpu: string, groups: ModifierGroupInput[]) => void;
}

function DishRow({ item, stations, open, onToggleOpen, pending, canEdit, canStop, onStation, onStop, onSave }: RowProps) {
  const d = useDict();
  const t = d.restaurant.settings;
  const k = d.restaurant.kitchen;
  const panelId = `rs-dish-${item.id}`;
  // Nofaol stansiya ro'yxatda faqat shu taomga biriktirilgan bo'lsa ko'rinadi
  const options = stations.filter((s) => s.active || s.id === item.stationId);

  return (
    <li className={`rs-dish${item.stopListed ? ' is-stop' : ''}${open ? ' is-open' : ''}`}>
      <div className="rs-dish-row">
        <span className="rs-dish-img" aria-hidden="true">
          {item.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.photoUrl} alt="" loading="lazy" />
          ) : (
            <Icon name="utensils" size={18} />
          )}
        </span>
        <span className="rs-dish-t">
          <b>{item.name}</b>
          <small>
            {fmtMoney(item.price)} {d.common.sum}
            {item.modifierGroups.length > 0 && <> · {tr(t.modsCount, { n: item.modifierGroups.length })}</>}
            {item.ikpu && <> · {t.ikpu}: {item.ikpu}</>}
          </small>
        </span>
        <span className="rs-dish-flags">
          {item.stopListed && <span className="t-pill t-pill--bad">{t.filterStop}</span>}
          {item.available === 0 && !item.stopListed && <span className="t-pill t-pill--warn">{t.outOfStock}</span>}
        </span>
        <span className="rs-dish-ctrl">
          {stations.length > 0 && (
            <select
              className="input rs-dish-station"
              value={item.stationId ?? ''}
              onChange={(e) => onStation(e.target.value)}
              disabled={pending || !canEdit}
              aria-label={tr(t.stationFor, { name: item.name })}
            >
              <option value="">{d.restaurant.common.noStation}</option>
              {options.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.active ? '' : ` (${d.common.inactive.toLowerCase()})`}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            className={`rs-stop${item.stopListed ? ' is-on' : ''}`}
            aria-pressed={item.stopListed}
            disabled={pending || !canStop}
            onClick={onStop}
            title={item.stopListed ? k.stopOff : k.stopOn}
            aria-label={`${item.stopListed ? k.stopOff : k.stopOn}: ${item.name}`}
          >
            <span className="rs-stop-dot" aria-hidden="true" />
            {t.stopList}
          </button>
          {canEdit && (
            <button type="button" className="btn btn-sm btn-ghost" aria-expanded={open} aria-controls={panelId} onClick={onToggleOpen}>
              {t.configure}
            </button>
          )}
        </span>
      </div>
      {open && canEdit && <DishPanel id={panelId} item={item} pending={pending} onCancel={onToggleOpen} onSave={onSave} />}
    </li>
  );
}

function DishPanel({ id, item, pending, onCancel, onSave }: { id: string; item: MenuEditorItem; pending: boolean; onCancel: () => void; onSave: RowProps['onSave'] }) {
  const d = useDict();
  const t = d.restaurant.settings;
  const [ikpu, setIkpu] = useState(item.ikpu ?? '');
  const [groups, setGroups] = useState<DraftGroup[]>(() => toDraft(item.modifierGroups));
  const [err, setErr] = useState<{ msg: string; key?: string } | null>(null);
  const ikpuOk = parseMxikInput(ikpu) !== null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ikpuOk) {
      setErr({ msg: t.ikpuBad });
      return;
    }
    const v = validateGroups(groups);
    if (!v.ok) {
      setErr({ msg: t[v.error], key: v.groupKey });
      return;
    }
    setErr(null);
    onSave(parseMxikInput(ikpu) ?? '', v.groups);
  }

  return (
    <form id={id} className="rs-dish-panel" onSubmit={submit} noValidate>
      <div className="rs-dish-panel-grid">
        <div className="auth-field">
          <label htmlFor={`${id}-ikpu`}>{t.ikpu}</label>
          <input
            id={`${id}-ikpu`}
            value={ikpu}
            onChange={(e) => setIkpu(e.target.value.replace(/[^\d\s]/g, ''))}
            inputMode="numeric"
            maxLength={40}
            autoComplete="off"
            placeholder="10202001001000000"
            aria-invalid={!ikpuOk}
            aria-describedby={`${id}-ikpu-h`}
            disabled={pending}
          />
          <small className={ikpuOk ? 'rs-hint' : 'rs-error'} id={`${id}-ikpu-h`}>{ikpuOk ? t.ikpuHint : t.ikpuBad}</small>
        </div>
        <div className="rs-recipe">
          <span className="rs-label">{t.recipe}</span>
          <Link href={`/app/products/${item.id}`} className="btn btn-sm btn-ghost btn-with-icon">
            <Icon name="clipboard" size={15} /> {item.name}
          </Link>
          <small className="rs-hint">{t.recipeHint}</small>
        </div>
      </div>

      <div className="rs-mods-wrap">
        <span className="rs-label">{t.modifiers}</span>
        <small className="rs-hint">{t.modifiersHint}</small>
        <ModifierGroupsEditor value={groups} onChange={(g) => { setGroups(g); setErr(null); }} disabled={pending} errorKey={err?.key} />
      </div>

      {err && <p className="rs-error" role="alert">{err.msg}</p>}
      <div className="rs-row-actions">
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>{pending ? d.common.saving : d.common.save}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>{d.common.cancel}</button>
      </div>
    </form>
  );
}
