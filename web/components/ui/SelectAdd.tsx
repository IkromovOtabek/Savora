'use client';

import { useState, useTransition, type KeyboardEvent, type ReactNode } from 'react';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import './select-add.css';

export interface SelectAddOption { value: string; label: string; title?: string }
/** Saqlash natijasi: yangi/yangilangan qiymat yoki xato matni */
export type SelectAddResult = { value: string; label: string } | { error: string };

/**
 * Tanlov maydoni: ichida o'ng tomonda «+» (yangisini shu yerda qo'shish). Ro'yxat bo'sh bo'lsa —
 * «Tanlang» o'rniga «Hali yo'q — «+» bilan qo'shing». Ixtiyoriy: tanlanganini tahrirlash/o'chirish ikonkalari.
 * Qo'shish qatori forma maydoni emas (name yo'q) — Enter asosiy formani yubormaydi.
 */
export default function SelectAdd({
  id,
  name,
  value,
  onChange,
  options,
  placeholder,
  required,
  disabled,
  ariaLabel,
  addLabel,
  addPlaceholder,
  maxLength = 60,
  onAdd,
  addExtra,
  onRename,
  onRemove,
  extraOptions,
}: {
  id: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectAddOption[];
  /** Bo'sh qiymat matni («Tanlanmagan», «Toifasiz»). Berilmasa — bo'sh qiymat faqat ro'yxat bo'sh bo'lganda */
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  /** «+» tugmasi matni (aria/title) */
  addLabel?: string;
  addPlaceholder?: string;
  maxLength?: number;
  /** Berilmasa «+» ko'rinmaydi (masalan, qo'shishga huquq yo'q) */
  onAdd?: (name: string) => Promise<SelectAddResult>;
  /** Qo'shish qatoridagi qo'shimcha tanlov (turkum — qaysi turkum ichida) */
  addExtra?: ReactNode;
  onRename?: (value: string, name: string) => Promise<SelectAddResult>;
  /** ok — o'chirildi (ro'yxatni chaqiruvchi yangilaydi); message — ko'rsatiladigan izoh yoki xato */
  onRemove?: (value: string) => Promise<{ ok: boolean; message?: string }>;
  /** Ro'yxatda bo'lmagan qo'shimcha <option>lar (eski qiymat) */
  extraOptions?: ReactNode;
}) {
  const t = useDict().ui.selectAdd;
  // Ro'yxatni chaqiruvchi boshqaradi (onAdd/onRename/onRemove ichida yangilaydi) — bu yerda faqat ko'rsatish
  const list = options;
  const [mode, setMode] = useState<'idle' | 'add' | 'edit'>('idle');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const busy = !!disabled || saving;
  const empty = list.length === 0;
  const selected = list.find((o) => o.value === value);

  function open(next: 'add' | 'edit') {
    setError(null);
    setInfo(null);
    setText(next === 'edit' ? selected?.label ?? '' : '');
    setMode(next);
  }

  function save() {
    const v = text.trim();
    if (!v) return;
    startSaving(async () => {
      const res = mode === 'edit' && onRename && selected
        ? await onRename(selected.value, v)
        : onAdd ? await onAdd(v) : { error: '' };
      if ('error' in res) { setError(res.error || null); return; }
      onChange(res.value);
      setMode('idle');
    });
  }

  function remove() {
    if (!onRemove || !selected || !window.confirm(tr(t.removeConfirm, { name: selected.label }))) return;
    const removedValue = selected.value;
    startSaving(async () => {
      const res = await onRemove(removedValue);
      if (!res.ok) { setError(res.message ?? null); return; }
      const rest = list.filter((o) => o.value !== removedValue);
      onChange(placeholder !== undefined ? '' : rest[0]?.value ?? '');
      setError(null);
      setInfo(res.message ?? null);
    });
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
    if (e.key === 'Escape') { e.preventDefault(); setMode('idle'); }
  };

  return (
    <>
      <div className="sa">
        <div className={`sa-field${onAdd ? ' sa-field--plus' : ''}`}>
          <select
            id={id}
            name={name}
            value={value}
            onChange={(e) => { onChange(e.target.value); setError(null); setInfo(null); }}
            required={required}
            disabled={busy}
            aria-label={ariaLabel}
          >
            {empty ? (
              <option value="">{onAdd ? t.empty : placeholder ?? '—'}</option>
            ) : placeholder !== undefined ? (
              <option value="">{placeholder}</option>
            ) : null}
            {extraOptions}
            {list.map((o) => <option key={o.value} value={o.value} title={o.title}>{o.label}</option>)}
          </select>
          {onAdd && (
            <button
              type="button"
              className={`sa-plus${empty ? ' is-cta' : ''}`}
              onClick={() => (mode === 'add' ? setMode('idle') : open('add'))}
              disabled={busy}
              aria-label={addLabel ?? t.addNew}
              aria-expanded={mode === 'add'}
              title={addLabel ?? t.addNew}
            >
              <Icon name="plus" size={16} strokeWidth={2.5} />
            </button>
          )}
        </div>
        {selected && (onRename || onRemove) && (
          <div className="sa-acts">
            {onRename && (
              <button type="button" onClick={() => open('edit')} disabled={busy} aria-label={`${t.edit}: ${selected.label}`} title={t.edit}>
                <Icon name="edit" size={16} />
              </button>
            )}
            {onRemove && (
              <button type="button" className="sa-del" onClick={remove} disabled={busy} aria-label={`${t.remove}: ${selected.label}`} title={t.remove}>
                <Icon name="trash" size={16} />
              </button>
            )}
          </div>
        )}
      </div>
      {mode !== 'idle' && (
        <div className="sa-row-wrap">
          {mode === 'add' && addExtra}
          <div className="sa-row">
            <input
              type="text"
              value={text}
              onChange={(e) => { setText(e.target.value); setError(null); }}
              onKeyDown={onKey}
              placeholder={mode === 'edit' ? t.editName : addPlaceholder ?? t.newName}
              aria-label={mode === 'edit' ? t.editName : addPlaceholder ?? t.newName}
              maxLength={maxLength}
              aria-invalid={!!error || undefined}
              disabled={busy}
              autoFocus
              autoComplete="off"
            />
            <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={busy || !text.trim()}>
              {saving ? t.saving : mode === 'edit' ? t.save : t.add}
            </button>
            <button type="button" className="btn btn-plain btn-sm" onClick={() => setMode('idle')} disabled={saving}>
              {t.cancel}
            </button>
          </div>
        </div>
      )}
      {error && <span className="field-error" role="alert">{error}</span>}
      {info && <span className="field-hint" role="status">{info}</span>}
    </>
  );
}
