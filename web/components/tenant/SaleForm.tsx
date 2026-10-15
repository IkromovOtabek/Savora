'use client';

import Link from 'next/link';
import { useActionState, useEffect, useMemo, useState, useTransition } from 'react';
import { useToastOnState } from '@/lib/useToastOnState';
import { createSaleAction, lookupProductByImei } from '@/app/actions/sales';
import { PaymentType } from '@/lib/models/tenant/Sale';
import { OrgFeatures } from '@/lib/features';
import { BANKS } from '@/lib/banks';
import { fmtDate, fmtMoney } from '@/lib/format';
import { addMonthsClamped } from '@/lib/dates';
import BackLink from '@/components/ui/BackLink';
import ImageUploadField from '@/components/ui/ImageUploadField';
import PriceInput from '@/components/ui/PriceInput';
import Icon from '@/components/icons/Icon';

interface ProductOption {
  id: string;
  name: string;
  salePrice: number;
  branchName: string;
  imei?: string;
  trackQuantity?: boolean;
  available?: number;
}

/** Yagona atamalar: Naqd, Qarz, Nasiya, Bank krediti */
const PAYMENT_LABELS: Record<PaymentType, string> = {
  cash: 'Naqd',
  debt: 'Qarz',
  installment: 'Nasiya',
  bank_credit: 'Bank krediti',
};

/** Ro'yxatda bir vaqtda ko'rsatiladigan mahsulotlar soni (qolgani qidiruv orqali) */
const PICK_LIMIT = 60;

/** To'lov muddati uchun tez tanlovlar */
const DUE_PRESETS: { label: string; days?: number; months?: number }[] = [
  { label: '1 hafta', days: 7 },
  { label: '2 hafta', days: 14 },
  { label: '1 oy', months: 1 },
  { label: '3 oy', months: 3 },
];

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

interface Props {
  isPhoneShop: boolean;
  products: ProductOption[];
  mediaEnabled?: boolean;
  features: OrgFeatures;
  creditBanks: string[];
  preselectId?: string;
  /** Ombor menyusidan tanlangan to'lov turi (cash/installment/bank_credit) */
  preselectPayment?: string;
}

export default function SaleForm({ isPhoneShop, products, mediaEnabled, features, creditBanks, preselectId, preselectPayment }: Props) {
  const [state, formAction, isPending] = useActionState(createSaleAction, null);
  useToastOnState(state);
  const preselected = preselectId ? products.find((p) => p.id === preselectId) : undefined;
  const [imei, setImei] = useState('');
  const [selectedId, setSelectedId] = useState(preselected?.id ?? products[0]?.id ?? '');
  const [product, setProduct] = useState<{
    id: string;
    name: string;
    imei: string;
    salePrice: number;
    branchName: string;
    trackQuantity?: boolean;
    available?: number;
  } | null>(preselected ? {
    id: preselected.id,
    name: preselected.name,
    imei: preselected.imei ?? '',
    salePrice: preselected.salePrice,
    branchName: preselected.branchName,
    trackQuantity: preselected.trackQuantity,
    available: preselected.available,
  } : null);
  const [lookupError, setLookupError] = useState('');
  const [searching, startSearch] = useTransition();
  const initialPayment: PaymentType =
    preselectPayment === 'installment' && (features.variant || features.nasiya) ? 'installment'
    : preselectPayment === 'bank_credit' && features.creditKassa ? 'bank_credit'
    : preselectPayment === 'debt' ? 'debt'
    : 'cash';
  const [paymentType, setPaymentType] = useState<PaymentType>(initialPayment);
  const [totalAmount, setTotalAmount] = useState(preselected ? String(preselected.salePrice) : (!isPhoneShop && products[0] ? String(products[0].salePrice) : ''));
  const [saleQty, setSaleQty] = useState('1');
  // Jonli hisob-kitob uchun (forma maydon nomlari o'zgarmagan)
  const [paidAmount, setPaidAmount] = useState('0');
  const [months, setMonths] = useState('12');
  const [query, setQuery] = useState('');
  const [dueDate, setDueDate] = useState('');
  // Sana faqat brauzerda (server/klient vaqt mintaqasi farqi hydration xatosiga olib kelmasin)
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { setNow(new Date()); }, []);

  const paymentTypes = useMemo(() => {
    return (Object.keys(PAYMENT_LABELS) as PaymentType[]).filter((t) => {
      if (t === 'installment' && !features.variant) return false;
      if (t === 'bank_credit' && !features.creditKassa) return false;
      return true;
    });
  }, [features.variant, features.creditKassa]);

  const bankOptions = features.creditKassa && creditBanks.length > 0 ? creditBanks : [...BANKS];

  const selectedOption = products.find((p) => p.id === selectedId);
  const picked = isPhoneShop
    ? product
    : selectedOption
      ? {
          id: selectedId,
          name: selectedOption.name,
          imei: selectedOption.imei ?? '',
          salePrice: selectedOption.salePrice,
          branchName: selectedOption.branchName,
          trackQuantity: selectedOption.trackQuantity,
          available: selectedOption.available,
        }
      : null;

  const showQty = picked?.trackQuantity === true;

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

  function syncTotal(price: number, qty: number) {
    setTotalAmount(String(price * qty));
  }

  function handleImeiSearch() {
    setLookupError('');
    startSearch(async () => {
      const result = await lookupProductByImei(imei);
      if (!result) {
        setProduct(null);
        setLookupError('Mahsulot topilmadi yoki omborda emas.');
        return;
      }
      setProduct(result);
      syncTotal(result.salePrice, result.trackQuantity ? 1 : 1);
      if (result.trackQuantity) setSaleQty('1');
    });
  }

  function handleProductPick(id: string) {
    setSelectedId(id);
    const p = products.find((x) => x.id === id);
    if (p) {
      setTotalAmount(String(p.salePrice * (p.trackQuantity ? Number(saleQty) || 1 : 1)));
      if (!p.trackQuantity) setSaleQty('1');
    }
  }

  function handleQtyChange(v: string) {
    setSaleQty(v);
    const p = isPhoneShop ? product : products.find((x) => x.id === selectedId);
    if (p?.trackQuantity) {
      const q = Math.max(1, Number(v) || 1);
      setTotalAmount(String(p.salePrice * q));
    }
  }

  function stepQty(delta: number) {
    const max = picked?.available ?? Infinity;
    const next = Math.min(max, Math.max(1, (Number(saleQty) || 1) + delta));
    handleQtyChange(String(next));
  }

  // Jonli ko'rinish (faqat ko'rsatish uchun — server o'zi qayta hisoblaydi)
  const total = Number(totalAmount) || 0;
  const paid = paymentType === 'cash' ? total : Number(paidAmount) || 0;
  const rest = Math.max(0, total - paid);
  const monthsN = Math.min(60, Math.max(0, Math.floor(Number(months) || 0)));
  const monthly = monthsN > 0 ? Math.floor(rest / monthsN) : 0;
  const lastMonth = monthsN > 0 ? rest - monthly * (monthsN - 1) : 0;
  const overpaid = paymentType !== 'cash' && paid > total && total > 0;
  const fieldsOff = isPending || !picked;

  return (
    <form action={formAction}>
      <div className="t-page-head">
        <div>
          <BackLink href="/app/sales">Sotuvlar</BackLink>
          <h1 className="t-page-title">Yangi sotuv</h1>
          <p className="t-page-sub">Mahsulotni tanlang, to&apos;lov turini belgilang va tasdiqlang.</p>
        </div>
      </div>

      {state?.error && <div className="auth-alert auth-alert--error" role="alert" style={{ marginBottom: 16 }}>{state.error}</div>}

      <div className="sl-pos">
        <div className="sl-pos-left">
          <section className="sl-card" aria-labelledby="sl-step1">
            <div className="sl-card-head"><h2 id="sl-step1"><span className="sl-step">1</span>Mahsulot</h2></div>
            <div className="sl-fields">
              {isPhoneShop ? (
                <>
                  <div className="sl-imei-row">
                    <div className="auth-field">
                      <label htmlFor="imei">IMEI qidiruv</label>
                      <input
                        id="imei"
                        type="text"
                        value={imei}
                        onChange={(e) => setImei(e.target.value.toUpperCase())}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (imei.trim() && !searching) handleImeiSearch();
                          }
                        }}
                        className="imei-input"
                        disabled={isPending}
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="IMEI raqamini kiriting"
                      />
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary btn-with-icon sl-imei-btn"
                      onClick={handleImeiSearch}
                      disabled={searching || !imei.trim()}
                      aria-label={searching ? 'Qidirilmoqda' : 'Qidirish'}
                    >
                      <Icon name="search" size={16} />
                      <span className="ux-hide-mobile">{searching ? 'Qidirilmoqda...' : 'Qidirish'}</span>
                    </button>
                  </div>
                  {lookupError && <div className="auth-alert auth-alert--warn" role="alert">{lookupError}</div>}
                </>
              ) : products.length === 0 ? (
                <div className="sl-empty" style={{ padding: '24px 8px' }}>
                  <div className="sl-empty-ic"><Icon name="box" size={28} /></div>
                  <h3>Omborda mahsulot yo&apos;q</h3>
                  <p>Sotish uchun avval omborga mahsulot qo&apos;shing.</p>
                  <Link href="/app/products" className="btn btn-ghost">Omborga o&apos;tish</Link>
                </div>
              ) : (
                <>
                  <div className="auth-field">
                    <label htmlFor="productSearch">Mahsulot qidirish</label>
                    <div className="sl-search">
                      <Icon name="search" size={16} />
                      <input
                        id="productSearch"
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={`Nomi, filial yoki kod (${products.length} ta)`}
                        disabled={isPending}
                        autoComplete="off"
                      />
                    </div>
                  </div>
                  <ul className="sl-picker" role="group" aria-label="Mahsulotlar">
                    {visibleProducts.items.length === 0 && (
                      <li className="sl-picker-more">Hech narsa topilmadi.</li>
                    )}
                    {visibleProducts.items.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          className="sl-pick"
                          aria-pressed={p.id === selectedId}
                          onClick={() => handleProductPick(p.id)}
                          disabled={isPending}
                        >
                          <b>{p.name}</b>
                          <span>
                            {p.branchName}
                            {p.trackQuantity && p.available != null ? ` · ${p.available} ta qoldi` : ''}
                          </span>
                          <strong>{fmtMoney(p.salePrice)}</strong>
                        </button>
                      </li>
                    ))}
                    {visibleProducts.more > 0 && (
                      <li className="sl-picker-more">Yana {visibleProducts.more} ta — qidiruvni aniqlashtiring.</li>
                    )}
                  </ul>
                </>
              )}

              {picked && (
                <>
                  <div className="sl-picked">
                    <input type="hidden" name="productId" value={picked.id} />
                    {showQty && <input type="hidden" name="saleQty" value={saleQty} />}
                    <span className="sl-picked-ic" aria-hidden><Icon name="check" size={20} strokeWidth={2.5} /></span>
                    <div style={{ minWidth: 0 }}>
                      <b>{picked.name}</b>
                      <div className="sl-picked-meta">
                        {isPhoneShop && picked.imei && <code>{picked.imei}</code>}
                        <span>Filial: {picked.branchName}</span>
                        <span>Narx: {fmtMoney(picked.salePrice)} so&apos;m</span>
                        {showQty && picked.available != null && <span>Qoldiq: {picked.available} ta</span>}
                      </div>
                    </div>
                  </div>
                  {showQty && (
                    <div className="auth-field">
                      <label htmlFor="saleQty">Nechta sotiladi? *</label>
                      <div className="sl-qty">
                        <button type="button" onClick={() => stepQty(-1)} disabled={isPending || (Number(saleQty) || 1) <= 1} aria-label="Kamaytirish">−</button>
                        <input
                          id="saleQty"
                          type="number"
                          min={1}
                          max={picked.available ?? undefined}
                          value={saleQty}
                          onChange={(e) => handleQtyChange(e.target.value)}
                          disabled={isPending}
                          inputMode="numeric"
                        />
                        <button
                          type="button"
                          onClick={() => stepQty(1)}
                          disabled={isPending || (picked.available != null && (Number(saleQty) || 1) >= picked.available)}
                          aria-label="Ko'paytirish"
                        >+</button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>

          <section className="sl-card sl-pos-extra" aria-labelledby="sl-extra">
            <div className="sl-card-head"><h2 id="sl-extra">Qo&apos;shimcha</h2></div>
            <div className="sl-fields">
              {mediaEnabled && (
                <div className="auth-field">
                  <label>Sotuv rasmi</label>
                  <ImageUploadField disabled={fieldsOff} />
                </div>
              )}
              <div className="auth-field">
                <label htmlFor="notes">Izoh</label>
                <textarea id="notes" name="notes" rows={2} disabled={fieldsOff} className="text-area" placeholder="Ixtiyoriy" />
              </div>
            </div>
          </section>
        </div>

        <aside className="sl-pos-right">
          <section className="sl-card" aria-labelledby="sl-step2">
            <div className="sl-card-head"><h2 id="sl-step2"><span className="sl-step">2</span>To&apos;lov</h2></div>
            <div className="sl-fields">
              <fieldset className="sl-payseg">
                <legend>To&apos;lov turi</legend>
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
                    {PAYMENT_LABELS[t]}
                  </label>
                ))}
              </fieldset>

              <div className="auth-field">
                <label htmlFor="totalAmount">Jami summa *</label>
                <PriceInput id="totalAmount" name="totalAmount" required value={totalAmount} onValueChange={setTotalAmount} disabled={fieldsOff} />
              </div>

              {paymentType === 'bank_credit' && (
                <div className="auth-field">
                  <label htmlFor="bankName">Bank *</label>
                  {bankOptions.length === 0 ? (
                    <p className="field-hint">
                      Bank qo&apos;shilmagan. <Link href="/app/kredit-kassa">Kredit kassa</Link>
                    </p>
                  ) : (
                    <select id="bankName" name="bankName" required disabled={fieldsOff}>
                      <option value="">Tanlang...</option>
                      {bankOptions.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                  )}
                </div>
              )}

              {paymentType !== 'cash' && (
                <div className={paymentType === 'installment' ? 'sl-fields-2' : undefined}>
                  <div className="auth-field">
                    <label htmlFor="paidAmount">{paymentType === 'installment' ? 'Boshlang\'ich to\'lov' : 'Hozir to\'langan'}</label>
                    <PriceInput id="paidAmount" name="paidAmount" value={paidAmount} onValueChange={setPaidAmount} disabled={fieldsOff} />
                  </div>
                  {paymentType === 'installment' && (
                    <div className="auth-field">
                      <label htmlFor="installmentMonths">Muddat (oy)</label>
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
                    </div>
                  )}
                </div>
              )}

              {paymentType !== 'cash' && (
                <div className="auth-field">
                  <label htmlFor="dueDate">To&apos;lov muddati {paymentType === 'installment' ? '(ixtiyoriy)' : '*'}</label>
                  {/* Tez tanlov — brauzer sana oynasi (ko'pincha ruscha) ikkilamchi bo'lib qoladi */}
                  <div className="sl-due-quick" role="group" aria-label="Muddatni tez tanlash">
                    {DUE_PRESETS.map((d) => {
                      const v = now ? isoDay(d.days ? addDays(now, d.days) : addMonthsClamped(now, d.months ?? 0)) : '';
                      return (
                        <button
                          key={d.label}
                          type="button"
                          className="sl-quick"
                          aria-pressed={!!v && dueDate === v}
                          onClick={() => setDueDate(v)}
                          disabled={fieldsOff || !now}
                        >
                          {d.label}
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

              {picked && paymentType === 'installment' && (
                <div className="sl-preview" aria-live="polite">
                  <div className="sl-preview-big">
                    <span>Oylik to&apos;lov</span>
                    <strong>{monthsN > 0 ? `${fmtMoney(monthly)} so'm` : '—'}</strong>
                  </div>
                  <div className="sl-preview-row"><span>Nasiyaga qoladi</span><strong>{fmtMoney(rest)} so&apos;m</strong></div>
                  {monthsN > 1 && lastMonth !== monthly && (
                    <div className="sl-preview-row"><span>Oxirgi ({monthsN}-) oy</span><strong>{fmtMoney(lastMonth)} so&apos;m</strong></div>
                  )}
                  {monthsN > 0 && now && (
                    <div className="sl-preview-row">
                      <span>Birinchi to&apos;lov</span>
                      <strong>{fmtDate(addMonthsClamped(now, 1))}</strong>
                    </div>
                  )}
                  {overpaid && <div className="sl-preview-warn">Boshlang&apos;ich to&apos;lov jami summadan oshmasligi kerak.</div>}
                </div>
              )}
              {picked && paymentType === 'debt' && (
                <div className="sl-preview sl-preview--debt" aria-live="polite">
                  <div className="sl-preview-big"><span>Qarzga qoladi</span><strong>{fmtMoney(rest)} so&apos;m</strong></div>
                  {overpaid && <div className="sl-preview-warn">To&apos;langan summa jami summadan oshmasligi kerak.</div>}
                </div>
              )}
              {picked && paymentType === 'bank_credit' && (
                <div className="sl-preview sl-preview--bank" aria-live="polite">
                  <div className="sl-preview-big"><span>Bank orqali</span><strong>{fmtMoney(rest)} so&apos;m</strong></div>
                  {overpaid && <div className="sl-preview-warn">To&apos;langan summa jami summadan oshmasligi kerak.</div>}
                </div>
              )}
            </div>
          </section>

          {paymentType !== 'cash' && (
            <section className="sl-card" aria-labelledby="sl-step3">
              <div className="sl-card-head"><h2 id="sl-step3"><span className="sl-step">3</span>Mijoz</h2></div>
              <div className="sl-fields">
                <div className="auth-field">
                  <label htmlFor="customerName">Mijoz ismi *</label>
                  <input id="customerName" name="customerName" type="text" required disabled={fieldsOff} placeholder="F.I.Sh" autoComplete="name" />
                </div>
                <div className="auth-field">
                  <label htmlFor="customerPhone">Telefon raqami *</label>
                  <input id="customerPhone" name="customerPhone" type="tel" required disabled={fieldsOff} placeholder="+998..." autoComplete="tel" />
                </div>
              </div>
            </section>
          )}

          {/* Jami — desktopda o'ng ustun pastida, mobilda tab bar ustidagi qotirilgan panel */}
          <section className={`sl-card sl-pos-total${picked ? '' : ' sl-pos-total--empty'}`} aria-label="Jami">
            {picked ? (
              <div className="sl-summary-total" aria-live="polite">
                <span>{paymentType === 'cash' ? 'To\'lanadi' : 'Hozir to\'lanadi'}</span>
                <strong>{fmtMoney(Math.min(paid, total))} <small>so&apos;m</small></strong>
              </div>
            ) : (
              <div className="sl-sum-hint">
                <span className="sl-sum-hint-ic" aria-hidden><Icon name={isPhoneShop ? 'search' : 'box'} size={18} /></span>
                <div>
                  <b>Mahsulot tanlanmagan</b>
                  <span>{isPhoneShop ? 'IMEI raqami orqali qidiring' : 'Ro\'yxatdan mahsulotni tanlang'} — summa shu yerda chiqadi.</span>
                </div>
              </div>
            )}
            <div className="sl-card-body sl-pos-submit">
              <button type="submit" className="btn btn-primary sl-submit" disabled={isPending || !picked}>
                {isPending ? 'Sotilmoqda...' : (
                  <>
                    <span className="ux-hide-mobile">{picked ? 'Sotuvni tasdiqlash' : 'Tasdiqlash'}</span>
                    <span className="ux-only-mobile">Tasdiqlash</span>
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
