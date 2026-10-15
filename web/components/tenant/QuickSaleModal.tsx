'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { lookupProductByScan, quickSaleBatchAction, type ScannedProduct } from '@/app/actions/sales';
import BarcodeInputField from '@/components/ui/BarcodeInputField';
import Icon from '@/components/icons/Icon';
import { fmtMoney } from '@/lib/format';
import { toast } from '@/lib/toast';
import './styles/sales.css';

interface CartLine extends ScannedProduct {
  qty: number;
  priceInput: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

function needsPrice(line: CartLine): boolean {
  return !line.salePrice || line.salePrice <= 0;
}

export default function QuickSaleModal({ open, onClose }: Props) {
  const router = useRouter();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [lookupError, setLookupError] = useState('');
  const [sellError, setSellError] = useState('');
  const [busy, setBusy] = useState(false);
  const [searching, startSearch] = useTransition();

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setCart([]);
      setLookupError('');
      setSellError('');
    }
  }, [open]);

  const total = useMemo(
    () => cart.reduce((sum, line) => {
      const price = needsPrice(line) ? Number(line.priceInput) || 0 : line.salePrice;
      return sum + price * line.qty;
    }, 0),
    [cart],
  );

  const addProduct = useCallback((product: ScannedProduct) => {
    setLookupError('');
    setCart((prev) => {
      const idx = prev.findIndex((p) => p.id === product.id);
      if (idx >= 0) {
        const line = prev[idx];
        if (!line.trackQuantity) {
          setLookupError(`"${product.name}" allaqachon ro'yxatda.`);
          return prev;
        }
        const nextQty = line.qty + 1;
        if (nextQty > line.available) {
          setLookupError(`"${product.name}" uchun maksimum ${line.available} ta.`);
          return prev;
        }
        const next = [...prev];
        next[idx] = { ...line, qty: nextQty };
        return next;
      }
      return [...prev, { ...product, qty: 1, priceInput: product.salePrice > 0 ? String(product.salePrice) : '' }];
    });
  }, []);

  const handleScan = useCallback((code: string) => {
    setLookupError('');
    startSearch(async () => {
      const product = await lookupProductByScan(code);
      if (!product) {
        setLookupError('Mahsulot topilmadi yoki omborda emas.');
        toast('Mahsulot topilmadi', 'error');
        return;
      }
      addProduct(product);
      toast(`${product.name} qo'shildi`, 'success');
    });
  }, [addProduct]);

  function updateQty(id: string, qty: number) {
    setCart((prev) => prev.map((line) => {
      if (line.id !== id) return line;
      const next = Math.min(line.available, Math.max(1, qty));
      return { ...line, qty: next };
    }));
  }

  function updatePrice(id: string, priceInput: string) {
    setCart((prev) => prev.map((line) => (line.id === id ? { ...line, priceInput } : line)));
  }

  function removeLine(id: string) {
    setCart((prev) => prev.filter((line) => line.id !== id));
  }

  async function handleSell() {
    if (!cart.length) return;
    setSellError('');

    const lines = cart.map((line) => {
      const useCustomPrice = needsPrice(line);
      const price = useCustomPrice ? Number(line.priceInput) : line.salePrice;
      return {
        productId: line.id,
        qty: line.qty,
        ...(useCustomPrice || price !== line.salePrice ? { salePrice: price } : {}),
      };
    });

    for (const line of cart) {
      if (needsPrice(line)) {
        const price = Number(line.priceInput);
        if (!price || price <= 0) {
          setSellError(`"${line.name}" uchun sotuv narxini kiriting.`);
          return;
        }
      }
    }

    setBusy(true);
    const res = await quickSaleBatchAction(lines);
    setBusy(false);

    if (res?.error) {
      setSellError(res.error);
      toast(res.error, 'error');
      return;
    }

    toast(res?.success ?? 'Sotildi.', 'success');
    setCart([]);
    onClose();
    router.refresh();
  }

  if (!open) return null;

  return (
    <div className="u-modal-overlay" onClick={() => !busy && onClose()}>
      <div className="u-modal u-modal--wide quick-sale-modal" role="dialog" aria-modal="true" aria-labelledby="quick-sale-title" onClick={(e) => e.stopPropagation()}>
        <div className="u-modal-head">
          <h3 id="quick-sale-title">Tez sotuv</h3>
          <button type="button" className="u-icon-btn" onClick={onClose} disabled={busy} aria-label="Yopish">
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="quick-sale-body">
          <div className="auth-field" style={{ margin: 0 }}>
            <label htmlFor="quick-sale-scan">Skaner (pistolet)</label>
            <BarcodeInputField
              id="quick-sale-scan"
              placeholder="Shtrix kodni skaner qiling..."
              onScan={handleScan}
              clearOnScan
              defaultScanActive
              disabled={busy || searching}
            />
          </div>

          {(lookupError || sellError) && (
            <div className="auth-alert auth-alert--warn" role="alert">{lookupError || sellError}</div>
          )}

          {searching && (
            <p className="quick-sale-hint" aria-live="polite">Qidirilmoqda...</p>
          )}

          {cart.length === 0 ? (
            <div className="sl-cart-empty">
              <Icon name="cart" size={32} />
              <p>Mahsulot skaner qiling — savat shu yerda paydo bo&apos;ladi.</p>
            </div>
          ) : (
            <ul className="sl-cart" aria-label="Savat">
              {cart.map((line) => {
                const unitPrice = needsPrice(line) ? Number(line.priceInput) || 0 : line.salePrice;
                return (
                  <li key={line.id} className="sl-cart-line">
                    <div className="sl-cart-name">
                      <b>{line.name}</b>
                      <span>
                        {line.barcode && <>Shtrix: {line.barcode}</>}
                        {line.barcode && line.imei && ' · '}
                        {line.imei && <code>{line.imei}</code>}
                      </span>
                    </div>
                    <div className="sl-cart-ctl">
                      {needsPrice(line) ? (
                        <input
                          type="number"
                          min={0}
                          step={1000}
                          value={line.priceInput}
                          onChange={(e) => updatePrice(line.id, e.target.value)}
                          className="quick-sale-price-input"
                          placeholder="Narx"
                          aria-label={`${line.name} narxi`}
                          disabled={busy}
                        />
                      ) : null}
                      {line.trackQuantity ? (
                        <div className="sl-qty">
                          <button type="button" disabled={line.qty <= 1 || busy} onClick={() => updateQty(line.id, line.qty - 1)} aria-label="Kamaytirish">−</button>
                          <span aria-live="polite">{line.qty}</span>
                          <button type="button" disabled={line.qty >= line.available || busy} onClick={() => updateQty(line.id, line.qty + 1)} aria-label="Ko'paytirish">+</button>
                        </div>
                      ) : null}
                    </div>
                    <div className="sl-cart-sum">
                      {fmtMoney(unitPrice * line.qty)}
                      {line.qty > 1 && <small>{line.qty} × {fmtMoney(unitPrice)}</small>}
                    </div>
                    <button type="button" className="icon-btn sl-cart-del" title="O'chirish" aria-label={`${line.name} — savatdan olib tashlash`} onClick={() => removeLine(line.id)} disabled={busy}>
                      <Icon name="close" size={16} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="quick-sale-foot">
            <div className="sl-cart-total">
              <span>Jami</span>
              <strong>{fmtMoney(total)} so&apos;m</strong>
            </div>
            <div className="u-modal-actions" style={{ margin: 0 }}>
              <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Bekor</button>
              <button type="button" className="btn btn-primary btn-with-icon" onClick={handleSell} disabled={busy || !cart.length}>
                <Icon name="cart" size={16} />
                {busy ? 'Sotilmoqda...' : 'Sotish'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
