'use client';

import Link from 'next/link';
import { useActionState, useEffect, useState } from 'react';
import { useToastOnState } from '@/lib/useToastOnState';
import { createProductAction, updateProductAction } from '@/app/actions/products';
import { ProductStatus, SoldPaymentType } from '@/lib/models/tenant/Product';
import BackLink from '@/components/ui/BackLink';
import BarcodeInputField from '@/components/ui/BarcodeInputField';
import Icon from '@/components/icons/Icon';
import ImageUploadField from '@/components/ui/ImageUploadField';
import PriceInput from '@/components/ui/PriceInput';
import { fmtMoney } from '@/lib/format';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';

interface BranchOption { id: string; name: string }

export type LocationStatus = 'warehouse' | 'sold';

/** Forma bo'limlari — yuqoridagi "qadam" navigatsiyasi uchun (nomlar — d.stock.form.sections) */
const FORM_SECTIONS = [
  { id: 'st-sec-main', key: 'main' },
  { id: 'st-sec-price', key: 'price' },
  { id: 'st-sec-stock', key: 'stock' },
  { id: 'st-sec-extra', key: 'extra' },
] as const;

interface Props {
  mode: 'create' | 'edit';
  branches: BranchOption[];
  /** Admin barcha filialni tanlaydi; filial-login uchun avtomatik o'z filiali */
  isAdmin: boolean;
  currentBranchId?: string;
  showImei: boolean;
  mediaEnabled?: boolean;
  creditKassaEnabled?: boolean;
  creditBanks?: { id: string; name: string }[];
  /** "product.viewCost" huquqi — yo'q bo'lsa tahrirda kelish narxi ko'rsatilmaydi (server mavjudini saqlaydi) */
  canViewCost?: boolean;
  /** Yetkazib beruvchilar ("suppliers.manage" huquqi bo'lsa) — bo'lmasa maydon ko'rsatilmaydi */
  suppliers?: { id: string; name: string }[];
  initial?: {
    id: string;
    name: string;
    imei: string;
    barcode?: string;
    color: string;
    branchId: string;
    notes: string;
    photoUrl?: string;
    status: ProductStatus;
    soldPaymentType?: SoldPaymentType;
    soldBankName?: string;
    purchasePrice: number;
    salePrice: number;
    wholesalePrice?: number;
    productId?: string;
    trackQuantity?: boolean;
    quantity?: number;
    soldQuantity?: number;
    supplierId?: string;
  };
}

export default function ProductForm({
  mode,
  branches,
  isAdmin,
  currentBranchId,
  showImei,
  mediaEnabled,
  creditKassaEnabled = false,
  creditBanks = [],
  canViewCost = true,
  suppliers,
  initial,
}: Props) {
  const d = useDict();
  const t = d.stock.form;
  // Yangi mahsulotda kelish narxi kiritiladi (kirim hujjati), tahrirda esa huquqsiz yashiriladi
  const showCost = canViewCost || mode === 'create';
  const action = mode === 'create' ? createProductAction : updateProductAction;
  const [state, formAction, isPending] = useActionState(action, null);
  useToastOnState(state);

  const [locationStatus, setLocationStatus] = useState<LocationStatus>(
    initial?.status === 'sold' ? 'sold' : 'warehouse'
  );
  const [soldPaymentType, setSoldPaymentType] = useState<SoldPaymentType>(
    initial?.soldPaymentType ?? 'cash'
  );
  const [trackQuantity, setTrackQuantity] = useState(initial?.trackQuantity ?? false);
  const [qtyRaw, setQtyRaw] = useState(String(initial?.quantity ?? 1));
  const [supplierId, setSupplierId] = useState(initial?.supplierId ?? '');
  const activeCreditBanks = creditBanks.filter(Boolean);

  // Narxlar — faqat jonli foyda ko'rinishi uchun (forma baribir shu inputlardan yuboriladi)
  const [purchaseRaw, setPurchaseRaw] = useState(
    initial?.purchasePrice !== undefined ? String(initial.purchasePrice) : ''
  );
  const [saleRaw, setSaleRaw] = useState(
    initial?.salePrice !== undefined ? String(initial.salePrice) : ''
  );
  // Foyda ko'rinishi faqat kelish narxini ko'rish huquqi bo'lsa
  const showProfit = showCost && canViewCost;
  const purchaseNum = Number(purchaseRaw) || 0;
  const saleNum = Number(saleRaw) || 0;
  const profit = saleNum - purchaseNum;
  const margin = saleNum > 0 ? (profit / saleNum) * 100 : 0;
  const markup = purchaseNum > 0 ? (profit / purchaseNum) * 100 : 0;
  // Deterministik format — Intl('uz-UZ') server va brauzerda farq qilib, hydration xatosi berardi
  const fmt = fmtMoney;
  const pct = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;

  const isCreate = mode === 'create';

  // Bo'lim navigatsiyasi — uzun formada "qadam" hissi: ko'rinib turgan bo'lim belgilanadi
  const [activeSec, setActiveSec] = useState<string>(FORM_SECTIONS[0].id);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const els = FORM_SECTIONS.map((s) => document.getElementById(s.id)).filter((el): el is HTMLElement => !!el);
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActiveSec(vis[0].target.id);
      },
      { rootMargin: '-25% 0px -55% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className={`st-form-page${isCreate ? ' st-form-page--create' : ' st-form-page--edit'}`} id="st-edit">
      {isCreate ? (
        <div className="st-form-head">
          <BackLink href="/app/products" className="btn btn-plain btn-sm st-form-back">{t.back}</BackLink>
          <div>
            <h1>{t.newTitle}</h1>
            <p>{isAdmin ? t.newHintAdmin : t.newHintBranch}</p>
          </div>
        </div>
      ) : (
        <div className="st-ghead"><span>{d.common.edit}</span></div>
      )}

      {state?.error && <div className="auth-alert auth-alert--error st-alert" role="alert">{state.error}</div>}
      {state?.success && <div className="auth-alert auth-alert--info st-alert" role="status">{state.success}</div>}

      {branches.length === 0 && !isAdmin ? (
        <div className="st-group st-empty">
          <span className="st-empty-ic"><Icon name="building" size={24} /></span>
          <p>{t.noBranch}</p>
        </div>
      ) : (
        <>
        <nav className="st-fnav ux-scrollx" aria-label={t.navLabel}>
          {FORM_SECTIONS.map((s, i) => (
            <a key={s.id} href={`#${s.id}`} aria-current={activeSec === s.id ? 'step' : undefined}>
              <span className="st-fnav-n" aria-hidden="true">{i + 1}</span>{t.sections[s.key]}
            </a>
          ))}
        </nav>
        <form action={formAction} className="st-form">
          {mode === 'edit' && initial && <input type="hidden" name="productId" value={initial.id} />}

          {/* Filial tanlovi YO'Q — mahsulot joriy profilga qo'shiladi (admin → asosiy ombor,
              filial → o'z filiali). Boshqa filialga "Filialga berish" orqali o'tkaziladi. */}

          {/* ---- Asosiy ---- */}
          <section id="st-sec-main" className="st-fsec" aria-labelledby="st-f-main">
            <div className="st-ghead st-ghead--form">
              <span id="st-f-main"><span className="st-fgroup-ic" aria-hidden="true"><Icon name="box" size={13} /></span>{t.sections.main}</span>
            </div>
            <div className="st-group">
              {mode === 'edit' && initial?.productId && (
                <div className="st-idrow">
                  <span>{t.productIdLabel}</span>
                  <code>{initial.productId}</code>
                </div>
              )}
              <div className="st-fgroup-body">
                <div className="auth-field">
                  <label htmlFor="name">{t.nameLabel}</label>
                  <input id="name" name="name" type="text" required defaultValue={initial?.name} disabled={isPending} placeholder={t.namePlaceholder} />
                </div>

                {showImei ? (
                  <div className="form-row">
                    <div className="auth-field">
                      <label htmlFor="imei">{t.imeiLabel}</label>
                      <input id="imei" name="imei" type="text" required defaultValue={initial?.imei} disabled={isPending} className="imei-input" placeholder="353456789012345" inputMode="numeric" autoComplete="off" />
                    </div>
                    <div className="auth-field">
                      <label htmlFor="color">{t.colorLabel}</label>
                      <input id="color" name="color" type="text" defaultValue={initial?.color} disabled={isPending} />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="auth-field">
                      <label htmlFor="barcode">{t.barcodeLabel}</label>
                      <BarcodeInputField
                        id="barcode"
                        name="barcode"
                        defaultValue={initial?.barcode}
                        disabled={isPending}
                      />
                      <span className="field-hint">{t.barcodeHint}</span>
                    </div>
                    <div className="auth-field">
                      <label htmlFor="color">{t.colorFeatureLabel}</label>
                      <input id="color" name="color" type="text" defaultValue={initial?.color} disabled={isPending} />
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>

          {/* ---- Narx ---- */}
          <section id="st-sec-price" className="st-fsec" aria-labelledby="st-f-price">
            <div className="st-ghead st-ghead--form">
              <span id="st-f-price"><span className="st-fgroup-ic" aria-hidden="true"><Icon name="wallet" size={13} /></span>{t.sections.price}</span>
            </div>
            <div className="st-group">
              <div className="st-fgroup-body">
                <div className="form-row">
                  {showCost && (
                    <div className="auth-field">
                      <label htmlFor="purchasePrice">{t.purchaseLabel}</label>
                      <PriceInput id="purchasePrice" name="purchasePrice" required value={purchaseRaw} onValueChange={setPurchaseRaw} disabled={isPending} placeholder="0" />
                    </div>
                  )}
                  <div className="auth-field">
                    <label htmlFor="salePrice">{t.saleLabel}</label>
                    <PriceInput id="salePrice" name="salePrice" value={saleRaw} onValueChange={setSaleRaw} disabled={isPending} placeholder={d.common.optional} />
                  </div>
                </div>
                <div className="auth-field">
                  <label htmlFor="wholesalePrice">{t.wholesaleLabel}</label>
                  <PriceInput id="wholesalePrice" name="wholesalePrice" defaultValue={initial?.wholesalePrice || ''} disabled={isPending} placeholder={d.common.optional} />
                  <span className="field-hint">{t.wholesaleHint}</span>
                </div>

                {/* Jonli foyda kartasi — doim joyida (sakramaydi), narxlar kiritilgach to'ladi */}
                {showProfit && (() => {
                  const ready = saleNum > 0 && purchaseNum > 0;
                  const tone = !ready ? 'gray' : profit >= 0 ? 'green' : 'red';
                  return (
                    <div className={`st-profit st-profit--${tone}`} aria-live="polite">
                      <span className={`ux-clay ux-clay--${tone}`} aria-hidden="true">
                        <Icon name={ready && profit < 0 ? 'alert' : 'trendingUp'} size={20} />
                      </span>
                      <div className="st-profit-main">
                        <div className="st-profit-l">{d.stock.detail.profitUnit}</div>
                        <div className={`st-profit-v${ready ? (profit >= 0 ? ' st-profit-v--ok' : ' st-profit-v--bad') : ''}`}>
                          {ready ? <>{profit > 0 ? '+' : ''}{fmt(profit)} <small>{d.common.sum}</small></> : '—'}
                        </div>
                      </div>
                      {ready ? (
                        <dl className="st-profit-side">
                          <div><dt>{t.margin}</dt><dd className={profit < 0 ? 'st-profit-v--bad' : ''}>{pct(margin)}</dd></div>
                          <div><dt>{t.markup}</dt><dd className={profit < 0 ? 'st-profit-v--bad' : ''}>{pct(markup)}</dd></div>
                        </dl>
                      ) : (
                        <p className="st-profit-hint">{t.profitHint}</p>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          </section>

          {/* ---- Ombor ---- */}
          <section id="st-sec-stock" className="st-fsec" aria-labelledby="st-f-stock">
            <div className="st-ghead st-ghead--form">
              <span id="st-f-stock"><span className="st-fgroup-ic" aria-hidden="true"><Icon name="building" size={13} /></span>{t.sections.stock}</span>
            </div>
            <div className="st-group">
              <div className="st-fgroup-body">
                <label className="st-switch-row">
                  <span className="st-switch-row-t">
                    <b>{t.trackQty}</b>
                    <small>{t.trackQtyHint}</small>
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    className="st-switch"
                    name="trackQuantity"
                    checked={trackQuantity}
                    onChange={(e) => setTrackQuantity(e.target.checked)}
                    disabled={isPending}
                  />
                </label>
                {trackQuantity && (
                  <div className="auth-field">
                    <label htmlFor="quantity">
                      {mode === 'create' ? t.qtyCreate : t.qtyEdit}
                    </label>
                    <input
                      id="quantity"
                      name="quantity"
                      type="number"
                      min={1}
                      required
                      value={qtyRaw}
                      onChange={(e) => setQtyRaw(e.target.value)}
                      disabled={isPending}
                    />
                    {mode === 'edit' && initial?.trackQuantity && (
                      <span className="field-hint">
                        {tr(t.soldRemaining, { sold: initial.soldQuantity ?? 0, left: Math.max(0, (initial.quantity ?? 0) - (initial.soldQuantity ?? 0)) })}
                      </span>
                    )}
                  </div>
                )}

                {mode === 'edit' && (
                  <fieldset className="auth-field" style={{ border: 0, padding: 0, margin: 0 }}>
                    <legend className="st-profit-l" style={{ marginBottom: 6 }}>{d.common.status}</legend>
                    <div className="st-seg">
                      <label>
                        <input
                          type="radio"
                          name="locationStatus"
                          value="warehouse"
                          checked={locationStatus === 'warehouse'}
                          onChange={() => setLocationStatus('warehouse')}
                          disabled={isPending}
                        />
                        <span>{t.inWarehouse}</span>
                      </label>
                      <label>
                        <input
                          type="radio"
                          name="locationStatus"
                          value="sold"
                          checked={locationStatus === 'sold'}
                          onChange={() => setLocationStatus('sold')}
                          disabled={isPending}
                        />
                        <span>{t.soldOpt}</span>
                      </label>
                    </div>
                  </fieldset>
                )}

                {mode === 'edit' && locationStatus === 'sold' && trackQuantity && (
                  <div className="auth-field">
                    <label htmlFor="sellQty">{t.sellQtyLabel}</label>
                    <input
                      id="sellQty"
                      name="sellQty"
                      type="number"
                      min={1}
                      defaultValue={1}
                      required
                      disabled={isPending}
                    />
                  </div>
                )}

                {mode === 'edit' && locationStatus === 'sold' && creditKassaEnabled && (
                  <>
                    <fieldset className="auth-field" style={{ border: 0, padding: 0, margin: 0 }}>
                      <legend className="st-profit-l" style={{ marginBottom: 6 }}>{t.paymentType}</legend>
                      <div className="st-seg">
                        <label>
                          <input
                            type="radio"
                            name="soldPaymentType"
                            value="cash"
                            checked={soldPaymentType === 'cash'}
                            onChange={() => setSoldPaymentType('cash')}
                            disabled={isPending}
                          />
                          <span>{d.common.cash}</span>
                        </label>
                        <label>
                          <input
                            type="radio"
                            name="soldPaymentType"
                            value="credit"
                            checked={soldPaymentType === 'credit'}
                            onChange={() => setSoldPaymentType('credit')}
                            disabled={isPending}
                          />
                          <span>{t.bankCredit}</span>
                        </label>
                      </div>
                    </fieldset>
                    {soldPaymentType === 'credit' && (
                      <div className="auth-field">
                        <label htmlFor="soldBankName">{t.bankLabel}</label>
                        {activeCreditBanks.length === 0 ? (
                          <p className="field-hint">
                            {t.noBankBefore}
                            <Link href="/app/kredit-kassa">{t.noBankLink}</Link>
                            {t.noBankAfter}
                          </p>
                        ) : (
                          <select
                            id="soldBankName"
                            name="soldBankName"
                            required
                            defaultValue={initial?.soldBankName ?? activeCreditBanks[0]?.name}
                            disabled={isPending}
                          >
                            {activeCreditBanks.map((b) => (
                              <option key={b.id} value={b.name}>{b.name}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </section>

          {/* ---- Qo'shimcha ---- */}
          <section id="st-sec-extra" className="st-fsec" aria-labelledby="st-f-extra">
            <div className="st-ghead st-ghead--form">
              <span id="st-f-extra"><span className="st-fgroup-ic" aria-hidden="true"><Icon name="edit" size={13} /></span>{t.sections.extra}</span>
            </div>
            <div className="st-group">
              <div className="st-fgroup-body">
                {mediaEnabled && (
                  <div className="auth-field">
                    <span className="st-profit-l">{t.photo}</span>
                    <ImageUploadField defaultValue={initial?.photoUrl} disabled={isPending} />
                  </div>
                )}
                {suppliers && suppliers.length > 0 && (
                  <div className="auth-field">
                    <label htmlFor="supplierId">{d.stock.suppliers.productField}</label>
                    <select id="supplierId" name="supplierId" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} disabled={isPending}>
                      <option value="">{d.stock.suppliers.productNone}</option>
                      {suppliers.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
                    </select>
                    {isCreate && supplierId && purchaseNum > 0 && (
                      <label className="st-switch-row">
                        <span className="st-switch-row-t">
                          <b>{tr(d.stock.suppliers.productAsDebt, { sum: fmt(purchaseNum * (trackQuantity ? Math.max(1, Math.floor(Number(qtyRaw)) || 1) : 1)) })}</b>
                          <small>{d.stock.suppliers.productAsDebtHint}</small>
                        </span>
                        <input type="checkbox" role="switch" className="st-switch" name="supplierDebt" disabled={isPending} />
                      </label>
                    )}
                  </div>
                )}
                <div className="auth-field">
                  <label htmlFor="notes">{d.common.note}</label>
                  <textarea id="notes" name="notes" rows={3} defaultValue={initial?.notes} disabled={isPending} className="text-area" />
                </div>
              </div>
            </div>
          </section>

          <div className="st-form-submit">
            <button type="submit" className="btn btn-primary" disabled={isPending}>
              {isPending ? d.common.saving : isCreate ? t.submitCreate : d.common.save}
            </button>
          </div>
        </form>
        </>
      )}
    </div>
  );
}
