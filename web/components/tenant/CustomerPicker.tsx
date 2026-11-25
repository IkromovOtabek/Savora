'use client';

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { searchSaleCustomersAction } from '@/app/actions/sales';
import type { SaleCustomerHit, SaleCustomerSearch } from '@/lib/saleCustomer';
import { PHONE_PLACEHOLDER } from '@/lib/phone';
import { useDict } from '@/lib/i18n/client';
import Icon from '@/components/icons/Icon';
import './styles/customer-picker.css';

/** Sotuv mijozi: id — ro'yxatdan tanlangan mavjud mijoz ('' — yangi, ism + telefon bo'yicha) */
export interface PickedCustomer { id: string; name: string; phone: string }
export const EMPTY_CUSTOMER: PickedCustomer = { id: '', name: '', phone: '' };

/** Har harfdan keyin shuncha kutib so'raladi (oraliqdagi natijalar darhol mahalliy toraytiriladi) */
const DEBOUNCE_MS = 150;

const APOS = /['‘’ʻʼ`´]/g;
const norm = (s: string) => s.toLowerCase().replace(APOS, "'");
const isPhoneQuery = (q: string) => /^[\d\s+()-]+$/.test(q) && q.replace(/\D/g, '').length >= 3;

/** Oldingi so'rov natijasini yangi so'z bo'yicha toraytirish — server javobi kelguncha (lib/saleCustomer bilan bir xil qoida) */
function localMatch(h: SaleCustomerHit, q: string): boolean {
  if (!q) return true;
  if (isPhoneQuery(q)) return h.phone.replace(/\D/g, '').includes(q.replace(/\D/g, '').slice(-9));
  const name = norm(h.name);
  return norm(q).split(/\s+/).filter(Boolean).every((w) => name.includes(w));
}

/** Ismdagi mos qismlarni ajratib ko'rsatish */
function highlight(name: string, q: string): ReactNode {
  if (!q || isPhoneQuery(q)) return name;
  const words = norm(q).split(/\s+/).filter(Boolean);
  const low = norm(name);
  const marks = new Array<boolean>(name.length).fill(false);
  for (const w of words) {
    const i = low.indexOf(w);
    if (i >= 0) marks.fill(true, i, i + w.length);
  }
  const out: ReactNode[] = [];
  let i = 0;
  while (i < name.length) {
    let j = i;
    while (j < name.length && marks[j] === marks[i]) j++;
    out.push(marks[i] ? <mark key={i}>{name.slice(i, j)}</mark> : name.slice(i, j));
    i = j;
  }
  return out;
}

interface Props {
  value: PickedCustomer;
  onChange: (v: PickedCustomer) => void;
  disabled?: boolean;
  /** Forma ichida: customerId / customerName / customerPhone nomlari bilan yuboriladi */
  named?: boolean;
  /** Kichik menyu (ro'yxatdagi «Sotildi») — ixcham yorliqlar */
  compact?: boolean;
  /** Naqd sotuvda mijoz ixtiyoriy (qarz/nasiya/bankda majburiy — server ham tekshiradi) */
  optional?: boolean;
}

/**
 * Mijoz F.I.O + telefon. F.I.O katagida — mavjud mijozlar ro'yxati: bosilganda so'nggilari,
 * har harf yozilganda real vaqtda qidiriladi (ism yoki raqam). Tanlansa — telefon o'zi to'ladi.
 */
export default function CustomerPicker({ value, onChange, disabled, named, compact, optional }: Props) {
  const d = useDict();
  const k = d.sales.newSale;
  // Ixtiyoriy bo'lsa — yorliqdagi majburiy belgisi («*») olib tashlanadi
  const lbl = (v: string) => (optional ? v.replace(/\s*\*$/, '') : v);
  const uid = useId();
  const nameId = `${uid}-name`;
  const phoneId = `${uid}-phone`;
  const listId = `${uid}-list`;
  const [open, setOpen] = useState(false);
  const [res, setRes] = useState<{ q: string; r: SaleCustomerSearch } | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const cache = useRef(new Map<string, SaleCustomerSearch>());
  const seq = useRef(0);
  const listRef = useRef<HTMLUListElement>(null);

  const q = value.name.trim();
  const showList = open && !disabled;

  useEffect(() => {
    if (!showList) return;
    const key = norm(q);
    const cached = cache.current.get(key);
    const my = ++seq.current;
    if (cached) {
      setRes({ q, r: cached });
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      let r: SaleCustomerSearch = { hits: [], more: false };
      try {
        r = await searchSaleCustomersAction(q);
        cache.current.set(key, r);
      } catch { /* tarmoq xatosi — ro'yxatsiz, qo'lda yoziladi */ }
      if (seq.current !== my) return;
      setRes({ q, r });
      setLoading(false);
    }, key ? DEBOUNCE_MS : 0);
    return () => clearTimeout(timer);
  }, [q, showList]);

  const shown = useMemo(() => {
    if (!res) return [];
    return res.q === q ? res.r.hits : res.r.hits.filter((h) => localMatch(h, q));
  }, [res, q]);
  const act = active < shown.length ? active : -1;

  // Klaviatura bilan tanlangan qator ko'rinib tursin
  useEffect(() => {
    if (act < 0) return;
    listRef.current?.querySelector<HTMLElement>(`[data-i="${act}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [act]);

  function pick(h: SaleCustomerHit) {
    onChange({ id: h.id, name: h.name, phone: h.phone });
    setOpen(false);
    setActive(-1);
  }

  function onNameChange(v: string) {
    // Tanlangan mijoz ismi o'zgartirilsa — bu boshqa (yangi) mijoz: uning telefoni ham tozalanadi
    onChange({ id: '', name: v, phone: value.id ? '' : value.phone });
    setOpen(true);
    setActive(-1);
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive(Math.min(act + 1, shown.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(Math.max(act - 1, 0));
    } else if (e.key === 'Enter' && showList && act >= 0) {
      e.preventDefault();
      pick(shown[act]);
    } else if (e.key === 'Escape' && showList) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  }

  const labelCls = compact ? 'row-action-qty-label' : undefined;
  const inputCls = compact ? 'input cpk-input' : 'cpk-input';
  const exact = res?.q === q;

  return (
    <div className={`cpk${compact ? ' cpk--compact' : ''}`}>
      {named && <input type="hidden" name="customerId" value={value.id} />}
      <div className={compact ? 'cpk-field' : 'auth-field cpk-field'}>
        <label htmlFor={nameId} className={labelCls}>{lbl(k.customerName)}</label>
        <div className="cpk-box">
          <Icon name="search" size={16} />
          <input
            id={nameId}
            name={named ? 'customerName' : undefined}
            type="text"
            className={inputCls}
            required={!optional}
            maxLength={120}
            value={value.name}
            onChange={(e) => onNameChange(e.target.value)}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={onKey}
            disabled={disabled}
            placeholder={k.customerNamePh}
            autoComplete="off"
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={showList && act >= 0 ? `${uid}-o${act}` : undefined}
          />
        </div>
        {value.id && !showList && (
          <small className="cpk-ok"><Icon name="check" size={13} strokeWidth={2.5} /> {k.pickExisting}</small>
        )}
        {showList && (
          // Bosilganda katakdan fokus ketmasin (blur ro'yxatni yopib, bosish yo'qolmasin)
          <ul id={listId} ref={listRef} role="listbox" aria-label={k.pickListAria} className="cpk-list" onMouseDown={(e) => e.preventDefault()}>
            {!q && shown.length > 0 && <li role="presentation" className="cpk-head">{k.pickRecent}</li>}
            {shown.map((h, i) => (
              <li
                key={h.id}
                id={`${uid}-o${i}`}
                data-i={i}
                role="option"
                aria-selected={i === act || h.id === value.id}
                className={`cpk-opt${i === act ? ' is-active' : ''}${h.id === value.id ? ' is-picked' : ''}`}
                onClick={() => pick(h)}
                onMouseMove={() => act !== i && setActive(i)}
              >
                <b>{highlight(h.name, q)}</b>
                <span className="t-num">{h.phone}</span>
              </li>
            ))}
            {shown.length === 0 && (
              <li role="presentation" className="cpk-note">
                {loading ? k.pickSearching : q ? k.pickNew : k.pickNone}
              </li>
            )}
            {exact && res.r.more && <li role="presentation" className="cpk-note">{k.pickMore}</li>}
          </ul>
        )}
      </div>
      <div className={compact ? 'cpk-field' : 'auth-field cpk-field'}>
        <label htmlFor={phoneId} className={labelCls}>{lbl(k.customerPhone)}</label>
        <input
          id={phoneId}
          name={named ? 'customerPhone' : undefined}
          type="tel"
          className={compact ? 'input' : undefined}
          required={!optional}
          maxLength={40}
          value={value.phone}
          onChange={(e) => {
            // Niqob faqat ko'rinishni o'zgartirsa (raqamlar o'sha) — tanlangan mijoz saqlanadi
            const v = e.target.value;
            const same = v.replace(/\D/g, '') === value.phone.replace(/\D/g, '');
            onChange({ id: same ? value.id : '', name: value.name, phone: v });
          }}
          disabled={disabled}
          placeholder={PHONE_PLACEHOLDER}
          autoComplete="off"
          inputMode="tel"
        />
      </div>
    </div>
  );
}
