'use client';

import { useId } from 'react';
import Icon from '@/components/icons/Icon';
import PriceInput from '@/components/ui/PriceInput';
import { useDict } from '@/lib/i18n/client';
import { RESTAURANT_LIMITS, type ModifierGroupInput } from '@/lib/restaurant/types';

export interface DraftOption { key: string; name: string; price: string }
export interface DraftGroup { key: string; name: string; required: boolean; min: string; max: string; options: DraftOption[] }

let seq = 0;
const newKey = () => `k${Date.now().toString(36)}${(seq++).toString(36)}`;

export function newOption(): DraftOption {
  return { key: newKey(), name: '', price: '' };
}

export function newGroup(): DraftGroup {
  return { key: newKey(), name: '', required: false, min: '0', max: '1', options: [newOption()] };
}

/** Saqlangan guruhlar → tahrir qoralamasi */
export function toDraft(groups: { name: string; required: boolean; min: number; max: number; options: { name: string; price: number }[] }[]): DraftGroup[] {
  return groups.map((g) => ({
    key: newKey(),
    name: g.name,
    required: g.required,
    min: String(g.min),
    max: String(g.max),
    options: g.options.map((o) => ({ key: newKey(), name: o.name, price: o.price ? String(o.price) : '' })),
  }));
}

type ErrKey = 'errGroupName' | 'errOptions' | 'errMinMax' | 'errRequired' | 'errTooMany';

/**
 * Qoralamani tekshirish (lib/restaurant/modifiers.ts → normalizeModifierGroups bilan bir xil qoidalar)
 * va server kirishiga aylantirish. Xato bo'lsa — lug'at kaliti va guruh kaliti.
 */
export function validateGroups(draft: DraftGroup[]): { ok: true; groups: ModifierGroupInput[] } | { ok: false; error: ErrKey; groupKey?: string } {
  if (draft.length > RESTAURANT_LIMITS.maxModifierGroups) return { ok: false, error: 'errTooMany' };
  const names = new Set<string>();
  const groups: ModifierGroupInput[] = [];
  for (const g of draft) {
    const name = g.name.trim();
    if (!name || name.length > 60 || names.has(name.toLowerCase())) return { ok: false, error: 'errGroupName', groupKey: g.key };
    names.add(name.toLowerCase());
    if (g.options.length > RESTAURANT_LIMITS.maxModifierOptions) return { ok: false, error: 'errTooMany', groupKey: g.key };
    const optNames = new Set<string>();
    const options: { name: string; price: number }[] = [];
    for (const o of g.options) {
      const oname = o.name.trim();
      const price = o.price ? Number(o.price) : 0;
      if (!oname || oname.length > 60 || optNames.has(oname.toLowerCase())) return { ok: false, error: 'errOptions', groupKey: g.key };
      if (!Number.isSafeInteger(price) || price < 0 || price > 100_000_000) return { ok: false, error: 'errOptions', groupKey: g.key };
      optNames.add(oname.toLowerCase());
      options.push({ name: oname, price });
    }
    if (!options.length) return { ok: false, error: 'errOptions', groupKey: g.key };
    const min = Number(g.min);
    const max = Number(g.max);
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < 1 || min > max || max > options.length) {
      return { ok: false, error: 'errMinMax', groupKey: g.key };
    }
    if (g.required && min < 1) return { ok: false, error: 'errRequired', groupKey: g.key };
    groups.push({ name, required: g.required, min, max, options });
  }
  return { ok: true, groups };
}

interface Props {
  value: DraftGroup[];
  onChange: (next: DraftGroup[]) => void;
  disabled?: boolean;
  /** Xato bo'lgan guruh (ramka bilan ajratiladi) */
  errorKey?: string;
}

/** Modifikator guruhlari muharriri: guruh (nom, majburiy, min/max) va variantlar (nom + qo'shimcha narx) */
export default function ModifierGroupsEditor({ value, onChange, disabled, errorKey }: Props) {
  const d = useDict();
  const t = d.restaurant.settings;
  const uid = useId();

  const patch = (key: string, p: Partial<DraftGroup>) => onChange(value.map((g) => (g.key === key ? { ...g, ...p } : g)));
  const patchOpt = (gKey: string, oKey: string, p: Partial<DraftOption>) =>
    onChange(value.map((g) => (g.key === gKey ? { ...g, options: g.options.map((o) => (o.key === oKey ? { ...o, ...p } : o)) } : g)));

  return (
    <div className="rs-mods">
      {value.map((g, gi) => {
        const gid = `${uid}-g${gi}`;
        return (
          <fieldset key={g.key} className={`rs-mod${errorKey === g.key ? ' is-error' : ''}`} disabled={disabled} aria-labelledby={`${gid}-l`}>
            <legend className="sr-only" id={`${gid}-l`}>{g.name || t.groupName}</legend>
            <div className="rs-mod-head">
              <label className="rs-mini rs-mini--grow">
                <span>{t.groupName}</span>
                <input className="input" value={g.name} onChange={(e) => patch(g.key, { name: e.target.value })} placeholder={t.groupNamePh} maxLength={60} />
              </label>
              <button
                type="button"
                className="icon-btn icon-btn--danger rs-end"
                onClick={() => onChange(value.filter((x) => x.key !== g.key))}
                aria-label={`${t.removeGroup}: ${g.name || gi + 1}`}
                title={t.removeGroup}
              >
                <Icon name="trash" size={16} />
              </button>
            </div>
            <div className="rs-mod-rules">
              <label className="rs-check">
                <input
                  type="checkbox"
                  checked={g.required}
                  onChange={(e) => {
                    const required = e.target.checked;
                    const min = Number(g.min);
                    // Majburiy — kamida 1 tanlov; ixtiyoriy — 0
                    patch(g.key, { required, min: required && !(min >= 1) ? '1' : !required && min === 1 ? '0' : g.min });
                  }}
                />
                {t.groupRequired}
              </label>
              <label className="rs-mini rs-mini--num">
                <span>{t.groupMin}</span>
                <input className="input" type="number" inputMode="numeric" min={0} max={RESTAURANT_LIMITS.maxModifierOptions} value={g.min} onChange={(e) => patch(g.key, { min: e.target.value })} />
              </label>
              <label className="rs-mini rs-mini--num">
                <span>{t.groupMax}</span>
                <input className="input" type="number" inputMode="numeric" min={1} max={RESTAURANT_LIMITS.maxModifierOptions} value={g.max} onChange={(e) => patch(g.key, { max: e.target.value })} />
              </label>
            </div>
            <ul className="rs-opts">
              {g.options.map((o, oi) => (
                <li key={o.key} className="rs-opt">
                  <input
                    className="input"
                    value={o.name}
                    onChange={(e) => patchOpt(g.key, o.key, { name: e.target.value })}
                    placeholder={t.optionNamePh}
                    maxLength={60}
                    aria-label={`${t.optionName} ${oi + 1}`}
                  />
                  <span className="rs-opt-price">
                    <span aria-hidden="true">+</span>
                    <PriceInput value={o.price} onValueChange={(v) => patchOpt(g.key, o.key, { price: v })} placeholder="0" ariaLabel={`${t.optionPrice} ${oi + 1}`} className="input" />
                  </span>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => patch(g.key, { options: g.options.filter((x) => x.key !== o.key) })}
                    disabled={g.options.length <= 1}
                    aria-label={`${t.removeOption}: ${o.name || oi + 1}`}
                    title={t.removeOption}
                  >
                    <Icon name="close" size={14} />
                  </button>
                </li>
              ))}
            </ul>
            {g.options.length < RESTAURANT_LIMITS.maxModifierOptions && (
              <button type="button" className="btn btn-sm btn-plain btn-with-icon" onClick={() => patch(g.key, { options: [...g.options, newOption()] })}>
                <Icon name="plus" size={14} /> {t.addOption}
              </button>
            )}
          </fieldset>
        );
      })}
      {value.length < RESTAURANT_LIMITS.maxModifierGroups && (
        <button type="button" className="btn btn-sm btn-tinted btn-with-icon rs-mods-add" disabled={disabled} onClick={() => onChange([...value, newGroup()])}>
          <Icon name="plus" size={15} /> {t.addGroup}
        </button>
      )}
    </div>
  );
}
