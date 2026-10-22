'use client';

import Link from 'next/link';
import { useActionState, useEffect, useState, useTransition, type KeyboardEvent, type ReactNode } from 'react';
import { useToastOnState } from '@/lib/useToastOnState';
import { createBrandAction, createCategoryAction, createProductAction, updateProductAction } from '@/app/actions/products';
import { ProductStatus, SoldPaymentType } from '@/lib/models/tenant/Product';
import BackLink from '@/components/ui/BackLink';
import BarcodeInputField from '@/components/ui/BarcodeInputField';
import Icon from '@/components/icons/Icon';
import ImageUploadField from '@/components/ui/ImageUploadField';
import PriceInput from '@/components/ui/PriceInput';
import UsdPricePanel from '@/components/tenant/UsdPricePanel';
import { fmtMoney } from '@/lib/format';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import { fmtQty, isFractionalUnit, parseQty, priceTimesQty } from '@/lib/qty';
import { PRODUCT_UNITS, type ProductFieldKey, type ProductFieldSpec, type ProductUnit } from '@/lib/businessTypes';
import { flattenCategories, LEGACY_CATEGORY_VALUE, type CategoryItem } from '@/lib/productCatalog';

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
  /** Do'kon dollar kursi — bo'lsa narxni dollarda kiritish paneli ko'rinadi */
  usdRate?: number | null;
  /** Yo'nalishga xos maydonlar (lib/businessTypes.ts → PRODUCT_FIELDS) */
  productFields?: ProductFieldSpec[];
  /** Turkumlar (ProductCategory) — tekis ro'yxat, formada daraxt ko'rinishida */
  categories?: CategoryItem[];
  /** Brendlar (Brand) — tanlash uchun ro'yxat; mahsulotda nomi saqlanadi */
  brands?: { id: string; name: string }[];
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
    oldPrice?: number;
    brand?: string;
    categoryId?: string;
    productId?: string;
    trackQuantity?: boolean;
    quantity?: number;
    soldQuantity?: number;
    supplierId?: string;
    /** Yo'nalish maydonlari: qiymatlar input ko'rinishida (sana — YYYY-MM-DD) */
    extra?: Partial<Record<ProductFieldKey, string>>;
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
  usdRate,
  productFields = [],
  categories = [],
  brands = [],
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
  const [qtyRaw, setQtyRaw] = useState(fmtQty(initial?.quantity ?? 1));
  // O'lchov birligi: kg/m… — miqdor kasr (1,5), aks holda butun
  const [unit, setUnit] = useState(initial?.extra?.unit || 'dona');
  const fractional = isFractionalUnit(unit);
  const [supplierId, setSupplierId] = useState(initial?.supplierId ?? '');
  const activeCreditBanks = creditBanks.filter(Boolean);

  // Narxlar — faqat jonli foyda ko'rinishi uchun (forma baribir shu inputlardan yuboriladi)
  const [purchaseRaw, setPurchaseRaw] = useState(
    initial?.purchasePrice !== undefined ? String(initial.purchasePrice) : ''
  );
  const [saleRaw, setSaleRaw] = useState(
    initial?.salePrice !== undefined ? String(initial.salePrice) : ''
  );
  const [wholesaleRaw, setWholesaleRaw] = useState(initial?.wholesalePrice ? String(initial.wholesalePrice) : '');
  const [oldPriceOn, setOldPriceOn] = useState(!!initial?.oldPrice);
  const [oldPriceRaw, setOldPriceRaw] = useState(initial?.oldPrice ? String(initial.oldPrice) : '');
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
  // Rang yo'nalish maydoni bo'lsa (kiyim) — umumiy "Rang / xususiyat" o'rniga o'sha chiziladi
  const colorInFields = productFields.some((f) => f.key === 'color');
  // Kategoriya — matn emas, turkumlar daraxtidan tanlanadi (mobil kabi); qolgan yo'nalish maydonlari odatdagidek
  const categoryInFields = productFields.some((f) => f.key === 'category');
  const extraFields = productFields.filter((f) => f.key !== 'category');

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
                    {!colorInFields && (
                      <div className="auth-field">
                        <label htmlFor="color">{t.colorFeatureLabel}</label>
                        <input id="color" name="color" type="text" defaultValue={initial?.color} disabled={isPending} />
                      </div>
                    )}
                  </>
                )}
                <div className="form-row">
                  <BrandField brands={brands} initial={initial?.brand} disabled={isPending} />
                  {categoryInFields && (
                    <CategoryField
                      categories={categories}
                      initialId={initial?.categoryId}
                      initialName={initial?.extra?.category}
                      disabled={isPending}
                    />
                  )}
                </div>
                {extraFields.length > 0 && (
                  <ProductExtraFields
                    fields={extraFields}
                    initial={{ color: initial?.color, ...initial?.extra }}
                    disabled={isPending}
                    onUnitChange={setUnit}
                  />
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
                  <PriceInput id="wholesalePrice" name="wholesalePrice" value={wholesaleRaw} onValueChange={setWholesaleRaw} disabled={isPending} placeholder={d.common.optional} />
                  <span className="field-hint">{t.wholesaleHint}</span>
                </div>
                <label className="st-switch-row">
                  <span className="st-switch-row-t">
                    <b>{t.oldPriceToggle}</b>
                    <small>{t.oldPriceHint}</small>
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    className="st-switch"
                    name="oldPriceOn"
                    checked={oldPriceOn}
                    onChange={(e) => setOldPriceOn(e.target.checked)}
                    disabled={isPending}
                  />
                </label>
                {oldPriceOn && (
                  <div className="auth-field">
                    <label htmlFor="oldPrice">{t.oldPriceLabel}</label>
                    <PriceInput id="oldPrice" name="oldPrice" value={oldPriceRaw} onValueChange={setOldPriceRaw} disabled={isPending} placeholder="0" />
                  </div>
                )}

                {usdRate ? (
                  <UsdPricePanel
                    rate={usdRate}
                    disabled={isPending}
                    targets={[
                      ...(showCost ? [{ key: 'purchase' as const, label: t.purchaseLabel.replace(/\s*\*$/, '') }] : []),
                      { key: 'sale' as const, label: t.saleLabel },
                      { key: 'wholesale' as const, label: t.wholesaleLabel },
                    ]}
                    onApply={(key, som) => (key === 'purchase' ? setPurchaseRaw : key === 'sale' ? setSaleRaw : setWholesaleRaw)(som)}
                  />
                ) : null}

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
                      {fractional ? ` (${d.stock.fields.units[unit as ProductUnit]})` : ''}
                    </label>
                    {fractional ? (
                      <input
                        id="quantity"
                        name="quantity"
                        type="text"
                        inputMode="decimal"
                        required
                        value={qtyRaw}
                        onChange={(e) => setQtyRaw(e.target.value.replace(/[^\d.,]/g, ''))}
                        aria-invalid={parseQty(qtyRaw, unit) === null || undefined}
                        disabled={isPending}
                      />
                    ) : (
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
                    )}
                    {mode === 'edit' && initial?.trackQuantity && (
                      <span className="field-hint">
                        {tr(t.soldRemaining, { sold: fmtQty(initial.soldQuantity ?? 0), left: fmtQty(Math.max(0, (initial.quantity ?? 0) - (initial.soldQuantity ?? 0))) })}
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
                          <b>{tr(d.stock.suppliers.productAsDebt, { sum: fmt(priceTimesQty(purchaseNum, trackQuantity ? parseQty(qtyRaw, unit) ?? 1 : 1)) })}</b>
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

/** Yo'nalishga xos maydonlar — konfiguratsiyadan dinamik (ikki ustunli qatorlar) */
function ProductExtraFields({
  fields,
  initial,
  disabled,
  onUnitChange,
}: {
  fields: ProductFieldSpec[];
  initial: Partial<Record<ProductFieldKey, string>>;
  disabled: boolean;
  /** Birlik o'zgarsa — miqdor maydoni kasr/butun rejimiga o'tadi */
  onUnitChange?: (unit: string) => void;
}) {
  const f = useDict().stock.fields;
  const inputs = fields.map(({ key, required }) => {
    const id = `pf-${key}`;
    const label = `${f.labels[key]}${required ? ' *' : ''}`;
    const common = { id, name: key, required, disabled, defaultValue: initial[key] ?? '' };
    let input: ReactNode;
    let hint: string | null = null;
    switch (key) {
      case 'unit':
        input = (
          <select {...common} defaultValue={initial.unit || 'dona'} onChange={(e) => onUnitChange?.(e.target.value)}>
            {PRODUCT_UNITS.map((u) => <option key={u} value={u}>{f.units[u]}</option>)}
          </select>
        );
        hint = f.unitHint;
        break;
      case 'warrantyMonths':
        input = <input {...common} type="number" min={0} max={120} step={1} inputMode="numeric" placeholder={f.placeholders[key]} />;
        break;
      case 'expiryDate':
        input = <input {...common} type="date" />;
        break;
      default:
        input = <input {...common} type="text" maxLength={key === 'size' ? 20 : 40} placeholder={f.placeholders[key]} autoComplete="off" />;
    }
    return (
      <div className="auth-field" key={key}>
        <label htmlFor={id}>{label}</label>
        {input}
        {hint && <span className="field-hint">{hint}</span>}
      </div>
    );
  });

  const rows: ReactNode[] = [];
  for (let i = 0; i < inputs.length; i += 2) {
    rows.push(
      inputs[i + 1]
        ? <div className="form-row" key={i}>{inputs[i]}{inputs[i + 1]}</div>
        : inputs[i],
    );
  }
  return <>{rows}</>;
}

/**
 * Katalogdan tanlash + shu yerning o'zida yangisini qo'shish (brend, turkum).
 * Qo'shish qatori forma maydoni emas (name yo'q) — Enter asosiy formani yubormaydi.
 */
function CatalogAdd({
  placeholder,
  maxLength,
  disabled,
  onSave,
  onClose,
  children,
}: {
  placeholder: string;
  maxLength: number;
  disabled: boolean;
  /** Xato bo'lsa matn qaytaradi */
  onSave: (name: string) => Promise<string | null>;
  onClose: () => void;
  /** Qo'shimcha tanlov (turkum uchun — qaysi turkum ichida) */
  children?: ReactNode;
}) {
  const d = useDict();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const save = () => {
    if (!name.trim()) return;
    startSaving(async () => {
      const err = await onSave(name);
      if (err) setError(err);
      else onClose();
    });
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };
  const busy = disabled || saving;
  return (
    <div className="st-cat-add">
      {children}
      <div className="st-cat-add-row">
        <input
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setError(null); }}
          onKeyDown={onKey}
          placeholder={placeholder}
          maxLength={maxLength}
          aria-label={placeholder}
          aria-invalid={!!error || undefined}
          disabled={busy}
          autoFocus
          autoComplete="off"
        />
        <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={busy || !name.trim()}>
          {saving ? d.common.saving : d.common.add}
        </button>
        <button type="button" className="btn btn-plain btn-sm" onClick={onClose} disabled={saving}>
          {d.common.cancel}
        </button>
      </div>
      {error && <span className="field-error" role="alert">{error}</span>}
    </div>
  );
}

/** Brend: ro'yxatdan tanlash (mahsulotda nomi saqlanadi) yoki yangisini qo'shish */
function BrandField({ brands, initial, disabled }: { brands: { id: string; name: string }[]; initial?: string; disabled: boolean }) {
  const t = useDict().stock.form;
  const [list, setList] = useState(brands);
  const [value, setValue] = useState(initial ?? '');
  const [adding, setAdding] = useState(false);
  // Ro'yxatda yo'q eski brend nomi (mobil/eski yozuv) — yo'qolmasin, tanlovda ko'rinadi
  const missing = value && !list.some((b) => b.name === value) ? value : null;
  return (
    <div className="auth-field">
      <label htmlFor="brand">{t.brandLabel}</label>
      <div className="st-cat-pick">
        <select id="brand" name="brand" value={value} onChange={(e) => setValue(e.target.value)} disabled={disabled}>
          <option value="">{t.notSelected}</option>
          {missing && <option value={missing}>{missing}</option>}
          {list.map((b) => <option key={b.id} value={b.name}>{b.name}</option>)}
        </select>
        {!adding && (
          <button type="button" className="btn btn-tinted btn-sm st-cat-addbtn" onClick={() => setAdding(true)} disabled={disabled} aria-label={t.newBrand} title={t.newBrand}>
            <Icon name="plus" size={16} />
          </button>
        )}
      </div>
      {adding && (
        <CatalogAdd
          placeholder={t.newBrandPlaceholder}
          maxLength={60}
          disabled={disabled}
          onClose={() => setAdding(false)}
          onSave={async (name) => {
            const res = await createBrandAction(name);
            if (!res.ok) return res.error;
            setList((prev) => prev.some((b) => b.id === res.item.id)
              ? prev
              : [...prev, res.item].sort((a, b) => a.name.localeCompare(b.name)));
            setValue(res.item.name);
            return null;
          }}
        />
      )}
    </div>
  );
}

/** Turkum: ichma-ich daraxtdan tanlash (categoryId yuboriladi) yoki yangi turkum/subturkum qo'shish */
function CategoryField({
  categories,
  initialId,
  initialName,
  disabled,
}: {
  categories: CategoryItem[];
  initialId?: string;
  /** Mahsulotdagi kategoriya matni */
  initialName?: string;
  disabled: boolean;
}) {
  const d = useDict();
  const t = d.stock.form;
  const [list, setList] = useState(categories);
  // Turkumga bog'lanmagan (eski matn) yoki turkumi o'chirilgan kategoriya — o'zgartirilmaguncha saqlanadi
  const known = !!initialId && categories.some((c) => c.id === initialId);
  const initialLegacy = !known && initialName ? initialName : null;
  const [value, setValue] = useState(known && initialId ? initialId : initialLegacy ? LEGACY_CATEGORY_VALUE : '');
  const [adding, setAdding] = useState(false);
  const [parentId, setParentId] = useState('');
  const options = flattenCategories(list);
  // Daraxt ko'rinishi: native select'da chuqurlik bo'shliq bilan
  const indent = (depth: number) => '\u00A0\u00A0\u00A0'.repeat(depth) + (depth ? '└ ' : '');
  const openAdd = () => {
    // Tanlangan turkum ichiga qo'shish — eng ko'p ishlatiladigan holat (subturkum)
    setParentId(options.some((o) => o.id === value) ? value : '');
    setAdding(true);
  };
  return (
    <div className="auth-field">
      <label htmlFor="categoryId">{d.stock.fields.labels.category}</label>
      <div className="st-cat-pick">
        <select id="categoryId" name="categoryId" value={value} onChange={(e) => setValue(e.target.value)} disabled={disabled}>
          <option value="">{t.notSelected}</option>
          {initialLegacy && <option value={LEGACY_CATEGORY_VALUE}>{tr(t.categoryLegacy, { name: initialLegacy })}</option>}
          {options.map((o) => <option key={o.id} value={o.id} title={o.path}>{indent(o.depth)}{o.name}</option>)}
        </select>
        {!adding && (
          <button type="button" className="btn btn-tinted btn-sm st-cat-addbtn" onClick={openAdd} disabled={disabled} aria-label={t.newCategory} title={t.newCategory}>
            <Icon name="plus" size={16} />
          </button>
        )}
      </div>
      {adding && (
        <CatalogAdd
          placeholder={t.newCategoryPlaceholder}
          maxLength={60}
          disabled={disabled}
          onClose={() => setAdding(false)}
          onSave={async (name) => {
            const res = await createCategoryAction(name, parentId || null);
            if (!res.ok) return res.error;
            setList((prev) => prev.some((c) => c.id === res.item.id)
              ? prev
              : [...prev, res.item].sort((a, b) => a.name.localeCompare(b.name)));
            setValue(res.item.id);
            return null;
          }}
        >
          <select value={parentId} onChange={(e) => setParentId(e.target.value)} disabled={disabled} aria-label={t.newCategoryParent}>
            <option value="">{t.newCategoryParent}: {t.newCategoryRoot}</option>
            {options.map((o) => <option key={o.id} value={o.id}>{indent(o.depth)}{o.name}</option>)}
          </select>
        </CatalogAdd>
      )}
    </div>
  );
}
