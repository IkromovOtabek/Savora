'use client';

import { useMemo, useState } from 'react';
import { fmtMoney } from '@/lib/format';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import { isFractionalUnit, parseQty, priceTimesQty } from '@/lib/qty';
import type { MenuItemView } from '@/lib/restaurant/queries';
import Modal, { QtyStepper } from './Modal';

type Group = MenuItemView['modifierGroups'][number];

/** Guruh chegarasi — serverdagi resolveModifiers bilan bir xil (majburiy → kamida 1) */
export function groupRule(g: Pick<Group, 'required' | 'min' | 'max'>): { min: number; max: number } {
  return { min: g.required ? Math.max(1, g.min) : Math.max(0, g.min), max: Math.max(1, g.max) };
}

export interface PickedDish {
  optionIds: string[];
  mods: string[];
  extra: number;
  qty: number;
  note: string;
}

/**
 * Modifikator dialogi: guruhlar (majburiy / min–max), variant narx qo'shimchasi, miqdor, izoh.
 * max = 1 — radio, aks holda checkbox (max'ga yetganda qolganlari o'chadi). Narxni server qayta hisoblaydi.
 */
export default function ModifierDialog({ item, onClose, onAdd }: {
  item: MenuItemView;
  onClose: () => void;
  onAdd: (p: PickedDish) => void;
}) {
  const d = useDict();
  const k = d.restaurant.order;
  const [sel, setSel] = useState<Record<string, string[]>>(() => {
    // Majburiy, bitta tanlovli va bitta variantli guruh — oldindan tanlangan
    const init: Record<string, string[]> = {};
    for (const g of item.modifierGroups) if (groupRule(g).min >= 1 && g.options.length === 1) init[g.id] = [g.options[0].id];
    return init;
  });
  const [qty, setQty] = useState(1);
  const [qtyText, setQtyText] = useState('1');
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const fractional = isFractionalUnit(item.unit);

  const missing = item.modifierGroups.filter((g) => {
    const n = sel[g.id]?.length ?? 0;
    const r = groupRule(g);
    return n < r.min || n > r.max;
  });
  const picked = useMemo(() => item.modifierGroups.flatMap((g) => g.options.filter((o) => sel[g.id]?.includes(o.id))), [item.modifierGroups, sel]);
  const extra = picked.reduce((s, o) => s + Math.max(0, o.price), 0);
  const unit = item.price + extra;
  const qtyOk = fractional ? parseQty(qtyText, item.unit) !== null : qty >= 1;
  const valid = missing.length === 0 && qtyOk;

  function toggle(g: Group, optId: string) {
    const r = groupRule(g);
    setSel((s) => {
      const cur = s[g.id] ?? [];
      if (r.max === 1) {
        // Radio: ixtiyoriy guruhda qayta bosish — bekor
        return { ...s, [g.id]: cur[0] === optId && r.min === 0 ? [] : [optId] };
      }
      if (cur.includes(optId)) return { ...s, [g.id]: cur.filter((x) => x !== optId) };
      if (cur.length >= r.max) return s;
      // Variantlar tartibi mahsulotdagidek qolsin (chek nomi barqaror)
      const next = g.options.map((o) => o.id).filter((id) => id === optId || cur.includes(id));
      return { ...s, [g.id]: next };
    });
  }

  function hint(g: Group): string {
    const r = groupRule(g);
    if (r.max === 1) return r.min === 1 ? k.pickOne : d.common.optional;
    if (r.min === 0) return tr(k.pickUpTo, { n: r.max });
    if (r.min === r.max) return tr(k.pickExactly, { n: r.min });
    return tr(k.pickRange, { min: r.min, max: r.max });
  }

  function submit() {
    setTried(true);
    if (!valid) return;
    const q = fractional ? parseQty(qtyText, item.unit)! : qty;
    onAdd({ optionIds: picked.map((o) => o.id), mods: picked.map((o) => o.name), extra, qty: q, note: note.trim() });
  }

  const effQty = fractional ? parseQty(qtyText, item.unit) ?? 0 : qty;

  return (
    <Modal
      title={item.name}
      onClose={onClose}
      className="rt-mod"
      footer={(
        <>
          <QtyStepper
            value={qty}
            onChange={(n) => { setQty(n); setQtyText(String(n)); }}
            min={1}
            max={1000}
            label={k.qty}
            decLabel={k.qtyDec}
            incLabel={k.qtyInc}
            fractional={fractional}
            text={qtyText}
            onText={(s) => { setQtyText(s); const n = parseQty(s, item.unit); if (n !== null) setQty(n); }}
          />
          <button type="button" className="btn btn-primary rt-mod-add" onClick={submit} aria-disabled={!valid || undefined}>
            <span>{k.addToCart}</span>
            <b>{fmtMoney(priceTimesQty(unit, effQty))} {d.common.sum}</b>
          </button>
        </>
      )}
    >
      <form className="rt-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        {item.modifierGroups.map((g) => {
          const r = groupRule(g);
          const radio = r.max === 1;
          const cur = sel[g.id] ?? [];
          const bad = tried && missing.includes(g);
          return (
            <fieldset key={g.id} className={`rt-mgroup${bad ? ' is-bad' : ''}`} aria-describedby={`rt-mg-${g.id}`}>
              <legend>
                <b>{g.name}</b>
                <span className={`rt-tag${r.min > 0 ? ' rt-tag--req' : ''}`}>{r.min > 0 ? k.required : d.common.optional}</span>
              </legend>
              <small id={`rt-mg-${g.id}`} className={bad ? 'rt-bad' : 'rt-muted'}>{hint(g)}</small>
              <div className="rt-mopts">
                {g.options.map((o) => {
                  const on = cur.includes(o.id);
                  const full = !radio && !on && cur.length >= r.max;
                  return (
                    <label key={o.id} className={`rt-mopt${on ? ' is-on' : ''}${full ? ' is-full' : ''}`}>
                      <input
                        type={radio ? 'radio' : 'checkbox'}
                        name={`rt-mg-${g.id}`}
                        checked={on}
                        disabled={full}
                        onChange={() => toggle(g, o.id)}
                        onClick={(e) => { if (radio && on && r.min === 0) { e.preventDefault(); toggle(g, o.id); } }}
                      />
                      <span>{o.name}</span>
                      {o.price > 0 && <small>+{fmtMoney(o.price)}</small>}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
        <label className="rt-label" htmlFor="rt-mod-note">{k.note}</label>
        <input
          id="rt-mod-note"
          className="input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={200}
          placeholder={k.notePh}
          autoComplete="off"
        />
        {tried && missing.length > 0 && (
          <p className="rt-bad" role="alert">{tr(k.pickMissing, { group: missing.map((g) => g.name).join(', ') })}</p>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
