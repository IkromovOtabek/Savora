'use client';

import Link from 'next/link';
import { useActionState, useEffect, useMemo, useState, useTransition } from 'react';
import { useToastOnState } from '@/lib/useToastOnState';
import { createSaleAction, lookupProductByImei } from '@/app/actions/sales';
import { PaymentType } from '@/lib/models/tenant/Sale';
import { OrgFeatures } from '@/lib/features';
import { MAX_BANK_PARTS } from '@/lib/bankCredit';
import { POS_HANDOFF_KEY, POS_HANDOFF_TTL_MS, type PosHandoff } from '@/lib/posCart';
import { fmtDate, fmtMoney } from '@/lib/format';
import { addMonthsClamped } from '@/lib/dates';
import { installmentDueDate } from '@/lib/installment';
import BackLink from '@/components/ui/BackLink';
import ImageUploadField from '@/components/ui/ImageUploadField';
import PriceInput from '@/components/ui/PriceInput';
import SelectAdd from '@/components/ui/SelectAdd';
import { quickCreditBankAction } from '@/app/actions/finance';
import Icon from '@/components/icons/Icon';
import { PQ294_MAX_MONTHS } from '@/lib/pq294';
import { useDict } from '@/lib/i18n/client';
import { qtyWithUnit, tr } from '@/lib/i18n/fmt';
import { addQty, fmtQty, isFractionalUnit, parseQty, priceTimesQty, qtyStep } from '@/lib/qty';
import type { ProductUnit } from '@/lib/businessTypes';

interface ProductOption {
  id: string;
  name: string;
  salePrice: number;
  branchName: string;
  imei?: string;
  trackQuantity?: boolean;
  available?: number;
  unit?: ProductUnit | null;
}

/** Savatcha qatori: qty — kiritilayotgan matn ("2", "1,5") */
interface CartItem extends ProductOption { qty: string }

/** To'lov turlari tartibi (yorliqlar lug'atdan: d.sales.paymentTypes) */
const PAYMENT_ORDER: PaymentType[] = ['cash', 'debt', 'installment', 'bank_credit'];

/** Ro'yxatda bir vaqtda ko'rsatiladigan mahsulotlar soni (qolgani qidiruv orqali) */
const PICK_LIMIT = 60;

/** Bir xaridda eng ko'p tovar (server SALE_MAX_LINES bilan bir xil) */
const MAX_ITEMS = 20;

/** IMEI takliflari: shuncha raqamdan boshlab (oxirgi 4 raqam) va ro'yxatda eng ko'pi */
const IMEI_MIN_DIGITS = 4;
const IMEI_SUGGEST_LIMIT = 8;

function normImei(v: string): string {
  return v.trim().replace(/\s/g, '').toUpperCase();
}

/** To'lov muddati uchun tez tanlovlar (yorliqlar: d.sales.duePresets) */
const DUE_PRESETS = [
  { key: 'week1', days: 7 },
  { key: 'week2', days: 14 },
  { key: 'month1', months: 1 },
  { key: 'month3', months: 3 },
] as const;

function addDays(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + n);
  return x;
}

/** <input type="date"> qiymati — mahalliy sana, YYYY-MM-DD */
function isoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Yangi qator: miqdor 1 (kasrli birlikda qoldiq 1 dan kam bo'lsa — boricha) */
function toItem(p: ProductOption, qty?: number): CartItem {
  const max = p.trackQuantity && p.available != null ? p.available : Infinity;
  const q = Math.min(max, qty && qty > 0 ? qty : 1);
  return { ...p, imei: p.imei ?? '', qty: fmtQty(q) };
}

/** Qator miqdori (kiritilgan matndan); hisoblanmaydigan tovarda — 1 */
function itemQty(it: CartItem): number | null {
  return it.trackQuantity ? parseQty(it.qty, it.unit) : 1;
}

/** Ro'yxat narxi bo'yicha savatcha jami (server ham shunday hisoblaydi) */
function cartTotal(items: CartItem[]): number {
  return items.reduce((s, it) => s + priceTimesQty(it.salePrice, itemQty(it) ?? 1), 0);
}

interface Props {
  isPhoneShop: boolean;
  products: ProductOption[];
  mediaEnabled?: boolean;
  features: OrgFeatures;
  creditBanks: string[];
  /** Do'kon egasi — bank tanlovida «+» bilan yangi bank qo'shadi */
  canAddBank?: boolean;
  preselectId?: string;
  /** Ombor menyusidan tanlangan to'lov turi (cash/installment/bank_credit) */
  preselectPayment?: string;
}

export default function SaleForm({ isPhoneShop, products, mediaEnabled, features, creditBanks, canAddBank, preselectId, preselectPayment }: Props) {
  const [state, formAction, isPending] = useActionState(createSaleAction, null);
  useToastOnState(state);
  const d = useDict();
  const k = d.sales.newSale;
  const preselected = preselectId ? products.find((p) => p.id === preselectId) : undefined;
  const [imei, setImei] = useState('');
  // Bitta mijozga bir nechta tovar (qarz/bank krediti) — har biri alohida sotuv, bitta xarid
  const [items, setItems] = useState<CartItem[]>(() => (preselected ? [toItem(preselected)] : []));
  const [lookupError, setLookupError] = useState('');
  const [searching, startSearch] = useTransition();
  const initialPayment: PaymentType =
    preselectPayment === 'installment' && (features.variant || features.nasiya) ? 'installment'
    : preselectPayment === 'bank_credit' && features.creditKassa ? 'bank_credit'
    : preselectPayment === 'debt' ? 'debt'
    : 'cash';
  const [paymentType, setPaymentType] = useState<PaymentType>(initialPayment);
  const [totalAmount, setTotalAmount] = useState(preselected ? String(preselected.salePrice) : '');
  // Jonli hisob-kitob uchun (forma maydon nomlari o'zgarmagan)
  const [paidAmount, setPaidAmount] = useState('0');
  const [months, setMonths] = useState('12');
  const [query, setQuery] = useState('');
  const [dueDate, setDueDate] = useState('');
  // Nasiya: har oyning qaysi kuni to'laydi (standart — bugungi kun, brauzerda qo'yiladi)
  const [payDay, setPayDay] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  // Bank krediti: bir yoki bir nechta bank. Bitta bank bo'lsa — qolgan summa to'liq unga yoziladi
  const [bankRows, setBankRows] = useState<{ bank: string; amount: string }[]>([{ bank: '', amount: '' }]);
  // Bank krediti + nasiya: qolgan summaning bir qismini mijoz oyma-oy do'konga to'laydi
  const [nasiyaOn, setNasiyaOn] = useState(false);
  const [nasiyaAmount, setNasiyaAmount] = useState('');
  // Sana faqat brauzerda (server/klient vaqt mintaqasi farqi hydration xatosiga olib kelmasin)
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const n = new Date();
    setNow(n);
    setPayDay((v) => v || String(n.getDate()));
  }, []);

  // Kassadan (POS) «Nasiya / bank krediti» orqali kelinsa — savatcha va mijoz shu yerga o'tadi (IMEI qayta so'ralmaydi)
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(POS_HANDOFF_KEY);
      sessionStorage.removeItem(POS_HANDOFF_KEY);
    } catch { /* xotira yo'q — oddiy forma */ }
    if (!raw) return;
    let h: PosHandoff;
    try { h = JSON.parse(raw) as PosHandoff; } catch { return; }
    if (!h || !Array.isArray(h.lines) || Date.now() - (h.at ?? 0) > POS_HANDOFF_TTL_MS) return;
    const byId = new Map(products.map((p) => [p.id, p]));
    const next = h.lines.flatMap((l) => {
      const p = byId.get(l.id);
      return p ? [toItem(p, l.qty)] : [];
    }).slice(0, MAX_ITEMS);
    if (next.length === 0) return;
    setItems(next);
    // Kassadagi jami (chegirma/ulgurji bilan) — o'zgarmagan bo'lsa ro'yxat narxi
    setTotalAmount(String(h.total && h.total > 0 ? h.total : cartTotal(next)));
    if (h.customerName) setCustomerName(h.customerName);
    if (h.customerPhone) setCustomerPhone(h.customerPhone);
    if (h.note) setNotes(h.note);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- faqat birinchi ochilishda
  }, []);

  const paymentTypes = useMemo(() => {
    return PAYMENT_ORDER.filter((t) => {
      if (t === 'installment' && !features.variant) return false;
      if (t === 'bank_credit' && !features.creditKassa) return false;
      return true;
    });
  }, [features.variant, features.creditKassa]);

  // Bank krediti faqat Kredit kassa yoqilganda — banklar o'sha ro'yxatdan (server ham shuni tekshiradi)
  const [bankOptions, setBankOptions] = useState(creditBanks);
  // Egasi bank tanlovining o'zida yangi bank qo'shadi (Kredit kassaga o'tmasdan)
  const addBank = canAddBank
    ? async (name: string) => {
        const res = await quickCreditBankAction(name);
        if (!res.ok) return { error: res.error };
        setBankOptions((prev) => (prev.includes(res.name) ? prev : [...prev, res.name].sort((a, b) => a.localeCompare(b))));
        return { value: res.name, label: res.name };
      }
    : undefined;

  const hasItems = items.length > 0;
  const inCart = useMemo(() => new Set(items.map((it) => it.id)), [items]);
  // Nasiya — bitta tovar (har tovarning o'z oylik jadvali bo'lardi); ko'p tovar — qarz yoki bank krediti
  const installmentMulti = paymentType === 'installment' && items.length > 1;
  // Miqdori noto'g'ri qator (kasr xato yoki qoldiqdan ko'p) — tasdiqlab bo'lmaydi
  const qtyBad = items.some((it) => {
    if (!it.trackQuantity) return false;
    const q = parseQty(it.qty, it.unit);
    return q === null || (it.available != null && q > it.available);
  });
  const itemsJson = JSON.stringify(items.map((it) => ({ productId: it.id, ...(it.trackQuantity ? { qty: itemQty(it) ?? undefined } : {}) })));

  const visibleProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? products.filter((p) =>
          p.name.toLowerCase().includes(q) ||
          p.branchName.toLowerCase().includes(q) ||
          (p.imei ?? '').toLowerCase().includes(q))
      : products;
    return { items: list.slice(0, PICK_LIMIT), more: Math.max(0, list.length - PICK_LIMIT) };
  }, [products, query]);

  // Telefon do'kon: IMEI'ning oxirgi 4+ raqami yozilsa — mos telefonlar (oxiri mos kelganlari birinchi)
  const imeiQuery = normImei(imei);
  const imeiMatches = useMemo(() => {
    if (!isPhoneShop || imeiQuery.length < IMEI_MIN_DIGITS) return [];
    const ends: ProductOption[] = [];
    const has: ProductOption[] = [];
    for (const p of products) {
      const code = (p.imei ?? '').toUpperCase();
      if (!code) continue;
      if (code.endsWith(imeiQuery)) ends.push(p);
      else if (code.includes(imeiQuery)) has.push(p);
    }
    return [...ends, ...has];
  }, [isPhoneShop, imeiQuery, products]);
  const showImeiMatches = imeiMatches.length > 0;

  /** Savatchani yangilaydi va jami summani ro'yxat narxi bo'yicha qayta hisoblaydi */
  function applyItems(next: CartItem[]) {
    setItems(next);
    setTotalAmount(next.length ? String(cartTotal(next)) : '');
  }

  function addItem(p: ProductOption) {
    setLookupError('');
    if (inCart.has(p.id)) return;
    // Nasiyada bitta tovar — yangisi avvalgisining o'rnini oladi
    if (paymentType === 'installment') return applyItems([toItem(p)]);
    if (items.length >= MAX_ITEMS) {
      setLookupError(tr(d.sales.actions.tooManyItems, { n: MAX_ITEMS }));
      return;
    }
    applyItems([...items, toItem(p)]);
  }

  function removeItem(id: string) {
    applyItems(items.filter((it) => it.id !== id));
  }

  function setItemQty(id: string, v: string) {
    applyItems(items.map((it) => (it.id === id ? { ...it, qty: v } : it)));
  }

  function stepItemQty(it: CartItem, delta: number) {
    const max = it.available ?? Infinity;
    const next = Math.min(max, addQty(itemQty(it) ?? 1, delta));
    if (next < qtyStep(it.unit)) return;
    setItemQty(it.id, fmtQty(next));
  }

  function pickImeiOption(p: ProductOption) {
    addItem(p);
    setImei('');
  }

  /** Enter / «Qidirish»: aniq yoki yagona mos telefon — darhol; bir nechta — ro'yxatdan tanlanadi */
  function submitImei() {
    if (!imeiQuery || searching) return;
    const exact = imeiMatches.find((p) => (p.imei ?? '').toUpperCase() === imeiQuery);
    if (exact) return pickImeiOption(exact);
    if (imeiMatches.length === 1) return pickImeiOption(imeiMatches[0]);
    if (imeiMatches.length === 0) handleImeiSearch();
  }

  function handleImeiSearch() {
    setLookupError('');
    startSearch(async () => {
      const result = await lookupProductByImei(imei);
      if (!result) {
        setLookupError(d.sales.productNotFound);
        return;
      }
      addItem({
        id: result.id,
        name: result.name,
        salePrice: result.salePrice,
        branchName: result.branchName,
        imei: result.imei,
        trackQuantity: result.trackQuantity,
        available: result.available,
        unit: result.unit,
      });
      setImei('');
    });
  }

  // Jonli ko'rinish (faqat ko'rsatish uchun — server o'zi qayta hisoblaydi)
  const total = Number(totalAmount) || 0;
  const paid = paymentType === 'cash' ? total : Number(paidAmount) || 0;
  const rest = Math.max(0, total - paid);
  const monthsN = Math.min(60, Math.max(0, Math.floor(Number(months) || 0)));
  const monthly = monthsN > 0 ? Math.floor(rest / monthsN) : 0;
  const lastMonth = monthsN > 0 ? rest - monthly * (monthsN - 1) : 0;
  const payDayN = Number(payDay) || undefined;
  const overpaid = paymentType !== 'cash' && paid > total && total > 0;
  const fieldsOff = isPending || !hasItems;

  // Bank krediti + nasiya: nasiya qismi qolgan summadan kam (banklarga ham qolsin), oylik — shu qismdan
  const canNasiya = features.variant || features.nasiya;
  const withNasiya = paymentType === 'bank_credit' && canNasiya && nasiyaOn;
  const nasiyaN = withNasiya ? Math.max(0, Math.floor(Number(nasiyaAmount) || 0)) : 0;
  const nasiyaBad = withNasiya && (nasiyaN < 1 || nasiyaN >= rest);
  const nasiyaMonthly = withNasiya && monthsN > 0 ? Math.floor(nasiyaN / monthsN) : 0;
  const nasiyaLastMonth = withNasiya && monthsN > 0 ? nasiyaN - nasiyaMonthly * (monthsN - 1) : 0;
  // Nasiyada bitta tovar — bank + nasiya ham shunday
  const bankNasiyaMulti = withNasiya && items.length > 1;

  // Bank ulushlari: bitta bank — qolgan summa (nasiya qismidan tashqari) to'liq; bir nechta — har biri qo'lda
  const bankRest = rest - nasiyaN;
  const multiBank = bankRows.length > 1;
  const bankAmount = (r: { amount: string }) => (multiBank ? Number(r.amount) || 0 : bankRest);
  const unallocated = bankRest - bankRows.reduce((a, r) => a + bankAmount(r), 0);
  const bankPartsJson = JSON.stringify(bankRows.map((r) => ({ bankName: r.bank, amount: bankAmount(r) })));
  // Har bank summasi > 0 va jami = qolgan summa bo'lmaguncha tasdiqlab bo'lmaydi
  const bankZeroRow = multiBank && bankRows.some((r) => bankAmount(r) < 1);
  const bankBlocked = paymentType === 'bank_credit' && ((multiBank && (unallocated !== 0 || bankZeroRow)) || nasiyaBad || bankNasiyaMulti);

  function toggleNasiya(on: boolean) {
    setNasiyaOn(on);
    // Bir nechta bankda taqsimlanmagan qoldiq bo'lsa — nasiya qismi shu summadan boshlanadi
    if (on && !nasiyaAmount && multiBank && unallocated > 0) setNasiyaAmount(String(unallocated));
  }

  function updateBankRow(i: number, patch: Partial<{ bank: string; amount: string }>) {
    setBankRows((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }
  function addBankRow() {
    setBankRows((rows) => {
      if (rows.length >= MAX_BANK_PARTS) return rows;
      // Birinchi qo'shishda: 1-bank hozirgi qoldiqni oladi, yangisi bo'sh — foydalanuvchi bo'lib chiqadi
      if (rows.length === 1) return [{ ...rows[0], amount: String(bankRest) }, { bank: '', amount: '' }];
      return [...rows, { bank: '', amount: unallocated > 0 ? String(unallocated) : '' }];
    });
  }
  function removeBankRow(i: number) {
    setBankRows((rows) => (rows.length > 1 ? rows.filter((_, j) => j !== i) : rows));
  }

  return (
    <form action={formAction}>
      <div className="t-page-head">
        <div>
          <BackLink href="/app/sales">{d.common.sales}</BackLink>
          <h1 className="t-page-title">{k.title}</h1>
          <p className="t-page-sub">{k.sub}</p>
        </div>
      </div>

      {state?.error && <div className="auth-alert auth-alert--error" role="alert" style={{ marginBottom: 16 }}>{state.error}</div>}

      <div className="sl-pos">
        <div className="sl-pos-left">
          <section className="sl-card" aria-labelledby="sl-step1">
            <div className="sl-card-head">
              <h2 id="sl-step1"><span className="sl-step">1</span>{d.common.product}</h2>
              {items.length > 1 && <small>{tr(k.itemsCount, { n: items.length })}</small>}
            </div>
            <div className="sl-fields">
              <input type="hidden" name="items" value={itemsJson} />

              {/* Tanlangan tovarlar — har biri alohida sotuv bo'lib yoziladi (bitta xarid) */}
              {hasItems && (
                <ul className="sl-items" aria-label={k.selectedItems}>
                  {items.map((it) => {
                    const fractional = it.trackQuantity === true && isFractionalUnit(it.unit);
                    const q = itemQty(it);
                    const bad = it.trackQuantity === true && (q === null || (it.available != null && q > it.available));
                    return (
                      <li key={it.id} className="sl-picked sl-picked--item">
                        <span className="sl-picked-ic" aria-hidden><Icon name="check" size={20} strokeWidth={2.5} /></span>
                        <div style={{ minWidth: 0 }}>
                          <b>{it.name}</b>
                          <div className="sl-picked-meta">
                            {isPhoneShop && it.imei && <code>{it.imei}</code>}
                            <span>{d.common.branch}: {it.branchName}</span>
                            <span>{d.common.price}: {fmtMoney(it.salePrice)} {d.common.sum}</span>
                            {it.trackQuantity && it.available != null && <span>{d.common.remaining}: {qtyWithUnit(it.available, it.unit, d.stock.fields.units)}</span>}
                          </div>
                          {it.trackQuantity && (
                            <div className="sl-item-qty">
                              <div className="sl-qty">
                                <button type="button" onClick={() => stepItemQty(it, -1)} disabled={isPending || (q ?? 1) - 1 < qtyStep(it.unit)} aria-label={`${k.decrease}: ${it.name}`}>−</button>
                                {fractional ? (
                                  <input
                                    type="text"
                                    value={it.qty}
                                    onChange={(e) => setItemQty(it.id, e.target.value.replace(/[^\d.,]/g, ''))}
                                    disabled={isPending}
                                    inputMode="decimal"
                                    aria-label={`${k.qtyLabel} ${it.name}`}
                                    aria-invalid={bad || undefined}
                                  />
                                ) : (
                                  <input
                                    type="number"
                                    min={1}
                                    max={it.available ?? undefined}
                                    value={it.qty}
                                    onChange={(e) => setItemQty(it.id, e.target.value)}
                                    disabled={isPending}
                                    inputMode="numeric"
                                    aria-label={`${k.qtyLabel} ${it.name}`}
                                    aria-invalid={bad || undefined}
                                  />
                                )}
                                <button
                                  type="button"
                                  onClick={() => stepItemQty(it, 1)}
                                  disabled={isPending || (it.available != null && (q ?? 1) >= it.available)}
                                  aria-label={`${k.increase}: ${it.name}`}
                                >+</button>
                                {fractional && it.unit && <small className="sl-qty-unit">{d.stock.fields.units[it.unit]}</small>}
                              </div>
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          className="sl-bank-del"
                          onClick={() => removeItem(it.id)}
                          disabled={isPending}
                          aria-label={`${k.removeItem}: ${it.name}`}
                          title={k.removeItem}
                        >
                          <Icon name="close" size={16} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {installmentMulti && (
                <div className="auth-alert auth-alert--warn" role="alert">{d.sales.actions.installmentOneItem}</div>
              )}

              {isPhoneShop ? (
                <>
                  <div className="sl-imei-row">
                    <div className="auth-field">
                      <label htmlFor="imei">{hasItems && paymentType !== 'installment' ? k.imeiAddMore : k.imeiSearch}</label>
                      <input
                        id="imei"
                        type="text"
                        value={imei}
                        onChange={(e) => { setImei(e.target.value.toUpperCase()); setLookupError(''); }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            submitImei();
                          }
                        }}
                        className="imei-input"
                        disabled={isPending}
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder={k.imeiPlaceholder}
                      />
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary btn-with-icon sl-imei-btn"
                      onClick={submitImei}
                      disabled={searching || !imei.trim()}
                      aria-label={searching ? d.sales.searching : d.common.search}
                    >
                      <Icon name="search" size={16} />
                      <span className="ux-hide-mobile">{searching ? d.sales.searching : d.common.search}</span>
                    </button>
                  </div>
                  {showImeiMatches && (
                    <ul className="sl-picker" role="group" aria-label={k.imeiMatches}>
                      {imeiMatches.slice(0, IMEI_SUGGEST_LIMIT).map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            className="sl-pick"
                            aria-pressed={inCart.has(p.id)}
                            onClick={() => pickImeiOption(p)}
                            disabled={isPending}
                          >
                            <b>{p.name}</b>
                            <span><code>{p.imei}</code> · {p.branchName}</span>
                            <strong>{fmtMoney(p.salePrice)}</strong>
                          </button>
                        </li>
                      ))}
                      {imeiMatches.length > IMEI_SUGGEST_LIMIT && (
                        <li className="sl-picker-more">{tr(k.imeiMatchesMore, { n: imeiMatches.length - IMEI_SUGGEST_LIMIT })}</li>
                      )}
                    </ul>
                  )}
                  {lookupError && <div className="auth-alert auth-alert--warn" role="alert">{lookupError}</div>}
                </>
              ) : products.length === 0 ? (
                <div className="sl-empty" style={{ padding: '24px 8px' }}>
                  <div className="sl-empty-ic"><Icon name="box" size={28} /></div>
                  <h3>{k.noStockTitle}</h3>
                  <p>{k.noStockHint}</p>
                  <Link href="/app/products" className="btn btn-ghost">{k.goStock}</Link>
                </div>
              ) : (
                <>
                  <div className="auth-field">
                    <label htmlFor="productSearch">{hasItems && paymentType !== 'installment' ? k.listAddMore : k.productSearch}</label>
                    <div className="sl-search">
                      <Icon name="search" size={16} />
                      <input
                        id="productSearch"
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={tr(k.productSearchPlaceholder, { n: products.length })}
                        disabled={isPending}
                        autoComplete="off"
                      />
                    </div>
                  </div>
                  <ul className="sl-picker" role="group" aria-label={d.common.products}>
                    {visibleProducts.items.length === 0 && (
                      <li className="sl-picker-more">{d.common.nothingFound}</li>
                    )}
                    {visibleProducts.items.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          className="sl-pick"
                          aria-pressed={inCart.has(p.id)}
                          // Bosilgan tovar qayta bosilsa — savatchadan chiqadi
                          onClick={() => (inCart.has(p.id) ? removeItem(p.id) : addItem(p))}
                          disabled={isPending}
                        >
                          <b>{p.name}</b>
                          <span>
                            {p.branchName}
                            {p.trackQuantity && p.available != null ? ` · ${tr(k.leftN, { n: qtyWithUnit(p.available, p.unit, d.stock.fields.units) })}` : ''}
                          </span>
                          <strong>{fmtMoney(p.salePrice)}</strong>
                        </button>
                      </li>
                    ))}
                    {visibleProducts.more > 0 && (
                      <li className="sl-picker-more">{tr(k.moreN, { n: visibleProducts.more })}</li>
                    )}
                  </ul>
                  {lookupError && <div className="auth-alert auth-alert--warn" role="alert">{lookupError}</div>}
                </>
              )}
            </div>
          </section>

          <section className="sl-card sl-pos-extra" aria-labelledby="sl-extra">
            <div className="sl-card-head"><h2 id="sl-extra">{k.extra}</h2></div>
            <div className="sl-fields">
              {mediaEnabled && (
                <div className="auth-field">
                  <label>{k.salePhoto}</label>
                  <ImageUploadField disabled={fieldsOff} />
                </div>
              )}
              <div className="auth-field">
                <label htmlFor="notes">{d.common.note}</label>
                <textarea id="notes" name="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={fieldsOff} className="text-area" placeholder={d.common.optional} />
              </div>
            </div>
          </section>
        </div>

        <aside className="sl-pos-right">
          <section className="sl-card" aria-labelledby="sl-step2">
            <div className="sl-card-head"><h2 id="sl-step2"><span className="sl-step">2</span>{d.common.payment}</h2></div>
            <div className="sl-fields">
              <fieldset className="sl-payseg">
                <legend>{d.sales.paymentType}</legend>
                {paymentTypes.map((t) => (
                  <label key={t}>
                    <input
                      type="radio"
                      name="paymentType"
                      value={t}
                      checked={paymentType === t}
                      onChange={() => setPaymentType(t)}
                      disabled={fieldsOff}
                    />
                    {d.sales.paymentTypes[t]}
                  </label>
                ))}
              </fieldset>

              <div className="auth-field">
                <label htmlFor="totalAmount">{k.totalAmount}</label>
                <PriceInput id="totalAmount" name="totalAmount" required value={totalAmount} onValueChange={setTotalAmount} disabled={fieldsOff} />
              </div>

              {paymentType !== 'cash' && (
                <div className={paymentType === 'installment' ? 'sl-fields-2' : undefined}>
                  <div className="auth-field">
                    <label htmlFor="paidAmount">{paymentType === 'installment' || paymentType === 'bank_credit' ? k.downPayment : k.paidNow}</label>
                    <PriceInput id="paidAmount" name="paidAmount" value={paidAmount} onValueChange={setPaidAmount} disabled={fieldsOff} />
                  </div>
                  {paymentType === 'installment' && (
                    <div className="auth-field">
                      <label htmlFor="installmentMonths">{k.months}</label>
                      <input
                        id="installmentMonths"
                        name="installmentMonths"
                        type="number"
                        min={1}
                        max={60}
                        value={months}
                        onChange={(e) => setMonths(e.target.value)}
                        disabled={fieldsOff}
                        inputMode="numeric"
                      />
                      {Number(months) > PQ294_MAX_MONTHS && (
                        <small className="field-hint" style={{ color: 'var(--warn)' }}>
                          {tr(k.pq294Warn, { n: PQ294_MAX_MONTHS })}
                        </small>
                      )}
                    </div>
                  )}
                </div>
              )}

              {paymentType === 'bank_credit' && (
                <div className="auth-field">
                  <label id="sl-banks-l">{multiBank ? k.banksLabel : k.bank}</label>
                  {bankOptions.length === 0 && !canAddBank ? (
                    <p className="field-hint">
                      {k.noBank} <Link href="/app/kredit-kassa">{k.creditKassa}</Link>
                    </p>
                  ) : (
                    <>
                      <div className="sl-banks" role="group" aria-labelledby="sl-banks-l">
                        {bankRows.map((r, i) => (
                          <div key={i} className={`sl-bank-row${multiBank ? ' sl-bank-row--multi' : ''}`}>
                            <div className="sl-bank-pick">
                              <SelectAdd
                                id={`sl-bank-${i}`}
                                ariaLabel={tr(k.bankRowAria, { n: i + 1 })}
                                value={r.bank}
                                onChange={(v) => updateBankRow(i, { bank: v })}
                                required
                                disabled={fieldsOff}
                                placeholder={k.selectPlaceholder}
                                // Bir bank ikki qatorda tanlanmasin
                                options={bankOptions
                                  .filter((b) => b === r.bank || !bankRows.some((x, j) => j !== i && x.bank === b))
                                  .map((b) => ({ value: b, label: b }))}
                                maxLength={80}
                                onAdd={addBank}
                              />
                            </div>
                            {multiBank && (
                              <>
                                <PriceInput
                                  ariaLabel={tr(k.bankAmountAria, { n: i + 1 })}
                                  value={r.amount}
                                  onValueChange={(v) => updateBankRow(i, { amount: v })}
                                  disabled={fieldsOff}
                                  placeholder="0"
                                />
                                <button
                                  type="button"
                                  className="sl-bank-del"
                                  onClick={() => removeBankRow(i)}
                                  disabled={fieldsOff}
                                  aria-label={k.removeBankRow}
                                  title={k.removeBankRow}
                                >
                                  <Icon name="close" size={16} />
                                </button>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                      <input type="hidden" name="bankParts" value={bankPartsJson} />
                      {multiBank ? (
                        <span
                          className={`field-hint sl-bank-sum${unallocated === 0 && !bankZeroRow ? ' sl-bank-sum--ok' : ' sl-bank-sum--bad'}`}
                          aria-live="polite"
                        >
                          {unallocated === 0
                            ? bankZeroRow ? d.sales.actions.bankPartsBadAmount : k.allocated
                            : unallocated > 0
                              ? tr(k.unallocated, { sum: fmtMoney(unallocated) })
                              : tr(k.overAllocated, { sum: fmtMoney(-unallocated) })}
                        </span>
                      ) : (
                        <span className="field-hint">
                          {withNasiya ? tr(k.bankSingleNasiyaHint, { sum: fmtMoney(Math.max(0, bankRest)) }) : k.bankSingleHint}
                        </span>
                      )}
                      {bankRows.length < Math.min(MAX_BANK_PARTS, bankOptions.length) && (
                        <button type="button" className="sl-quick sl-bank-add" onClick={addBankRow} disabled={fieldsOff}>
                          <Icon name="plus" size={14} /> {k.addBankRow}
                        </button>
                      )}
                      {canNasiya && !nasiyaOn && (
                        <button type="button" className="sl-quick sl-bank-add" onClick={() => toggleNasiya(true)} disabled={fieldsOff}>
                          <Icon name="plus" size={14} /> {k.addNasiyaPart}
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Bank krediti + nasiya: banklardan qolgan qismini mijoz oyma-oy do'konga to'laydi (Nasiya bo'limi) */}
              {withNasiya && (
                <div className="auth-field" role="group" aria-labelledby="sl-nasiya-l">
                  <label id="sl-nasiya-l" htmlFor="nasiyaAmount">{k.nasiyaPart}</label>
                  <div className="sl-bank-row sl-bank-row--multi">
                    <div className="sl-bank-pick">
                      <PriceInput
                        id="nasiyaAmount"
                        name="nasiyaAmount"
                        value={nasiyaAmount}
                        onValueChange={setNasiyaAmount}
                        disabled={fieldsOff}
                        placeholder="0"
                      />
                    </div>
                    <button
                      type="button"
                      className="sl-bank-del"
                      onClick={() => toggleNasiya(false)}
                      disabled={fieldsOff}
                      aria-label={k.removeNasiyaPart}
                      title={k.removeNasiyaPart}
                    >
                      <Icon name="close" size={16} />
                    </button>
                  </div>
                  {nasiyaN >= rest && rest > 0 ? (
                    <span className="field-hint sl-bank-sum sl-bank-sum--bad" aria-live="polite">
                      {tr(d.sales.actions.nasiyaPartTooBig, { sum: fmtMoney(rest) })}
                    </span>
                  ) : (
                    <span className="field-hint">{k.nasiyaPartHint}</span>
                  )}
                  {bankNasiyaMulti && (
                    <div className="auth-alert auth-alert--warn" role="alert">{d.sales.actions.bankNasiyaOneItem}</div>
                  )}
                  <div className="sl-fields-2">
                    <div className="auth-field">
                      <label htmlFor="installmentMonths">{k.months}</label>
                      <input
                        id="installmentMonths"
                        name="installmentMonths"
                        type="number"
                        min={1}
                        max={60}
                        value={months}
                        onChange={(e) => setMonths(e.target.value)}
                        disabled={fieldsOff}
                        inputMode="numeric"
                      />
                      {Number(months) > PQ294_MAX_MONTHS && (
                        <small className="field-hint" style={{ color: 'var(--warn)' }}>
                          {tr(k.pq294Warn, { n: PQ294_MAX_MONTHS })}
                        </small>
                      )}
                    </div>
                    <div className="auth-field">
                      <label htmlFor="payDay">{k.payDayLabel}</label>
                      <select
                        id="payDay"
                        name="payDay"
                        value={payDay}
                        onChange={(e) => setPayDay(e.target.value)}
                        disabled={fieldsOff || !payDay}
                        required
                      >
                        {Array.from({ length: 31 }, (_, i) => String(i + 1)).map((v) => (
                          <option key={v} value={v}>{tr(k.payDayOption, { n: v })}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {paymentType === 'installment' && (
                <div className="auth-field">
                  <label htmlFor="payDay">{k.payDay}</label>
                  <select
                    id="payDay"
                    name="payDay"
                    value={payDay}
                    onChange={(e) => setPayDay(e.target.value)}
                    disabled={fieldsOff || !payDay}
                    required
                  >
                    {Array.from({ length: 31 }, (_, i) => String(i + 1)).map((v) => (
                      <option key={v} value={v}>{tr(k.payDayOption, { n: v })}</option>
                    ))}
                  </select>
                  <small className="field-hint">{k.payDayHint}{(payDayN ?? 0) >= 29 ? ` ${k.payDayEndHint}` : ''}</small>
                </div>
              )}

              {paymentType === 'debt' && (
                <div className="auth-field">
                  <label htmlFor="dueDate">{d.sales.dueDate} *</label>
                  {/* Tez tanlov — brauzer sana oynasi (ko'pincha ruscha) ikkilamchi bo'lib qoladi */}
                  <div className="sl-due-quick" role="group" aria-label={k.quickDueAria}>
                    {DUE_PRESETS.map((p) => {
                      const v = now ? isoDay('days' in p ? addDays(now, p.days) : addMonthsClamped(now, p.months)) : '';
                      return (
                        <button
                          key={p.key}
                          type="button"
                          className="sl-quick"
                          aria-pressed={!!v && dueDate === v}
                          onClick={() => setDueDate(v)}
                          disabled={fieldsOff || !now}
                        >
                          {d.sales.duePresets[p.key]}
                        </button>
                      );
                    })}
                  </div>
                  <input
                    id="dueDate"
                    name="dueDate"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    disabled={fieldsOff}
                  />
                </div>
              )}

              {paymentType === 'cash' && <input type="hidden" name="paidAmount" value={totalAmount || '0'} />}

              {hasItems && paymentType === 'installment' && (
                <div className="sl-preview" aria-live="polite">
                  <div className="sl-preview-big">
                    <span>{d.sales.monthlyPayment}</span>
                    <strong>{monthsN > 0 ? `${fmtMoney(monthly)} ${d.common.sum}` : '—'}</strong>
                  </div>
                  <div className="sl-preview-row"><span>{k.restInstallment}</span><strong>{fmtMoney(rest)} {d.common.sum}</strong></div>
                  {monthsN > 1 && lastMonth !== monthly && (
                    <div className="sl-preview-row"><span>{tr(k.lastMonth, { n: monthsN })}</span><strong>{fmtMoney(lastMonth)} {d.common.sum}</strong></div>
                  )}
                  {monthsN > 0 && now && (
                    <div className="sl-preview-row">
                      <span>{k.firstPayment}</span>
                      <strong>{fmtDate(installmentDueDate(now, 1, payDayN))}</strong>
                    </div>
                  )}
                  {monthsN > 1 && now && (
                    <div className="sl-preview-row">
                      <span>{k.lastPayment}</span>
                      <strong>{fmtDate(installmentDueDate(now, monthsN, payDayN))}</strong>
                    </div>
                  )}
                  {overpaid && <div className="sl-preview-warn">{k.overpaidDown}</div>}
                </div>
              )}
              {hasItems && paymentType === 'debt' && (
                <div className="sl-preview sl-preview--debt" aria-live="polite">
                  <div className="sl-preview-big"><span>{k.restDebt}</span><strong>{fmtMoney(rest)} {d.common.sum}</strong></div>
                  {overpaid && <div className="sl-preview-warn">{k.overpaidPaid}</div>}
                </div>
              )}
              {hasItems && paymentType === 'bank_credit' && (
                <div className="sl-preview sl-preview--bank" aria-live="polite">
                  <div className="sl-preview-big"><span>{k.viaBank}</span><strong>{fmtMoney(Math.max(0, bankRest))} {d.common.sum}</strong></div>
                  {multiBank && bankRows.filter((r) => r.bank).map((r) => (
                    <div key={r.bank} className="sl-preview-row"><span>{r.bank}</span><strong>{fmtMoney(bankAmount(r))} {d.common.sum}</strong></div>
                  ))}
                  {withNasiya && (
                    <>
                      <div className="sl-preview-row"><span>{k.restInstallment}</span><strong>{fmtMoney(nasiyaN)} {d.common.sum}</strong></div>
                      <div className="sl-preview-row">
                        <span>{d.sales.monthlyPayment}</span>
                        <strong>{monthsN > 0 && nasiyaN > 0 ? `${fmtMoney(nasiyaMonthly)} ${d.common.sum}` : '—'}</strong>
                      </div>
                      {monthsN > 1 && nasiyaN > 0 && nasiyaLastMonth !== nasiyaMonthly && (
                        <div className="sl-preview-row"><span>{tr(k.lastMonth, { n: monthsN })}</span><strong>{fmtMoney(nasiyaLastMonth)} {d.common.sum}</strong></div>
                      )}
                      {monthsN > 0 && now && (
                        <div className="sl-preview-row">
                          <span>{k.firstPayment}</span>
                          <strong>{fmtDate(installmentDueDate(now, 1, payDayN))}</strong>
                        </div>
                      )}
                    </>
                  )}
                  {overpaid && <div className="sl-preview-warn">{k.overpaidDown}</div>}
                </div>
              )}
            </div>
          </section>

          {paymentType !== 'cash' && (
            <section className="sl-card" aria-labelledby="sl-step3">
              <div className="sl-card-head"><h2 id="sl-step3"><span className="sl-step">3</span>{d.common.customer}</h2></div>
              <div className="sl-fields">
                <div className="auth-field">
                  <label htmlFor="customerName">{k.customerName}</label>
                  <input id="customerName" name="customerName" type="text" required value={customerName} onChange={(e) => setCustomerName(e.target.value)} disabled={fieldsOff} placeholder={k.customerNamePh} autoComplete="name" />
                </div>
                <div className="auth-field">
                  <label htmlFor="customerPhone">{k.customerPhone}</label>
                  <input id="customerPhone" name="customerPhone" type="tel" required value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} disabled={fieldsOff} placeholder="+998 99 000 00 00" autoComplete="tel" />
                </div>
              </div>
            </section>
          )}

          {/* Jami — desktopda o'ng ustun pastida, mobilda tab bar ustidagi qotirilgan panel */}
          <section className={`sl-card sl-pos-total${hasItems ? '' : ' sl-pos-total--empty'}`} aria-label={d.common.total}>
            {hasItems ? (
              <div className="sl-summary-total" aria-live="polite">
                <span>{paymentType === 'cash' ? k.payNow : k.payNowPart}</span>
                <strong>{fmtMoney(Math.min(paid, total))} <small>{d.common.sum}</small></strong>
              </div>
            ) : (
              <div className="sl-sum-hint">
                <span className="sl-sum-hint-ic" aria-hidden><Icon name={isPhoneShop ? 'search' : 'box'} size={18} /></span>
                <div>
                  <b>{k.noProductTitle}</b>
                  <span>{tr(k.noProductHint, { how: isPhoneShop ? k.noProductImei : k.noProductList })}</span>
                </div>
              </div>
            )}
            <div className="sl-card-body sl-pos-submit">
              <button type="submit" className="btn btn-primary sl-submit" disabled={isPending || !hasItems || qtyBad || bankBlocked || installmentMulti}>
                {isPending ? k.selling : (
                  <>
                    <span className="ux-hide-mobile">{hasItems ? k.confirmSale : d.common.confirm}</span>
                    <span className="ux-only-mobile">{d.common.confirm}</span>
                  </>
                )}
              </button>
            </div>
          </section>
        </aside>
      </div>
    </form>
  );
}
