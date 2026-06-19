'use client';

import Link from 'next/link';
import { useActionState, useMemo, useState } from 'react';
import { useToastOnState } from '@/lib/useToastOnState';
import { createProductAction, updateProductAction } from '@/app/actions/products';
import { ProductStatus, SoldPaymentType } from '@/lib/models/tenant/Product';
import BackLink from '@/components/ui/BackLink';
import BarcodeInputField from '@/components/ui/BarcodeInputField';
import Icon from '@/components/icons/Icon';
import ImageUploadField from '@/components/ui/ImageUploadField';

interface BranchOption { id: string; name: string }

export type LocationStatus = 'warehouse' | 'sold' | 'branch';

interface Props {
  mode: 'create' | 'edit';
  branches: BranchOption[];
  warehouseBranchId: string;
  showImei: boolean;
  mediaEnabled?: boolean;
  creditKassaEnabled?: boolean;
  creditBanks?: { id: string; name: string }[];
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

function deriveLocationStatus(
  status: ProductStatus,
  branchId: string,
  warehouseBranchId: string
): LocationStatus {
  if (status === 'sold') return 'sold';
  if (branchId && branchId !== warehouseBranchId) return 'branch';
  return 'warehouse';
}

export default function ProductForm({
  mode,
  branches,
  warehouseBranchId,
  showImei,
  mediaEnabled,
  creditKassaEnabled = false,
  creditBanks = [],
  initial,
}: Props) {
  const action = mode === 'create' ? createProductAction : updateProductAction;
  const [state, formAction, isPending] = useActionState(action, null);
  useToastOnState(state);

  const initialLocation = useMemo(
    () =>
      initial
        ? deriveLocationStatus(initial.status, initial.branchId, warehouseBranchId)
        : 'warehouse',
    [initial, warehouseBranchId]
  );

  const [locationStatus, setLocationStatus] = useState<LocationStatus>(initialLocation);
  const [soldPaymentType, setSoldPaymentType] = useState<SoldPaymentType>(
    initial?.soldPaymentType ?? 'cash'
  );
  const [trackQuantity, setTrackQuantity] = useState(initial?.trackQuantity ?? false);
  const branchOptions = branches.filter((b) => b.id !== warehouseBranchId);
  const activeCreditBanks = creditBanks.filter(Boolean);

  return (
    <div className="panel panel--narrow">
      <div className="panel-head">
        <h2>{mode === 'create' ? 'Yangi mahsulot' : 'Mahsulotni tahrirlash'}</h2>
        <BackLink href="/app/products" className="btn btn-ghost btn-sm">Orqaga</BackLink>
      </div>

      {state?.error && <div className="auth-alert auth-alert--error" style={{ margin: '16px 24px 0' }}>{state.error}</div>}
      {state?.success && <div className="auth-alert auth-alert--info" style={{ margin: '16px 24px 0' }}>{state.success}</div>}

      {branches.length === 0 ? (
        <div className="panel-empty">
          <p>Avval filial qo&apos;shing.</p>
          <Link href="/app/users#filial" className="btn btn-primary btn-with-icon">
            Foydalanuvchilar
            <Icon name="arrowRight" size={16} />
            Filial
          </Link>
        </div>
      ) : (
        <form action={formAction} className="form-grid">
          {mode === 'edit' && initial && <input type="hidden" name="productId" value={initial.id} />}
          <input type="hidden" name="warehouseBranchId" value={warehouseBranchId} />

          {mode === 'edit' && initial?.productId && (
            <div className="auth-field">
              <label>Mahsulot ID</label>
              <code className="cred-value">{initial.productId}</code>
            </div>
          )}

          <div className="auth-field">
            <label htmlFor="name">Mahsulot nomi *</label>
            <input id="name" name="name" type="text" required defaultValue={initial?.name} disabled={isPending} />
          </div>

          {showImei ? (
            <div className="form-row">
              <div className="auth-field">
                <label htmlFor="imei">IMEI *</label>
                <input id="imei" name="imei" type="text" required defaultValue={initial?.imei} disabled={isPending} className="imei-input" placeholder="353456789012345" />
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

          <div className="form-row">
            <div className="auth-field">
              <label htmlFor="purchasePrice">Kelish narxi *</label>
              <input id="purchasePrice" name="purchasePrice" type="number" min={0} step={1000} required defaultValue={initial?.purchasePrice} disabled={isPending} />
            </div>
            <div className="auth-field">
              <label htmlFor="salePrice">Sotuv narxi</label>
              <input id="salePrice" name="salePrice" type="number" min={0} step={1000} defaultValue={initial?.salePrice} disabled={isPending} placeholder="Ixtiyoriy" />
            </div>
          </div>

          <div className="form-section">
            <label className="qty-toggle">
              <input
                type="checkbox"
                name="trackQuantity"
                checked={trackQuantity}
                onChange={(e) => setTrackQuantity(e.target.checked)}
                disabled={isPending}
              />
              <span>Son kiritish (miqdor bilan)</span>
            </label>
            {trackQuantity && (
              <div className="auth-field" style={{ marginTop: 12 }}>
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
          </div>

          {mode === 'edit' && (
            <div className="form-section">
              <h3>Status</h3>
              <div className="status-options">
                <label className="status-option">
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
                <label className="status-option">
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
                <label className="status-option">
                  <input
                    type="radio"
                    name="locationStatus"
                    value="branch"
                    checked={locationStatus === 'branch'}
                    onChange={() => setLocationStatus('branch')}
                    disabled={isPending}
                  />
                  <span>Filialga berildi</span>
                </label>
              </div>

              {locationStatus === 'sold' && trackQuantity && (
                <div className="auth-field" style={{ marginTop: 12 }}>
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

              {locationStatus === 'sold' && creditKassaEnabled && (
                <div style={{ marginTop: 12 }}>
                  <div className="status-options">
                    <label className="status-option">
                      <input
                        type="radio"
                        name="soldPaymentType"
                        value="cash"
                        checked={soldPaymentType === 'cash'}
                        onChange={() => setSoldPaymentType('cash')}
                        disabled={isPending}
                      />
                      <span>Naqd sotildi</span>
                    </label>
                    <label className="status-option">
                      <input
                        type="radio"
                        name="soldPaymentType"
                        value="credit"
                        checked={soldPaymentType === 'credit'}
                        onChange={() => setSoldPaymentType('credit')}
                        disabled={isPending}
                      />
                      <span>Kredit</span>
                    </label>
                  </div>
                  {soldPaymentType === 'credit' && (
                    <div className="auth-field" style={{ marginTop: 12 }}>
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
                </div>
              )}

              {locationStatus === 'branch' && (
                <div className="auth-field" style={{ marginTop: 12 }}>
                  <label htmlFor="branchId">Faol filial *</label>
                  {branchOptions.length === 0 ? (
                    <p className="field-hint">Faol filial topilmadi. Jamoa bo&apos;limidan filial qo&apos;shing.</p>
                  ) : (
                    <select
                      id="branchId"
                      name="branchId"
                      required
                      defaultValue={
                        initial?.branchId !== warehouseBranchId ? initial?.branchId : branchOptions[0]?.id
                      }
                      disabled={isPending}
                    >
                      {branchOptions.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>
          )}

          {mediaEnabled && (
            <div className="auth-field">
              <label>Rasm</label>
              <ImageUploadField defaultValue={initial?.photoUrl} disabled={isPending} />
            </div>
          )}

          <div className="auth-field">
            <label htmlFor="notes">Izoh</label>
            <textarea id="notes" name="notes" rows={3} defaultValue={initial?.notes} disabled={isPending} className="text-area" />
          </div>

          <button type="submit" className="btn btn-primary" disabled={isPending}>
            {isPending ? 'Saqlanmoqda...' : mode === 'create' ? 'Mahsulot qo\'shish' : 'Saqlash'}
          </button>
        </form>
      )}
    </div>
  );
}
