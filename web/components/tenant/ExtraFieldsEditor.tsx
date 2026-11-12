'use client';

import { useRef, useState } from 'react';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import { EXTRA_FIELDS_MAX, EXTRA_NAME_MAX, EXTRA_VALUE_MAX } from '@/lib/productImport';

type Row = { id: number; name: string; value: string };

/**
 * Mahsulotning qo'shimcha ustunlari («Mamlakat — O'zbekiston»). Forma bilan birga
 * `extraFields` (JSON) sifatida yuboriladi — server lib/productImport.ts → parseExtraFieldsJson.
 */
export default function ExtraFieldsEditor({
  initial = [],
  suggestions = [],
  disabled,
}: {
  initial?: { name: string; value: string }[];
  suggestions?: string[];
  disabled?: boolean;
}) {
  const t = useDict().importer.extra;
  const nextId = useRef(initial.length + 1);
  const [rows, setRows] = useState<Row[]>(() => initial.map((e, i) => ({ id: i + 1, ...e })));
  const update = (id: number, patch: Partial<Row>) => setRows((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const json = JSON.stringify(rows.map(({ name, value }) => ({ name, value })));
  const full = rows.length >= EXTRA_FIELDS_MAX;

  return (
    <div className="auth-field st-xf">
      <span className="st-profit-l">{t.title}</span>
      <input type="hidden" name="extraFields" value={json} />
      {suggestions.length > 0 && (
        <datalist id="st-xf-names">
          {suggestions.map((n) => <option key={n} value={n} />)}
        </datalist>
      )}
      {rows.length > 0 && (
        <ul className="st-xf-list">
          {rows.map((r) => (
            <li key={r.id} className="st-xf-row">
              <input
                type="text"
                value={r.name}
                maxLength={EXTRA_NAME_MAX}
                list={suggestions.length ? 'st-xf-names' : undefined}
                placeholder={t.namePh}
                aria-label={t.name}
                disabled={disabled}
                onChange={(e) => update(r.id, { name: e.target.value })}
              />
              <input
                type="text"
                value={r.value}
                maxLength={EXTRA_VALUE_MAX}
                placeholder={t.valuePh}
                aria-label={t.value}
                disabled={disabled}
                onChange={(e) => update(r.id, { value: e.target.value })}
              />
              <button
                type="button"
                className="icon-btn"
                aria-label={t.remove}
                title={t.remove}
                disabled={disabled}
                onClick={() => setRows((p) => p.filter((x) => x.id !== r.id))}
              >
                <Icon name="close" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="btn btn-tinted btn-sm btn-with-icon st-xf-add"
        disabled={disabled || full}
        onClick={() => setRows((p) => [...p, { id: nextId.current++, name: '', value: '' }])}
      >
        <Icon name="plus" size={16} /> {t.add}
      </button>
      <small className="field-hint">{full ? tr(t.tooMany, { n: EXTRA_FIELDS_MAX }) : t.hint}</small>
    </div>
  );
}
