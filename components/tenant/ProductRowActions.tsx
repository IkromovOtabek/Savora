'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { quickMarkSoldAction } from '@/app/actions/products';
import { transferProductAction } from '@/app/actions/transfer';
import { toast } from '@/lib/toast';
import Icon from '@/components/icons/Icon';
import ReviewModal from '@/components/tenant/ReviewModal';

interface Props {
  productId: string;
  status: string;
  branches: { id: string; name: string }[];
  currentBranchId: string;
  trackQuantity?: boolean;
  available?: number;
  salePrice?: number;
  richSale?: boolean;
}

type View = 'menu' | 'sellQty' | 'branches' | 'branchQty';

export default function ProductRowActions({
  productId, status, branches, currentBranchId, trackQuantity = false, available = 1, salePrice = 0, richSale = false,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('menu');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState('');
  const [branch, setBranch] = useState<{ id: string; name: string } | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const canChange = status === 'in_stock';
  const otherBranches = branches.filter((b) => b.id !== currentBranchId);
  const needQty = trackQuantity && available > 1;
  const needPrice = !salePrice || salePrice <= 0;

  function openMenu() {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, left: Math.max(8, r.right - 240) });
    setOpen(true);
    setView('menu');
    setErr(null);
    setQty(1);
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
        setErr('Avval sotilgan narxni kiriting.');
        return;
      }
      setErr(res.error);
      toast(res.error, 'error');
      return;
    }
    toast(res?.success ?? 'Bajarildi.', 'success');
    setOpen(false);
    if (onSuccess) {
      onSuccess();
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  function doSell() {
    const extra: Record<string, string> = { qty: String(qty) };
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
    run((fd) => transferProductAction(null, fd), { qty: String(qty), branchId: branch.id }, '/app/transferred');
  }

  return (
    <div className="row-actions" ref={ref}>
      {canChange && (
        <div className="row-action-menu-wrap">
          <button
            ref={btnRef}
            type="button"
            className="icon-btn"
            title="Holatni o'zgartirish"
            onClick={() => (open ? setOpen(false) : openMenu())}
            disabled={busy}
          >
            <Icon name="repeat" size={16} />
          </button>

          {open && pos && (
            <div className="row-action-menu" ref={menuRef} style={{ position: 'fixed', top: pos.top, left: pos.left }}>
              {err && <div className="row-action-err">{err}</div>}

              {view === 'menu' && (
                <>
                  <button type="button" className="row-action-item" disabled={busy}
                    onClick={() => {
                      if (richSale) { setOpen(false); router.push(`/app/sales/new?productId=${productId}`); return; }
                      (needQty || needPrice) ? (setQty(1), setView('sellQty')) : doSell();
                    }}>
                    <Icon name="cart" size={15} /> Sotildi
                  </button>
                  <button type="button" className="row-action-item" disabled={busy}
                    onClick={() => setView('branches')}>
                    <Icon name="repeat" size={15} /> Boshqa filialga berildi
                  </button>
                </>
              )}

              {view === 'sellQty' && (
                <QtyStep
                  label="Nechta sotildi?"
                  max={available}
                  qty={qty}
                  setQty={setQty}
                  showQty={needQty}
                  showPrice={needPrice}
                  price={price}
                  setPrice={setPrice}
                  busy={busy}
                  onBack={() => setView('menu')}
                  onConfirm={doSell}
                  confirmLabel="Sotildi"
                />
              )}

              {view === 'branches' && (
                <>
                  <button type="button" className="row-action-back" onClick={() => setView('menu')}>
                    <Icon name="arrowLeft" size={14} /> Orqaga
                  </button>
                  {otherBranches.length === 0 ? (
                    <div className="row-action-empty">Boshqa filial yo&apos;q.<br /><b>Filiallar</b> bo&apos;limidan yangi filial qo&apos;shing.</div>
                  ) : otherBranches.map((b) => (
                    <button key={b.id} type="button" className="row-action-item" disabled={busy}
                      onClick={() => { setBranch(b); needQty ? (setQty(1), setView('branchQty')) : run((fd) => transferProductAction(null, fd), { qty: '1', branchId: b.id }, '/app/transferred'); }}>
                      <Icon name="building" size={15} /> {b.name}
                    </button>
                  ))}
                </>
              )}

              {view === 'branchQty' && (
                <QtyStep
                  label={`${branch?.name}ga nechta?`}
                  max={available}
                  qty={qty}
                  setQty={setQty}
                  showQty
                  busy={busy}
                  onBack={() => setView('branches')}
                  onConfirm={doTransfer}
                  confirmLabel="Berildi"
                />
              )}
            </div>
          )}
        </div>
      )}

      <Link href={`/app/products/${productId}`} className="icon-btn" title="Tahrirlash">
        <Icon name="edit" size={16} />
      </Link>

      <ReviewModal open={reviewOpen} onClose={closeReview} />
    </div>
  );
}

function QtyStep({
  label, max, qty, setQty, showQty = false, showPrice = false, price = '', setPrice,
  busy, onBack, onConfirm, confirmLabel,
}: {
  label: string; max: number; qty: number; setQty: (n: number) => void;
  showQty?: boolean; showPrice?: boolean; price?: string; setPrice?: (v: string) => void;
  busy: boolean; onBack: () => void; onConfirm: () => void; confirmLabel: string;
}) {
  const priceOk = !showPrice || (!!price.trim() && Number(price) > 0);
  return (
    <div className="row-action-qty">
      <button type="button" className="row-action-back" onClick={onBack}>
        <Icon name="arrowLeft" size={14} /> Orqaga
      </button>
      {showQty && (
        <>
          <label className="row-action-qty-label">{label} <span>(mavjud: {max})</span></label>
          <div className="row-action-qty-row">
            <button type="button" className="qty-btn" disabled={qty <= 1} onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
            <input
              type="number" min={1} max={max} value={qty}
              onChange={(e) => setQty(Math.min(max, Math.max(1, parseInt(e.target.value, 10) || 1)))}
              className="row-action-qty-input"
            />
            <button type="button" className="qty-btn" disabled={qty >= max} onClick={() => setQty(Math.min(max, qty + 1))}>+</button>
          </div>
        </>
      )}
      {showPrice && (
        <>
          <label className="row-action-qty-label">Sotilgan narx (so&apos;m)</label>
          <input
            type="number" min={0} step={1000} value={price} autoFocus
            onChange={(e) => setPrice?.(e.target.value)}
            placeholder="Masalan: 4 500 000"
            className="row-action-qty-input" style={{ textAlign: 'left' }}
          />
        </>
      )}
      <button type="button" className="btn btn-primary btn-sm" style={{ width: '100%' }} disabled={busy || !priceOk} onClick={onConfirm}>
        {confirmLabel}
      </button>
    </div>
  );
}
