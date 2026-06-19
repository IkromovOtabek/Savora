'use client';

import Link from 'next/link';
import { useActionState, useMemo, useState, useTransition } from 'react';
import { useToastOnState } from '@/lib/useToastOnState';
import { createSaleAction, lookupProductByImei } from '@/app/actions/sales';
import { PAYMENT_TYPE_LABELS, PaymentType } from '@/lib/models/tenant/Sale';
import { OrgFeatures } from '@/lib/features';
import { BANKS } from '@/lib/banks';
import { fmtMoney } from '@/lib/format';
import BackLink from '@/components/ui/BackLink';
import ImageUploadField from '@/components/ui/ImageUploadField';

interface ProductOption {
  id: string;
  name: string;
  salePrice: number;
  branchName: string;
  imei?: string;
  trackQuantity?: boolean;
  available?: number;
}

const PAYMENT_LABELS: Record<PaymentType, string> = {
  ...PAYMENT_TYPE_LABELS,
  installment: 'Variant',
  bank_credit: 'Kredit',
};

interface Props {
  isPhoneShop: boolean;
  products: ProductOption[];
  mediaEnabled?: boolean;
  features: OrgFeatures;
  creditBanks: string[];
  preselectId?: string;
}

export default function SaleForm({ isPhoneShop, products, mediaEnabled, features, creditBanks, preselectId }: Props) {
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
  const [paymentType, setPaymentType] = useState<PaymentType>('cash');
  const [totalAmount, setTotalAmount] = useState(preselected ? String(preselected.salePrice) : '');
  const [saleQty, setSaleQty] = useState('1');

  const paymentTypes = useMemo(() => {
    return (Object.keys(PAYMENT_LABELS) as PaymentType[]).filter((t) => {
      if (t === 'installment' && !features.variant) return false;
      if (t === 'bank_credit' && !features.creditKassa) return false;
      return true;
    });
  }, [features.variant, features.creditKassa]);

  const bankOptions = features.creditKassa && creditBanks.length > 0 ? creditBanks : [...BANKS];

  const picked = isPhoneShop
    ? product
    : products.find((p) => p.id === selectedId)
      ? {
          id: selectedId,
          name: products.find((p) => p.id === selectedId)!.name,
          imei: products.find((p) => p.id === selectedId)!.imei ?? '',
          salePrice: products.find((p) => p.id === selectedId)!.salePrice,
          branchName: products.find((p) => p.id === selectedId)!.branchName,
          trackQuantity: products.find((p) => p.id === selectedId)!.trackQuantity,
          available: products.find((p) => p.id === selectedId)!.available,
        }
      : null;

  const showQty = picked?.trackQuantity === true;

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
    const p = products.find((x) => x.id === selectedId);
    if (p?.trackQuantity) {
      const q = Math.max(1, Number(v) || 1);
      setTotalAmount(String(p.salePrice * q));
    }
  }

  return (
    <div className="panel panel--wide">
      <div className="panel-head">
        <h2>Yangi sotuv</h2>
        <BackLink href="/app/sales" className="btn btn-ghost btn-sm">Orqaga</BackLink>
      </div>

      {state?.error && <div className="auth-alert auth-alert--error" style={{ margin: '16px 24px 0' }}>{state.error}</div>}

      <form action={formAction} className="form-grid">
        <div className="form-section">
          <h3>1. Mahsulot</h3>
          {isPhoneShop ? (
            <>
              <div className="imei-search-row">
                <div className="auth-field" style={{ flex: 1, margin: 0 }}>
                  <label htmlFor="imei">IMEI qidiruv</label>
                  <input id="imei" type="text" value={imei} onChange={(e) => setImei(e.target.value.toUpperCase())} className="imei-input" disabled={isPending} />
                </div>
                <button type="button" className="btn btn-primary btn-sm" onClick={handleImeiSearch} disabled={searching || !imei.trim()}>Qidirish</button>
              </div>
              {lookupError && <div className="auth-alert auth-alert--warn" style={{ marginTop: 12 }}>{lookupError}</div>}
            </>
          ) : (
            <div className="auth-field">
              <label htmlFor="productPick">Mahsulot *</label>
              <select id="productPick" value={selectedId} onChange={(e) => handleProductPick(e.target.value)} disabled={isPending || products.length === 0}>
                {products.length === 0 ? <option value="">Omborda mahsulot yo&apos;q</option> : products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} — {fmtMoney(p.salePrice)} ({p.branchName})</option>
                ))}
              </select>
            </div>
          )}
          {picked && (
            <div className="product-pick">
              <input type="hidden" name="productId" value={picked.id} />
              {showQty && <input type="hidden" name="saleQty" value={saleQty} />}
              <div className="product-pick-name">{picked.name}</div>
              <div className="product-pick-meta">
                {isPhoneShop && picked.imei && <code className="imei-code">{picked.imei}</code>}
                <span>Filial: {picked.branchName}</span>
                <span>Narx: {fmtMoney(picked.salePrice)} so&apos;m</span>
                {showQty && picked.available != null && (
                  <span>Qoldiq: {picked.available} ta</span>
                )}
              </div>
              {showQty && (
                <div className="auth-field" style={{ marginTop: 12, maxWidth: 200 }}>
                  <label htmlFor="saleQty">Nechta sotiladi? *</label>
                  <input
                    id="saleQty"
                    type="number"
                    min={1}
                    max={picked.available ?? undefined}
                    value={saleQty}
                    onChange={(e) => handleQtyChange(e.target.value)}
                    disabled={isPending}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="form-section">
          <h3>2. To&apos;lov turi</h3>
          <div className="form-row">
            <div className="auth-field">
              <label htmlFor="paymentType">To&apos;lov</label>
              <select id="paymentType" name="paymentType" value={paymentType} onChange={(e) => setPaymentType(e.target.value as PaymentType)} disabled={isPending || !picked}>
                {paymentTypes.map((t) => (
                  <option key={t} value={t}>{PAYMENT_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div className="auth-field">
              <label htmlFor="totalAmount">Jami summa *</label>
              <input id="totalAmount" name="totalAmount" type="number" min={0} step={1000} required value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} disabled={isPending || !picked} />
            </div>
          </div>

          {paymentType !== 'cash' && (
            <div className="form-row">
              {paymentType === 'bank_credit' && (
                <div className="auth-field">
                  <label htmlFor="bankName">Bank *</label>
                  {bankOptions.length === 0 ? (
                    <p className="field-hint">
                      Bank qo&apos;shilmagan. <Link href="/app/kredit-kassa">Kredit kassa</Link>
                    </p>
                  ) : (
                    <select id="bankName" name="bankName" required disabled={isPending || !picked}>
                      <option value="">Tanlang...</option>
                      {bankOptions.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                  )}
                </div>
              )}
              <div className="auth-field">
                <label htmlFor="paidAmount">{paymentType === 'installment' ? 'Boshlang\'ich to\'lov' : 'Hozir to\'langan'}</label>
                <input id="paidAmount" name="paidAmount" type="number" min={0} step={1000} defaultValue={0} disabled={isPending || !picked} />
              </div>
              {paymentType === 'installment' && (
                <div className="auth-field">
                  <label htmlFor="installmentMonths">Variant (oy)</label>
                  <input id="installmentMonths" name="installmentMonths" type="number" min={1} max={60} defaultValue={12} disabled={isPending || !picked} />
                </div>
              )}
              <div className="auth-field">
                <label htmlFor="dueDate">To&apos;lov muddati {paymentType === 'installment' ? '(ixtiyoriy)' : '*'}</label>
                <input id="dueDate" name="dueDate" type="date" disabled={isPending || !picked} />
              </div>
            </div>
          )}

          {paymentType === 'cash' && <input type="hidden" name="paidAmount" value={totalAmount || '0'} />}

          {paymentType !== 'cash' && (
            <div className="form-row">
              <div className="auth-field">
                <label htmlFor="customerName">Mijoz ismi *</label>
                <input id="customerName" name="customerName" type="text" required disabled={isPending || !picked} placeholder="F.I.Sh" />
              </div>
              <div className="auth-field">
                <label htmlFor="customerPhone">Telefon raqami *</label>
                <input id="customerPhone" name="customerPhone" type="tel" required disabled={isPending || !picked} placeholder="+998..." />
              </div>
            </div>
          )}

          {mediaEnabled && (
            <div className="auth-field">
              <label>Sotuv rasmi</label>
              <ImageUploadField disabled={isPending || !picked} />
            </div>
          )}

          <div className="auth-field">
            <label htmlFor="notes">Izoh</label>
            <textarea id="notes" name="notes" rows={2} disabled={isPending || !picked} className="text-area" />
          </div>
        </div>

        <button type="submit" className="btn btn-primary" disabled={isPending || !picked}>
          {isPending ? 'Sotilmoqda...' : 'Sotuvni tasdiqlash'}
        </button>
      </form>
    </div>
  );
}
