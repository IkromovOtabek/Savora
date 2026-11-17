'use client';

import { useState } from 'react';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import { STATION_KINDS, type StationKind } from '@/lib/restaurant/types';
import type { RestaurantSetupView } from '@/lib/restaurant/queries';
import { deleteStationAction, saveStationAction } from '@/app/actions/restaurant';
import { useRun } from './useRun';

type Station = RestaurantSetupView['stations'][number];
type Draft = { id: string; name: string; kind: StationKind; printerIp: string };

/** Stansiyalar (Issiq sex, Bar…): qo'shish, tahrirlash, faol/nofaol, o'chirish */
export default function StationsManager({ stations, branchId }: { stations: Station[]; branchId: string }) {
  const d = useDict();
  const t = d.restaurant.settings;
  const kinds = d.restaurant.common.stationKinds;
  const { pending, run } = useRun();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<StationKind>('kitchen');
  const [edit, setEdit] = useState<Draft | null>(null);

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    run(() => saveStationAction({ name: name.trim(), kind, branchId }), { after: () => setName('') });
  }

  function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!edit || !edit.name.trim()) return;
    run(
      () => saveStationAction({ id: edit.id, name: edit.name.trim(), kind: edit.kind, printerIp: edit.printerIp.trim() }),
      { after: () => setEdit(null) },
    );
  }

  // Tahrirlashda printer IP ham yuboriladi — aks holda server uni o'chiradi
  const toggle = (s: Station) =>
    run(() => saveStationAction({ id: s.id, name: s.name, kind: s.kind, printerIp: s.printerIp ?? '', active: !s.active }));

  return (
    <section className="rs-card" aria-labelledby="rs-st-h">
      <div>
        <h2 className="rs-h" id="rs-st-h">{t.stations}</h2>
        <p className="rs-hint">{t.stationsHint}</p>
      </div>

      <form className="rs-inline rs-st-add" onSubmit={add}>
        <label className="rs-mini rs-mini--grow">
          <span>{t.stationName}</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t.stationNamePh} maxLength={60} disabled={pending} />
        </label>
        <fieldset className="rs-seg" disabled={pending}>
          <legend className="sr-only">{t.stationKind}</legend>
          {STATION_KINDS.map((k) => (
            <label key={k} className={kind === k ? 'is-on' : ''}>
              <input type="radio" name="rs-st-kind" value={k} checked={kind === k} onChange={() => setKind(k)} />
              {kinds[k]}
            </label>
          ))}
        </fieldset>
        <button type="submit" className="btn btn-primary btn-sm btn-with-icon rs-end" disabled={pending || !name.trim()}>
          <Icon name="plus" size={15} /> {t.addStation}
        </button>
      </form>

      {stations.length === 0 ? (
        <p className="rs-empty">{t.stationsEmpty}</p>
      ) : (
        <ul className="rs-list">
          {stations.map((s) =>
            edit?.id === s.id ? (
              <li key={s.id} className="rs-row is-editing">
                <form className="rs-st-edit" onSubmit={saveEdit} aria-label={`${d.common.edit}: ${s.name}`}>
                  <label className="rs-mini rs-mini--grow">
                    <span>{t.stationName}</span>
                    <input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} maxLength={60} autoFocus disabled={pending} />
                  </label>
                  <label className="rs-mini">
                    <span>{t.stationKind}</span>
                    <select className="input" value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value as StationKind })} disabled={pending}>
                      {STATION_KINDS.map((k) => <option key={k} value={k}>{kinds[k]}</option>)}
                    </select>
                  </label>
                  <label className="rs-mini">
                    <span>{t.printerIp}</span>
                    <input className="input" value={edit.printerIp} onChange={(e) => setEdit({ ...edit, printerIp: e.target.value })} placeholder="192.168.1.50" maxLength={64} inputMode="decimal" autoComplete="off" disabled={pending} aria-describedby="rs-st-ip-h" />
                  </label>
                  <small className="rs-hint rs-st-iph" id="rs-st-ip-h">{t.printerIpHint}</small>
                  <div className="rs-row-actions">
                    <button type="submit" className="btn btn-primary btn-sm" disabled={pending || !edit.name.trim()}>{d.common.save}</button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEdit(null)}>{d.common.cancel}</button>
                  </div>
                </form>
              </li>
            ) : (
              <li key={s.id} className={`rs-row${s.active ? '' : ' is-off'}`}>
                <span className={`rs-st-ic rs-st-ic--${s.kind}`} aria-hidden="true">
                  <Icon name={s.kind === 'bar' ? 'basket' : 'utensils'} size={18} />
                </span>
                <span className="rs-row-main">
                  <b>{s.name}</b>
                  <small>
                    {kinds[s.kind]}
                    {s.printerIp ? ` · ${s.printerIp}` : ''}
                  </small>
                </span>
                {!s.active && <span className="t-pill t-pill--warn">{d.common.inactive}</span>}
                <span className="rs-row-actions">
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => setEdit({ id: s.id, name: s.name, kind: s.kind, printerIp: s.printerIp ?? '' })}
                    aria-label={`${d.common.edit}: ${s.name}`}
                    title={d.common.edit}
                  >
                    <Icon name="edit" size={16} />
                  </button>
                  <button type="button" className="btn btn-sm btn-ghost" disabled={pending} onClick={() => toggle(s)} aria-label={`${s.active ? t.deactivate : t.activate}: ${s.name}`}>
                    {s.active ? t.deactivate : t.activate}
                  </button>
                  <button
                    type="button"
                    className="icon-btn icon-btn--danger"
                    disabled={pending}
                    aria-label={`${d.common.delete}: ${s.name}`}
                    title={d.common.delete}
                    onClick={() => {
                      if (confirm(tr(t.deleteStationConfirm, { name: s.name }))) {
                        run(() => deleteStationAction(s.id), { ok: (r) => (r.detached ? tr(t.stationDetached, { n: r.detached }) : t.deleted) });
                      }
                    }}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </span>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}
