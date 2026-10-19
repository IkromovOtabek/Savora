'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { quickMarkSoldAction } from '@/app/actions/products';
import { transferProductAction } from '@/app/actions/transfer';
import { toast } from '@/lib/toast';
import Icon from '@/components/icons/Icon';
import ReviewModal from '@/components/tenant/ReviewModal';
import PriceInput from '@/components/ui/PriceInput';
import { useDict } from '@/lib/i18n/client';
import { qtyWithUnit, tr } from '@/lib/i18n/fmt';
import { addQty, fmtQty, isFractionalUnit, parseQty, qtyStep } from '@/lib/qty';
import type { ProductUnit } from '@/lib/businessTypes';

interface Props {
  productId: string;
  /** Ekran o'quvchisi uchun: "Samsung A54 — amallar" */
  productName?: string;
  status: string;
  branches: { id: string; name: string }[];
  currentBranchId: string;
  trackQuantity?: boolean;
  available?: number;
  /** kg/m… — sotish/berish miqdori kasr bo'lishi mumkin */
  unit?: ProductUnit | null;
  salePrice?: number;
  /** Nasiya (variant/nasiya) va Kredit (creditKassa) modullari yoqilganmi */
  canInstallment?: boolean;
  canCredit?: boolean;
  /** Huquqlar: sotish ("sale.create") va filialga berish ("transfer.create") */
  canSell?: boolean;
  canTransfer?: boolean;
  /** "bar" — mahsulot sahifasidagi katta tugma (tahrirlash havolasisiz) */
  variant?: 'row' | 'bar';
}

type View = 'menu' | 'sellType' | 'sellQty' | 'branches' | 'branchQty';

export default function ProductRowActions({
  productId, productName, status, branches, currentBranchId, trackQuantity = false, available = 1, unit = null, salePrice = 0, canInstallment = false, canCredit = false,
  canSell = true, canTransfer = true, variant = 'row',
}: Props) {
  const d = useDict();
  const t = d.stock.rowActions;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('menu');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Matn ko'rinishida: kg da "1,5" kiritiladi; server parseQty bilan tekshiradi
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('');
  const [branch, setBranch] = useState<{ id: string; name: string } | null>(null);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const canChange = status === 'in_stock';
  const otherBranches = branches.filter((b) => b.id !== currentBranchId);
  const fractional = trackQuantity && isFractionalUnit(unit);
  // Kasrli birlikda qoldiq 1 dan kam bo'lsa ham qismini sotish/berish mumkin
  const needQty = trackQuantity && available > qtyStep(unit) && (fractional || available > 1);
  const firstQty = fmtQty(Math.min(1, available));
  const needPrice = !salePrice || salePrice <= 0;

  function openMenu() {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const left = Math.max(8, Math.min(r.right - 240, window.innerWidth - 248));
      // Pastda joy kam bo'lsa (masalan, mobil sticky panel) — menyu tugma ustida ochiladi
      if (window.innerHeight - r.bottom < 320 && r.top > 320) setPos({ bottom: window.innerHeight - r.top + 6, left });
      else setPos({ top: r.bottom + 6, left });
    }
    setOpen(true);
    setView('menu');
    setErr(null);
    setQty(firstQty);
    setPrice('');
    setBranch(null);
  }

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  async function run(
    action: (fd: FormData) => Promise<{ error?: string; success?: string } | null>,
    extra: Record<string, string>,
    redirectTo: string,
    onSuccess?: () => void,
  ) {
    setBusy(true);
    setErr(null);
    const fd = new FormData();
    fd.set('productId', productId);
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    const res = await action(fd);
    setBusy(false);
    if (res?.error) {
      if (res.error === 'PRICE_REQUIRED') {
        // Narx kiritilmagan — narx so'rash bosqichiga o'tamiz
        setView('sellQty');
        setErr(t.priceFirst);
        return;
      }
      setErr(res.error);
      toast(res.error, 'error');
      return;
    }
    toast(res?.success ?? t.done, 'success');
    setOpen(false);
    if (onSuccess) {
      onSuccess();
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  function doSell() {
    const extra: Record<string, string> = { qty };
    if (price.trim()) extra.salePrice = price.trim();
    // Sotilgandan keyin baho modalini ochamiz
    run((fd) => quickMarkSoldAction(null, fd), extra, '/app/sales', () => setReviewOpen(true));
  }

  function closeReview() {
    setReviewOpen(false);
    router.push('/app/sales');
    router.refresh();
  }
  function doTransfer() {
    if (!branch) return;
    run((fd) => transferProductAction(null, fd), { qty, branchId: branch.id }, '/app/transferred');
  }

  return (
    <div className="row-actions" ref={ref}>
      {canChange && (
        <div className="row-action-menu-wrap">
          <button
            ref={btnRef}
            type="button"
            className={variant === 'bar' ? 'btn btn-primary btn-with-icon' : 'icon-btn'}
            title={t.title}
            aria-label={variant === 'bar' ? undefined : `${productName ? `${productName}: ` : ''}${t.sellOrTransfer}`}
            aria-expanded={open}
            onClick={() => (open ? setOpen(false) : openMenu())}
            disabled={busy}
          >
            {variant === 'bar' ? (
              <>
                <Icon name="cart" size={18} />
                <span>{t.barLabel}</span>
              </>
            ) : (
              <>
                {/* Mobilda bitta "⋯" tugma (qator o'zi tahrirga olib boradi), kompyuterda aniq ikonka */}
                <span className="ux-hide-mobile" style={{ display: 'contents' }}><Icon name="repeat" size={16} /></span>
                <span className="ux-only-mobile" style={{ display: 'contents' }}><Icon name="dots" size={18} /></span>
              </>
            )}
          </button>

          {open && pos && (
            <div className="row-action-menu" ref={menuRef} style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left }}>
              {err && <div className="row-action-err">{err}</div>}

              {view === 'menu' && (
                <>
                  {canSell && (
                    <button type="button" className="row-action-item" disabled={busy}
                      onClick={() => setView('sellType')}>
                      <Icon name="cart" size={15} /> {t.sold}
                    </button>
                  )}
                  {canTransfer && (
                    <button type="button" className="row-action-item" disabled={busy}
                      onClick={() => setView('branches')}>
                      <Icon name="repeat" size={15} /> {t.toBranch}
                    </button>
                  )}
                  {!canSell && !canTransfer && <div className="row-action-err">{t.noPermission}</div>}
                </>
              )}

              {view === 'sellType' && (
                <>
                  <button type="button" className="row-action-back" onClick={() => setView('menu')}>
                    <Icon name="arrowLeft" size={14} /> {d.common.back}
                  </button>
                  <button type="button" className="row-action-item" disabled={busy}
                    onClick={() => { (needQty || needPrice) ? (setQty(firstQty), setView('sellQty')) : doSell(); }}>
                    <Icon name="wallet" size={15} /> {d.common.cash}
                  </button>
                  {canInstallment && (
                    <button type="button" className="row-action-item" disabled={busy}
                      onClick={() => { setOpen(false); router.push(`/app/sales/new?productId=${productId}&payment=installment`); }}>
                      <Icon name="clock" size={15} /> {d.common.installment}
                    </button>
                  )}
                  {canCredit && (
                    <button type="button" className="row-action-item" disabled={busy}
                      onClick={() => { setOpen(false); router.push(`/app/sales/new?productId=${productId}&payment=bank_credit`); }}>
                      <Icon name="wallet" size={15} /> {t.credit}
                    </button>
                  )}
                </>
              )}

              {view === 'sellQty' && (
                <QtyStep
                  label={t.howManySold}
                  max={available}
                  unit={unit}
                  qty={qty}
                  setQty={setQty}
                  showQty={needQty}
                  showPrice={needPrice}
                  price={price}
                  setPrice={setPrice}
                  busy={busy}
                  onBack={() => setView('menu')}
                  onConfirm={doSell}
                  confirmLabel={t.sold}
                />
              )}

              {view === 'branches' && (
                <>
                  <button type="button" className="row-action-back" onClick={() => setView('menu')}>
                    <Icon name="arrowLeft" size={14} /> {d.common.back}
                  </button>
                  {otherBranches.length === 0 ? (
                    <div className="row-action-empty">{t.noOtherBranch}<br />{t.addBranchBefore}<b>{t.addBranchLink}</b>{t.addBranchAfter}</div>
                  ) : otherBranches.map((b) => (
                    <button key={b.id} type="button" className="row-action-item" disabled={busy}
                      onClick={() => { setBranch(b); needQty ? (setQty(firstQty), setView('branchQty')) : run((fd) => transferProductAction(null, fd), { qty: fmtQty(available), branchId: b.id }, '/app/transferred'); }}>
                      <Icon name="building" size={15} /> {b.name}
                    </button>
                  ))}
                </>
              )}

              {view === 'branchQty' && (
                <QtyStep
                  label={tr(t.howManyTo, { branch: branch?.name ?? '' })}
                  max={available}
                  unit={unit}
                  qty={qty}
                  setQty={setQty}
                  showQty
                  busy={busy}
                  onBack={() => setView('branches')}
                  onConfirm={doTransfer}
                  confirmLabel={t.transferred}
                />
              )}
            </div>
          )}
        </div>
      )}

      {variant === 'row' && (
        <Link
          href={`/app/products/${productId}`}
          className="icon-btn ux-hide-mobile"
          title={d.common.edit}
          aria-label={`${productName ? `${productName}: ` : ''}${t.editAria}`}
        >
          <Icon name="edit" size={16} />
        </Link>
      )}

      <ReviewModal open={reviewOpen} onClose={closeReview} />
    </div>
  );
}

function QtyStep({
  label, max, unit = null, qty, setQty, showQty = false, showPrice = false, price = '', setPrice,
  busy, onBack, onConfirm, confirmLabel,
}: {
  label: string; max: number; unit?: ProductUnit | null; qty: string; setQty: (v: string) => void;
  showQty?: boolean; showPrice?: boolean; price?: string; setPrice?: (v: string) => void;
  busy: boolean; onBack: () => void; onConfirm: () => void; confirmLabel: string;
}) {
  const d = useDict();
  const t = d.stock.rowActions;
  const priceOk = !showPrice || (!!price.trim() && Number(price) > 0);
  const fractional = isFractionalUnit(unit);
  const step = qtyStep(unit);
  const n = parseQty(qty, unit);
  const qtyOk = !showQty || (n !== null && n <= max);
  const cur = n ?? step;
  return (
    <div className="row-action-qty">
      <button type="button" className="row-action-back" onClick={onBack}>
        <Icon name="arrowLeft" size={14} /> {d.common.back}
      </button>
      {showQty && (
        <>
          <label className="row-action-qty-label">{label} <span>{tr(t.available, { max: qtyWithUnit(max, unit, d.stock.fields.units) })}</span></label>
          <div className="row-action-qty-row">
            <button type="button" className="qty-btn" disabled={cur - 1 < step} onClick={() => setQty(fmtQty(Math.max(step, addQty(cur, -1))))}>−</button>
            {fractional ? (
              <input
                type="text" inputMode="decimal" value={qty}
                onChange={(e) => setQty(e.target.value.replace(/[^\d.,]/g, ''))}
                aria-invalid={!qtyOk || undefined}
                className="row-action-qty-input"
              />
            ) : (
              <input
                type="number" min={1} max={max} value={qty}
                onChange={(e) => setQty(String(Math.min(max, Math.max(1, parseInt(e.target.value, 10) || 1))))}
                className="row-action-qty-input"
              />
            )}
            <button type="button" className="qty-btn" disabled={cur >= max} onClick={() => setQty(fmtQty(Math.min(max, addQty(cur, 1))))}>+</button>
          </div>
        </>
      )}
      {showPrice && (
        <>
          <label className="row-action-qty-label">{t.soldPrice}</label>
          <PriceInput
            value={String(price ?? '')}
            onValueChange={(raw) => setPrice?.(raw)}
            placeholder={t.pricePlaceholder}
            className="row-action-qty-input"
          />
        </>
      )}
      <button type="button" className="btn btn-primary btn-sm" style={{ width: '100%' }} disabled={busy || !priceOk || !qtyOk} onClick={onConfirm}>
        {confirmLabel}
      </button>
    </div>
  );
}
