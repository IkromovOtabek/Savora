'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { postReceiptAction, saveReceiptAction } from '@/app/actions/receipts';
import { createSupplierQuickAction } from '@/app/actions/suppliers';
import type { ReceiptInput, ReceiptView } from '@/lib/production/receipts';
import PriceInput from '@/components/ui/PriceInput';
import SelectAdd from '@/components/ui/SelectAdd';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';
import { qtyWithUnit, tr } from '@/lib/i18n/fmt';
import { fmtMoney } from '@/lib/format';
import { addQty, fmtQty } from '@/lib/qty';
import { toast } from '@/lib/toast';
import ConfirmDialog from './ConfirmDialog';
import DocLines from './DocLines';
import LinePicker from './LinePicker';
import {
  fromDateInput, lineForShortage, lineFromProduct, lineQtyOf, newClientId, sumAmounts, toDateInput,
  type DocLine, type LineProduct, type PrefillItem,
} from './lines';

export interface ReceiptFormProps {
  /** null — yangi kirim akti */
  receipt: ReceiptView | null;
  /** Yangi aktda oldindan tanlangan yetkazib beruvchi (?supplier=) */
  presetSupplierId?: string | null;
  /** Tahrirda: qator tovarlarining birlik ma'lumoti (productId → tovar) */
  lineProducts: Record<string, LineProduct>;
  branches: { id: string; name: string }[];
  defaultBranchId: string;
  suppliers: { id: string; name: string }[];
  /** Yetkazib beruvchini shu yerda qo'shish (suppliers.manage) */
  canAddSupplier: boolean;
  canViewPrices: boolean;
  /** «Hozir to'landi» (suppliers.manage + product.viewCost) */
  canSetPayment: boolean;
  canPost: boolean;
  /** Yangi aktda: «Kam qolgan» blokidan tanlangan tovarlar (yetmagan miqdor bilan) */
  prefill?: PrefillItem[];
}

/**
 * Kirim akti formasi: yangi qoralama yoki qoralamani tahrirlash. «Saqlash» — qoralama (ombor o'zgarmaydi),
 * «Kirim qilish» — saqlanmagan o'zgarish bo'lsa avval saqlaydi, so'ng post (postReceiptAction). docs/SEX_API.md §6.7.
 */
export default function ReceiptForm({
  receipt,
  presetSupplierId,
  lineProducts,
  branches,
  defaultBranchId,
  suppliers: initialSuppliers,
  canAddSupplier,
  canViewPrices,
  canSetPayment,
  canPost,
  prefill,
}: ReceiptFormProps) {
  const d = useDict();
  const t = d.production.receipts;
  const c = d.production.common;
  const router = useRouter();
  const [pending, start] = useTransition();
  const lockedPo = !!receipt?.purchaseOrderId;

  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [supplierId, setSupplierId] = useState(receipt?.supplierId ?? presetSupplierId ?? '');
  const [branchId, setBranchId] = useState(receipt?.branchId ?? defaultBranchId);
  const [invoiceNo, setInvoiceNo] = useState(receipt?.supplierInvoiceNo ?? '');
  const [invoiceDate, setInvoiceDate] = useState(toDateInput(receipt?.invoiceDate));
  const [note, setNote] = useState(receipt?.note ?? '');
  const [paid, setPaid] = useState(receipt?.paidNow ? String(receipt.paidNow) : '');
  const [lines, setLines] = useState<DocLine[]>(() => (!receipt && prefill?.length ? prefill.map((x) => lineForShortage(x.product, x.shortage, { withPrice: canViewPrices })) : (receipt?.lines ?? []).map((l) => {
    const base = l.baseUnit ?? 'dona';
    const known = lineProducts[l.productId];
    const product: LineProduct = known ?? {
      id: l.productId, code: l.code, name: l.name, unit: l.baseUnit,
      purchaseUnit: l.unit && l.unit !== base ? l.unit : null, purchaseFactor: l.unit && l.unit !== base ? l.factor : null,
      available: null, barcode: null, cost: null,
    };
    return {
      key: l.id, product, qty: fmtQty(l.qty), unit: l.unit ?? base, price: l.price !== null ? String(l.price) : '',
      priced: l.priced, expiry: toDateInput(l.expiryDate), poLineId: l.poLineId,
    };
  })));
  const [dirty, setDirty] = useState(!receipt && !!prefill?.length);
  const [showErrors, setShowErrors] = useState(false);
  const [confirm, setConfirm] = useState<'post' | null>(null);
  const [focusKey, setFocusKey] = useState<{ key: string; n: number; focus: boolean } | null>(null);
  // Ekran o'quvchi uchun: skanerdan keyin «Un: 3 qop»
  const [live, setLive] = useState('');
  const [clientId] = useState(newClientId);

  const touch = () => setDirty(true);

  // Saqlanmagan o'zgarish bilan sahifadan chiqishda brauzer so'raydi
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const total = useMemo(() => sumAmounts(lines), [lines]);
  const paidNum = Number(paid || 0);
  const hasSupplier = lockedPo || !!supplierId;
  const showPayment = canSetPayment && hasSupplier;
  const debt = Math.max(0, total - (showPayment ? paidNum : 0));
  const unpricedCount = canViewPrices ? lines.filter((l) => l.price === '').length : (receipt?.unpriced ?? 0);
  const warehouseName = branches.find((b) => b.id === branchId)?.name ?? receipt?.branchName ?? '';

  function addProduct(p: LineProduct, via: 'scan' | 'pick') {
    const existing = lines.find((l) => l.product.id === p.id);
    if (existing) {
      if (via === 'scan') {
        // Skaner: har o'qish +1 (shu qator birligida)
        const cur = lineQtyOf(existing)?.qty ?? 0;
        const next = fmtQty(addQty(cur, 1));
        setLines((prev) => prev.map((l) => (l.key === existing.key ? { ...l, qty: next } : l)));
        setLive(tr(t.scanAdded, { name: p.name, qty: `${next} ${d.stock.fields.units[existing.unit] ?? existing.unit}` }));
        touch();
      } else {
        toast(tr(t.alreadyInList, { name: p.name }), 'info');
      }
      // Skanerda fokus qidiruvda qoladi (keyingi skan), qo'lda tanlanganda — miqdor maydoniga o'tadi
      setFocusKey({ key: existing.key, n: Date.now(), focus: via === 'pick' });
      return;
    }
    const line = lineFromProduct(p, { withPrice: canViewPrices });
    setLines((prev) => [...prev, line]);
    setFocusKey({ key: line.key, n: Date.now(), focus: via === 'pick' });
    if (via === 'scan') setLive(tr(t.scanAdded, { name: p.name, qty: `${line.qty} ${d.stock.fields.units[line.unit] ?? line.unit}` }));
    touch();
  }

  function patchLine(key: string, part: Partial<DocLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...part } : l)));
    touch();
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
    touch();
  }

  /** Tekshiruv + server kirishi; xato bo'lsa — xabar va null */
  function buildInput(): ReceiptInput | null {
    if (lines.length === 0) { toast(t.noLines, 'error'); return null; }
    const parsed = lines.map((l) => ({ l, q: lineQtyOf(l) }));
    if (parsed.some((x) => !x.q)) { setShowErrors(true); toast(t.badQty, 'error'); return null; }
    if (canSetPayment && hasSupplier && paidNum > total) { toast(t.overpaid, 'error'); return null; }
    return {
      ...(lockedPo ? {} : { supplierId: supplierId || undefined, branchId }),
      supplierInvoiceNo: invoiceNo.trim() || undefined,
      invoiceDate: fromDateInput(invoiceDate),
      note: note.trim() || undefined,
      // Yetkazib beruvchisiz aktda to'lov bo'lmaydi — eski qiymat ham 0 ga tushadi
      ...(canSetPayment ? { paidNow: hasSupplier ? paidNum : 0 } : {}),
      ...(receipt ? {} : { clientId }),
      lines: parsed.map(({ l, q }) => ({
        productId: l.product.id,
        qty: q!.qty,
        unit: l.unit,
        ...(canViewPrices ? { price: l.price === '' ? null : Number(l.price) } : {}),
        expiryDate: fromDateInput(l.expiry),
        ...(l.poLineId ? { poLineId: l.poLineId } : {}),
      })),
    };
  }

  /** Qoralamani saqlaydi; muvaffaqiyatda — hujjat id */
  async function persist(input: ReceiptInput, silent: boolean): Promise<string | null> {
    const r = await saveReceiptAction(receipt?.id ?? null, input);
    if (!r.ok) {
      toast(r.error, 'error');
      if (r.code === 'conflict') router.refresh();
      return null;
    }
    if (!silent) toast(r.success ?? d.common.saved, 'success');
    return r.data.receipt.id;
  }

  function onSave() {
    const input = buildInput();
    if (!input) return;
    start(async () => {
      const id = await persist(input, false);
      if (!id) return;
      setDirty(false);
      if (!receipt) router.replace(`/app/receipts/${id}`);
      else router.refresh();
    });
  }

  function onPostClick() {
    if (!buildInput()) return;
    setConfirm('post');
  }

  function doPost() {
    const input = buildInput();
    if (!input) { setConfirm(null); return; }
    start(async () => {
      let id = receipt?.id ?? null;
      if (!id || dirty) {
        id = await persist(input, true);
        if (!id) { setConfirm(null); return; }
        setDirty(false);
      }
      const r = await postReceiptAction(id, canSetPayment && hasSupplier ? { paidNow: paidNum } : {});
      setConfirm(null);
      if (!r.ok) {
        toast(r.error, 'error');
        // Qoralama saqlangan — takroriy yaratmaslik uchun uning sahifasiga o'tamiz
        if (!receipt) router.replace(`/app/receipts/${id}`);
        else router.refresh();
        return;
      }
      const extra = r.data.created.length ? ` ${tr(t.createdCards, { n: r.data.created.length })}` : '';
      toast(`${r.success ?? d.common.saved}${extra}`, 'success');
      if (!receipt) router.replace(`/app/receipts/${id}`);
      else router.refresh();
    });
  }

  const branchSelect = branches.length > 1 && !lockedPo;

  return (
    <div className="rc-form">
      {lockedPo && receipt?.purchaseOrderNo && (
        <p className="rc-note rc-note--info">
          <Icon name="send" size={16} />
          <span>{tr(t.fromPo, { no: receipt.purchaseOrderNo })}. {t.fromPoHint}</span>
          <Link href={`/app/purchase-orders/${receipt.purchaseOrderId}`}>{t.openPo}</Link>
        </p>
      )}

      <section className="rc-card rc-head" aria-label={t.headLabel}>
        <div className="auth-field">
          <label htmlFor="rc-supplier">{c.supplier}</label>
          {lockedPo ? (
            <input id="rc-supplier" type="text" value={receipt?.supplierName ?? ''} readOnly disabled />
          ) : (
            <SelectAdd
              id="rc-supplier"
              value={supplierId}
              onChange={(v) => { setSupplierId(v); touch(); }}
              options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
              placeholder={t.noSupplier}
              disabled={pending}
              addLabel={t.supplierQuickAdd}
              addPlaceholder={t.supplierQuickPh}
              maxLength={120}
              onAdd={canAddSupplier ? async (name) => {
                const res = await createSupplierQuickAction(name);
                if (!res.ok) return { error: res.error };
                setSuppliers((prev) => (prev.some((x) => x.id === res.item.id) ? prev : [...prev, res.item].sort((a, b) => a.name.localeCompare(b.name))));
                return { value: res.item.id, label: res.item.name };
              } : undefined}
            />
          )}
          {!lockedPo && <span className="field-hint">{t.supplierHint}</span>}
        </div>
        <div className="auth-field">
          <label htmlFor="rc-branch">{c.warehouse}</label>
          {branchSelect ? (
            <select id="rc-branch" value={branchId} onChange={(e) => { setBranchId(e.target.value); touch(); }} disabled={pending}>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          ) : (
            <input id="rc-branch" type="text" value={warehouseName} readOnly disabled />
          )}
        </div>
        <div className="auth-field">
          <label htmlFor="rc-inv">{t.invoiceNo}</label>
          <input id="rc-inv" type="text" maxLength={60} value={invoiceNo} placeholder={d.common.optional} disabled={pending} onChange={(e) => { setInvoiceNo(e.target.value); touch(); }} />
        </div>
        <div className="auth-field">
          <label htmlFor="rc-invdate">{t.invoiceDate}</label>
          <input id="rc-invdate" type="date" value={invoiceDate} disabled={pending} onChange={(e) => { setInvoiceDate(e.target.value); touch(); }} />
        </div>
      </section>

      <section className="rc-card" aria-labelledby="rc-lines-h">
        <div className="rc-card-head">
          <h2 id="rc-lines-h">{t.linesTitle}</h2>
          {lines.length > 0 && <span className="rc-count">{tr(t.linesN, { n: lines.length })}</span>}
        </div>
        <LinePicker branchId={branchId} onPick={addProduct} disabled={pending} />
        <span className="sr-only" aria-live="polite">{live}</span>
        {!canViewPrices && <p className="rc-note"><Icon name="eyeOff" size={16} /><span>{t.pricesHiddenNote}</span></p>}
        <DocLines
          lines={lines}
          onChange={patchLine}
          onRemove={removeLine}
          showPrices={canViewPrices}
          showExpiry
          showErrors={showErrors}
          disabled={pending}
          focusKey={focusKey}
        />
      </section>

      <section className="rc-card rc-sum">
        <div className="auth-field rc-sum-note">
          <label htmlFor="rc-note">{c.note}</label>
          <textarea id="rc-note" className="text-area" rows={3} maxLength={500} value={note} disabled={pending} onChange={(e) => { setNote(e.target.value); touch(); }} />
        </div>
        <dl className="rc-totals">
          <div className="rc-total-row rc-total-row--main">
            <dt>{c.total}</dt>
            <dd className="t-num">{canViewPrices ? <>{fmtMoney(total)} <small>{d.common.sum}</small></> : <span className="rc-muted">{t.priceHidden}</span>}</dd>
          </div>
          {canSetPayment && (
            <div className="rc-total-row rc-total-pay">
              <dt><label htmlFor="rc-paid">{t.paidNow}</label></dt>
              <dd>
                <PriceInput id="rc-paid" className="input rc-num" value={hasSupplier ? paid : ''} onValueChange={(v) => { setPaid(v); touch(); }} disabled={pending || !hasSupplier} placeholder="0" />
              </dd>
              <p className="field-hint">{hasSupplier ? t.paymentHint : t.paymentNeedsSupplier}</p>
            </div>
          )}
          {canViewPrices && hasSupplier && (
            <div className="rc-total-row">
              <dt>{t.debt}</dt>
              <dd className={`t-num${debt > 0 ? ' rc-c-warn' : ''}`}>{fmtMoney(debt)} <small>{d.common.sum}</small></dd>
            </div>
          )}
        </dl>
        {unpricedCount > 0 && (
          <p className="rc-note rc-note--warn">
            <Icon name="alert" size={16} />
            <span>{tr(canViewPrices ? t.unpricedNote : t.unpricedNoteHidden, { n: unpricedCount })}</span>
          </p>
        )}
      </section>

      <div className="rc-actions" role="group" aria-label={d.common.actions}>
        <span className={`rc-actions-hint${dirty ? ' rc-actions-hint--dirty' : ''}`}>{dirty ? t.unsaved : t.saveHint}</span>
        <button type="button" className="btn btn-ghost" onClick={onSave} disabled={pending}>
          {pending && confirm === null ? d.common.saving : t.saveDraft}
        </button>
        {canPost && (
          <button
            type="button"
            className="btn btn-accent btn-with-icon"
            onClick={onPostClick}
            disabled={pending || lines.length === 0 || (canViewPrices && unpricedCount > 0)}
            title={canViewPrices && unpricedCount > 0 ? tr(t.unpricedNote, { n: unpricedCount }) : undefined}
          >
            <Icon name="check" size={17} /> {pending && confirm === 'post' ? t.posting : t.post}
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirm === 'post'}
        title={t.postConfirmTitle}
        confirmLabel={pending ? t.posting : t.post}
        cancelLabel={t.keep}
        tone="accent"
        pending={pending}
        onConfirm={doPost}
        onClose={() => { if (!pending) setConfirm(null); }}
      >
        <p>{tr(t.postConfirmText, { n: lines.length, warehouse: warehouseName })}</p>
        {canViewPrices && (
          <p className="rc-dialog-money">
            {tr(t.postConfirmMoney, {
              total: fmtMoney(total),
              paid: fmtMoney(showPayment ? paidNum : 0),
              debt: hasSupplier ? fmtMoney(debt) : '—',
            })}
          </p>
        )}
        <ul className="rc-dialog-lines">
          {lines.slice(0, 6).map((l) => {
            const q = lineQtyOf(l);
            return <li key={l.key}><span>{l.product.name}</span><b>{q ? qtyWithUnit(q.qty, l.unit, d.stock.fields.units) : '—'}</b></li>;
          })}
          {lines.length > 6 && <li className="rc-muted">… +{lines.length - 6}</li>}
        </ul>
      </ConfirmDialog>
    </div>
  );
}
