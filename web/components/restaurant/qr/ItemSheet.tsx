'use client';

import { useState } from 'react';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import { itemTotal } from '@/lib/restaurant/bill';
import { MAX_QTY, NOTE_MAX, firstInvalidGroup, groupBounds, orderedOptionIds, unitPrice, type MenuItem, type ModGroup } from './cart';
import Stepper from './Stepper';

/**
 * Taom oynasi: rasm, narx, modifikator guruhlari (majburiy / min–max, narx qo'shimchasi), miqdor, izoh.
 * Majburiy guruh to'ldirilmaguncha «Savatga qo'shish» o'chiq va qaysi guruh qolganini aytadi.
 */
export default function ItemSheet({
  item,
  money,
  priceSuffix,
  onAdd,
  onClose,
}: {
  item: MenuItem;
  money: (n: number) => string;
  priceSuffix: string;
  onAdd: (line: { productId: string; qty: number; optionIds: string[]; note: string }) => void;
  onClose: () => void;
}) {
  const d = useDict();
  const q = d.restaurant.qrMenu;
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const [photoOk, setPhotoOk] = useState(!!item.photoUrl);

  const optionIds = orderedOptionIds(item, selected);
  const invalid = firstInvalidGroup(item, selected);
  const total = itemTotal({ price: unitPrice(item, optionIds), qty });
  const titleId = `qm-item-title-${item.id}`;

  function toggle(g: ModGroup, id: string) {
    const { min, max } = groupBounds(g);
    setSelected((prev) => {
      const cur = prev[g.id] ?? [];
      let next: string[];
      if (max === 1) next = cur.includes(id) ? (min >= 1 ? cur : []) : [id];
      else if (cur.includes(id)) next = cur.filter((x) => x !== id);
      else next = cur.length < max ? [...cur, id] : cur;
      return { ...prev, [g.id]: next };
    });
  }

  function hint(g: ModGroup): string {
    const { min, max } = groupBounds(g);
    if (max === 1) return min === 1 ? q.pickOne : tr(q.pickUpTo, { max });
    if (min === max) return tr(q.pickExactly, { n: min });
    if (min > 0) return tr(q.pickRange, { min, max });
    return tr(q.pickUpTo, { max });
  }

  return (
    <>
      <div className="qm-sheet-scroll">
        {photoOk && item.photoUrl ? (
          <div className="qm-dish-photo-wrap">
            {/* eslint-disable-next-line @next/next/no-img-element -- tashqi (R2/CDN) rasm, next/image remotePatterns sozlanmagan */}
            <img className="qm-dish-photo" src={item.photoUrl} alt="" decoding="async" onError={() => setPhotoOk(false)} />
            <button type="button" className="qm-close qm-close--float" onClick={onClose} aria-label={d.common.close}>
              <Icon name="close" size={20} />
            </button>
          </div>
        ) : null}
        <div className="qm-sheet-head">
          <h2 className="qm-sheet-title" id={titleId}>{item.name}</h2>
          {!(photoOk && item.photoUrl) ? (
            <button type="button" className="qm-close" onClick={onClose} aria-label={d.common.close}>
              <Icon name="close" size={20} />
            </button>
          ) : null}
        </div>
        <p className="qm-dish-price">{money(item.price)}{priceSuffix}</p>

        {item.modifierGroups.map((g) => {
          const { min, max } = groupBounds(g);
          const picked = selected[g.id] ?? [];
          const radio = max === 1 && min === 1;
          return (
            <fieldset className="qm-group" key={g.id}>
              <legend className="qm-group-title">
                <span>{g.name}</span>
                <span className={min > 0 ? 'qm-badge qm-badge--req' : 'qm-badge'}>{min > 0 ? q.required : q.optional}</span>
              </legend>
              <p className="qm-group-hint">{hint(g)}</p>
              {g.options.map((o) => {
                const checked = picked.includes(o.id);
                const disabled = max > 1 && !checked && picked.length >= max;
                return (
                  <label className={`qm-opt${disabled ? ' is-disabled' : ''}`} key={o.id}>
                    <input
                      type={radio ? 'radio' : 'checkbox'}
                      name={`qm-g-${g.id}`}
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggle(g, o.id)}
                    />
                    <span className="qm-opt-name">{o.name}</span>
                    {o.price > 0 ? <span className="qm-opt-price">+{money(o.price)}</span> : null}
                  </label>
                );
              })}
            </fieldset>
          );
        })}

        <div className="qm-qty-row">
          <span className="qm-label" id={`${titleId}-qty`}>{q.qty}</span>
          <Stepper value={qty} min={1} max={MAX_QTY} onChange={setQty} labelledBy={`${titleId}-qty`} />
        </div>
        {qty >= MAX_QTY ? <p className="qm-hint qm-pad">{tr(q.maxQty, { n: MAX_QTY })}</p> : null}

        <div className="qm-field">
          <label className="qm-label" htmlFor={`${titleId}-note`}>{q.note}</label>
          <textarea
            id={`${titleId}-note`}
            className="qm-textarea"
            value={note}
            maxLength={NOTE_MAX}
            rows={2}
            placeholder={q.notePlaceholder}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>
      <div className="qm-sheet-foot">
        <button
          type="button"
          className="qm-btn qm-btn--brand"
          disabled={!!invalid}
          onClick={() => onAdd({ productId: item.id, qty, optionIds, note: note.trim() })}
        >
          {invalid ? tr(q.pickGroup, { group: invalid }) : (
            <>
              <span>{q.addToCart}</span>
              <span className="qm-btn-sum">{money(total)}</span>
            </>
          )}
        </button>
      </div>
    </>
  );
}
