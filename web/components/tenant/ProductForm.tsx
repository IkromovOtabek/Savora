'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { useToastOnState } from '@/lib/useToastOnState';
import { createProductAction, updateProductAction } from '@/app/actions/products';
import { ProductStatus, SoldPaymentType } from '@/lib/models/tenant/Product';
import BackLink from '@/components/ui/BackLink';
import BarcodeInputField from '@/components/ui/BarcodeInputField';
import Icon from '@/components/icons/Icon';
import ImageUploadField from '@/components/ui/ImageUploadField';
import PriceInput from '@/components/ui/PriceInput';
import { fmtMoney } from '@/lib/format';

interface BranchOption { id: string; name: string }

export type LocationStatus = 'warehouse' | 'sold';

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
    productId?: string;
    trackQuantity?: boolean;
    quantity?: number;
    soldQuantity?: number;
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
  initial,
}: Props) {
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

  return (
    <div className={`st-form-page${isCreate ? '' : ' st-form-page--edit'}`} id="st-edit">
      {isCreate ? (
        <div className="st-form-head">
          <div>
            <h2>Yangi mahsulot</h2>
            <p>
              Mahsulot {isAdmin ? 'asosiy omboringizga' : 'shu filial omboriga'} qo&apos;shiladi.
              {isAdmin ? ' Filialga ulashish uchun ro\'yxatda "Filialga berish" tugmasidan foydalaning.' : ''}
            </p>
          </div>
          <BackLink href="/app/products" className="btn btn-ghost btn-sm">Orqaga</BackLink>
        </div>
      ) : (
        <div className="st-ghead"><span>Tahrirlash</span></div>
      )}

      {state?.error && <div className="auth-alert auth-alert--error st-alert" role="alert">{state.error}</div>}
      {state?.success && <div className="auth-alert auth-alert--info st-alert" role="status">{state.success}</div>}

      {branches.length === 0 && !isAdmin ? (
        <div className="st-group st-empty">
          <span className="st-empty-ic"><Icon name="building" size={24} /></span>
          <p>Filial topilmadi. Administrator bilan bog&apos;laning.</p>
        </div>
      ) : (
        <form action={formAction} className="st-form">
          {mode === 'edit' && initial && <input type="hidden" name="productId" value={initial.id} />}

          {/* Filial tanlovi YO'Q — mahsulot joriy profilga qo'shiladi (admin → asosiy ombor,
              filial → o'z filiali). Boshqa filialga "Filialga berish" orqali o'tkaziladi. */}

          {/* ---- Asosiy ---- */}
          <section aria-labelledby="st-f-main">
            <div className="st-ghead st-ghead--form">
              <span id="st-f-main"><span className="st-fgroup-ic" aria-hidden="true"><Icon name="box" size={13} /></span>Asosiy</span>
            </div>
            <div className="st-group">
              {mode === 'edit' && initial?.productId && (
                <div className="st-idrow">
                  <span>Mahsulot ID</span>
                  <code>{initial.productId}</code>
                </div>
              )}
              <div className="st-fgroup-body">
                <div className="auth-field">
                  <label htmlFor="name">Mahsulot nomi *</label>
                  <input id="name" name="name" type="text" required defaultValue={initial?.name} disabled={isPending} placeholder="Masalan: iPhone 15 Pro 256GB" />
                </div>

                {showImei ? (
                  <div className="form-row">
                    <div className="auth-field">
                      <label htmlFor="imei">IMEI *</label>
                      <input id="imei" name="imei" type="text" required defaultValue={initial?.imei} disabled={isPending} className="imei-input" placeholder="353456789012345" inputMode="numeric" autoComplete="off" />
                    </div>
                    <div className="auth-field">
                      <label htmlFor="color">Rang</label>
                      <input id="color" name="color" type="text" defaultValue={initial?.color} disabled={isPending} />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="auth-field">
                      <label htmlFor="barcode">Shtrix-kod / SKU</label>
                      <BarcodeInputField
                        id="barcode"
                        name="barcode"
                        defaultValue={initial?.barcode}
                        disabled={isPending}
                      />
                      <span className="field-hint">Bo&apos;sh qoldirsangiz avtomatik kod beriladi</span>
                    </div>
                    <div className="auth-field">
                      <label htmlFor="color">Rang / xususiyat</label>
                      <input id="color" name="color" type="text" defaultValue={initial?.color} disabled={isPending} />
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>

          {/* ---- Narx ---- */}
          <section aria-labelledby="st-f-price">
            <div className="st-ghead st-ghead--form">
              <span id="st-f-price"><span className="st-fgroup-ic" aria-hidden="true"><Icon name="wallet" size={13} /></span>Narx</span>
            </div>
            <div className="st-group">
              <div className="st-fgroup-body">
                <div className="form-row">
                  {showCost && (
                    <div className="auth-field">
                      <label htmlFor="purchasePrice">Kelish narxi *</label>
                      <PriceInput id="purchasePrice" name="purchasePrice" required value={purchaseRaw} onValueChange={setPurchaseRaw} disabled={isPending} placeholder="0" />
                    </div>
                  )}
                  <div className="auth-field">
                    <label htmlFor="salePrice">Sotuv narxi</label>
                    <PriceInput id="salePrice" name="salePrice" value={saleRaw} onValueChange={setSaleRaw} disabled={isPending} placeholder="Ixtiyoriy" />
                  </div>
                </div>

                {showProfit && (
                  saleNum > 0 && purchaseNum > 0 ? (
                    <div className="st-profit" aria-live="polite">
                      <div className="st-profit-cell">
                        <div className="st-profit-l">Foyda</div>
                        <div className={`st-profit-v ${profit >= 0 ? 'st-profit-v--ok' : 'st-profit-v--bad'}`}>
                          {profit > 0 ? '+' : ''}{fmt(profit)}
                        </div>
                      </div>
                      <div className="st-profit-cell">
                        <div className="st-profit-l">Marja</div>
                        <div className={`st-profit-v ${profit >= 0 ? '' : 'st-profit-v--bad'}`}>{pct(margin)}</div>
                      </div>
                      <div className="st-profit-cell">
                        <div className="st-profit-l">Ustama</div>
                        <div className={`st-profit-v ${profit >= 0 ? '' : 'st-profit-v--bad'}`}>{pct(markup)}</div>
                      </div>
                    </div>
                  ) : (
                    <p className="st-profit-hint">Ikkala narxni kiriting — foyda va marja shu yerda ko&apos;rinadi.</p>
                  )
                )}
              </div>
            </div>
          </section>

          {/* ---- Ombor ---- */}
          <section aria-labelledby="st-f-stock">
            <div className="st-ghead st-ghead--form">
              <span id="st-f-stock"><span className="st-fgroup-ic" aria-hidden="true"><Icon name="building" size={13} /></span>Ombor</span>
            </div>
            <div className="st-group">
              <div className="st-fgroup-body">
                <label className="st-switch-row">
                  <span className="st-switch-row-t">
                    <b>Son kiritish (miqdor bilan)</b>
                    <small>Bir xil mahsulotdan bir nechta dona bo&apos;lsa yoqing</small>
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
                      {mode === 'create' ? 'Miqdor (nechta) *' : 'Umumiy miqdor *'}
                    </label>
                    <input
                      id="quantity"
                      name="quantity"
                      type="number"
                      min={1}
                      required
                      defaultValue={initial?.quantity ?? 1}
                      disabled={isPending}
                    />
                    {mode === 'edit' && initial?.trackQuantity && (
                      <span className="field-hint">
                        Sotilgan: {initial.soldQuantity ?? 0} · Qoldiq:{' '}
                        {Math.max(0, (initial.quantity ?? 0) - (initial.soldQuantity ?? 0))}
                      </span>
                    )}
                  </div>
                )}

                {mode === 'edit' && (
                  <fieldset className="auth-field" style={{ border: 0, padding: 0, margin: 0 }}>
                    <legend className="st-profit-l" style={{ marginBottom: 6 }}>Holat</legend>
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
                        <span>Omborda</span>
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
                        <span>Sotildi</span>
                      </label>
                    </div>
                  </fieldset>
                )}

                {mode === 'edit' && locationStatus === 'sold' && trackQuantity && (
                  <div className="auth-field">
                    <label htmlFor="sellQty">Nechta sotildi? *</label>
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
                      <legend className="st-profit-l" style={{ marginBottom: 6 }}>To&apos;lov turi</legend>
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
                          <span>Naqd</span>
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
                          <span>Bank krediti</span>
                        </label>
                      </div>
                    </fieldset>
                    {soldPaymentType === 'credit' && (
                      <div className="auth-field">
                        <label htmlFor="soldBankName">Bank *</label>
                        {activeCreditBanks.length === 0 ? (
                          <p className="field-hint">
                            Bank qo&apos;shilmagan.{' '}
                            <Link href="/app/kredit-kassa">Kredit kassa</Link> bo&apos;limiga o&apos;ting.
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
          <section aria-labelledby="st-f-extra">
            <div className="st-ghead st-ghead--form">
              <span id="st-f-extra"><span className="st-fgroup-ic" aria-hidden="true"><Icon name="edit" size={13} /></span>Qo&apos;shimcha</span>
            </div>
            <div className="st-group">
              <div className="st-fgroup-body">
                {mediaEnabled && (
                  <div className="auth-field">
                    <span className="st-profit-l">Rasm</span>
                    <ImageUploadField defaultValue={initial?.photoUrl} disabled={isPending} />
                  </div>
                )}
                <div className="auth-field">
                  <label htmlFor="notes">Izoh</label>
                  <textarea id="notes" name="notes" rows={3} defaultValue={initial?.notes} disabled={isPending} className="text-area" />
                </div>
              </div>
            </div>
          </section>

          <div className="st-form-submit">
            <button type="submit" className="btn btn-primary" disabled={isPending}>
              {isPending ? 'Saqlanmoqda...' : isCreate ? 'Mahsulot qo\'shish' : 'Saqlash'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
