'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { lookupProductByScan, quickSaleBatchAction, type ScannedProduct } from '@/app/actions/sales';
import BarcodeInputField from '@/components/ui/BarcodeInputField';
import Icon from '@/components/icons/Icon';
import { fmtMoney } from '@/lib/format';
import { toast } from '@/lib/toast';
import { useDict } from '@/lib/i18n/client';
import { qtyWithUnit, tr } from '@/lib/i18n/fmt';
import { addQty, fmtQty, isFractionalUnit, parseQty, priceTimesQty } from '@/lib/qty';
import './styles/sales.css';

interface CartLine extends ScannedProduct {
  qty: number;
  priceInput: string;
  /** kg/m… — qo'lda kiritilayotgan miqdor matni ("1,5"); yaroqsiz bo'lsa sotish o'chadi */
  qtyText?: string;
}

const isFractionalLine = (line: CartLine) => line.trackQuantity && isFractionalUnit(line.unit);
const badQty = (line: CartLine) => isFractionalLine(line) && line.qtyText !== undefined && parseQty(line.qtyText, line.unit) === null;

interface Props {
  open: boolean;
  onClose: () => void;
}

function needsPrice(line: CartLine): boolean {
  return !line.salePrice || line.salePrice <= 0;
}

export default function QuickSaleModal({ open, onClose }: Props) {
  const router = useRouter();
  const d = useDict();
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
      return sum + priceTimesQty(price, line.qty);
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
          setLookupError(tr(d.sales.quickSale.alreadyInCart, { name: product.name }));
          return prev;
        }
        const nextQty = addQty(line.qty, 1);
        if (nextQty > line.available) {
          setLookupError(tr(d.sales.quickSale.maxN, { name: product.name, n: qtyWithUnit(line.available, line.unit, d.stock.fields.units) }));
          return prev;
        }
        const next = [...prev];
        next[idx] = { ...line, qty: nextQty, qtyText: undefined };
        return next;
      }
      // Kasrli birlikda qoldiq 1 dan kam bo'lishi mumkin (0,4 kg) — boricha
      const firstQty = product.trackQuantity ? Math.min(1, product.available) : 1;
      return [...prev, { ...product, qty: firstQty, priceInput: product.salePrice > 0 ? String(product.salePrice) : '' }];
    });
  }, [d]);

  const handleScan = useCallback((code: string) => {
    setLookupError('');
    startSearch(async () => {
      const product = await lookupProductByScan(code);
      if (!product) {
        setLookupError(d.sales.productNotFound);
        toast(d.sales.quickSale.notFoundToast, 'error');
        return;
      }
      addProduct(product);
      toast(tr(d.sales.quickSale.added, { name: product.name }), 'success');
    });
  }, [addProduct, d]);

  function updateQty(id: string, qty: number) {
    setCart((prev) => prev.map((line) => {
      if (line.id !== id) return line;
      const next = Math.min(line.available, Math.max(isFractionalLine(line) ? Math.min(1, line.available) : 1, qty));
      return { ...line, qty: next, qtyText: undefined };
    }));
  }

  /** Kasrli birlikda miqdorni qo'lda kiritish: yaroqli bo'lsa qoldiqqacha cheklanadi */
  function typeQty(id: string, text: string) {
    setCart((prev) => prev.map((line) => {
      if (line.id !== id) return line;
      const n = parseQty(text, line.unit);
      return n === null ? { ...line, qtyText: text } : { ...line, qty: Math.min(line.available, n), qtyText: text };
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
      if (badQty(line)) {
        setSellError(`${line.name}: ${d.sales.actions.badQty}`);
        return;
      }
      if (needsPrice(line)) {
        const price = Number(line.priceInput);
        if (!price || price <= 0) {
          setSellError(tr(d.sales.actions.enterPriceFor, { name: line.name }));
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

    toast(res?.success ?? d.sales.quickSale.sold, 'success');
    setCart([]);
    onClose();
    router.refresh();
  }

  if (!open) return null;

  return (
    <div className="u-modal-overlay" onClick={() => !busy && onClose()}>
      <div className="u-modal u-modal--wide quick-sale-modal" role="dialog" aria-modal="true" aria-labelledby="quick-sale-title" onClick={(e) => e.stopPropagation()}>
        <div className="u-modal-head">
          <h3 id="quick-sale-title">{d.sales.quickSale.title}</h3>
          <button type="button" className="u-icon-btn" onClick={onClose} disabled={busy} aria-label={d.common.close}>
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="quick-sale-body">
          <div className="auth-field" style={{ margin: 0 }}>
            <label htmlFor="quick-sale-scan">{d.sales.quickSale.scanner}</label>
            <BarcodeInputField
              id="quick-sale-scan"
              placeholder={d.sales.quickSale.scanPlaceholder}
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
            <p className="quick-sale-hint" aria-live="polite">{d.sales.searching}</p>
          )}

          {cart.length === 0 ? (
            <div className="sl-cart-empty">
              <Icon name="cart" size={32} />
              <p>{d.sales.quickSale.emptyCart}</p>
            </div>
          ) : (
            <ul className="sl-cart" aria-label={d.sales.quickSale.cartAria}>
              {cart.map((line) => {
                const unitPrice = needsPrice(line) ? Number(line.priceInput) || 0 : line.salePrice;
                return (
                  <li key={line.id} className="sl-cart-line">
                    <div className="sl-cart-name">
                      <b>{line.name}</b>
                      <span>
                        {line.barcode && <>{tr(d.sales.quickSale.barcode, { code: line.barcode })}</>}
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
                          placeholder={d.common.price}
                          aria-label={tr(d.sales.quickSale.priceAria, { name: line.name })}
                          disabled={busy}
                        />
                      ) : null}
                      {line.trackQuantity ? (
                        <div className="sl-qty">
                          <button type="button" disabled={line.qty <= 1 || busy} onClick={() => updateQty(line.id, addQty(line.qty, -1))} aria-label={d.sales.newSale.decrease}>−</button>
                          {isFractionalLine(line) ? (
                            <input
                              className="sl-qty-input"
                              inputMode="decimal"
                              value={line.qtyText ?? fmtQty(line.qty)}
                              onChange={(e) => typeQty(line.id, e.target.value.replace(/[^\d.,]/g, ''))}
                              aria-label={`${d.sales.pos.qty}: ${line.name}`}
                              aria-invalid={badQty(line) || undefined}
                              disabled={busy}
                            />
                          ) : (
                            <span aria-live="polite">{line.qty}</span>
                          )}
                          <button type="button" disabled={line.qty >= line.available || busy} onClick={() => updateQty(line.id, addQty(line.qty, 1))} aria-label={d.sales.newSale.increase}>+</button>
                          {isFractionalLine(line) && line.unit && <small className="sl-qty-unit">{d.stock.fields.units[line.unit]}</small>}
                        </div>
                      ) : null}
                    </div>
                    <div className="sl-cart-sum">
                      {fmtMoney(priceTimesQty(unitPrice, line.qty))}
                      {line.qty !== 1 && <small>{fmtQty(line.qty)} × {fmtMoney(unitPrice)}</small>}
                    </div>
                    <button type="button" className="icon-btn sl-cart-del" title={d.common.delete} aria-label={tr(d.sales.quickSale.removeAria, { name: line.name })} onClick={() => removeLine(line.id)} disabled={busy}>
                      <Icon name="close" size={16} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="quick-sale-foot">
            <div className="sl-cart-total">
              <span>{d.common.total}</span>
              <strong>{fmtMoney(total)} {d.common.sum}</strong>
            </div>
            <div className="u-modal-actions" style={{ margin: 0 }}>
              <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>{d.sales.quickSale.cancelShort}</button>
              <button type="button" className="btn btn-primary btn-with-icon" onClick={handleSell} disabled={busy || !cart.length}>
                <Icon name="cart" size={16} />
                {busy ? d.sales.newSale.selling : d.sales.quickSale.sell}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
