'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { savePurchaseOrderAction } from '@/app/actions/receipts';
import { createSupplierQuickAction } from '@/app/actions/suppliers';
import type { PoInput, PoView } from '@/lib/production/purchaseOrders';
import SelectAdd from '@/components/ui/SelectAdd';
import Icon from '@/components/icons/Icon';
import DocLines from '@/components/production/receipts/DocLines';
import LinePicker from '@/components/production/receipts/LinePicker';
import {
  fromDateInput, lineFromProduct, lineQtyOf, newClientId, sumAmounts, toDateInput, type DocLine, type LineProduct,
} from '@/components/production/receipts/lines';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import { fmtMoney } from '@/lib/format';
import { addQty, fmtQty } from '@/lib/qty';
import { toast } from '@/lib/toast';
import PoActions from './PoActions';

export interface PoFormProps {
  /** null — yangi buyurtma */
  po: PoView | null;
  presetSupplierId?: string | null;
  lineProducts: Record<string, LineProduct>;
  branches: { id: string; name: string }[];
  defaultBranchId: string;
  suppliers: { id: string; name: string }[];
  canAddSupplier: boolean;
  canViewPrices: boolean;
  /** Shu buyurtmaning ochiq qabul qoralamasi */
  draftReceipt: { id: string; docNo: string } | null;
}

/**
 * Yetkazib beruvchiga buyurtma formasi (yangi yoki tahrir — qoralama/yuborilgan, qabul boshlanmagan).
 * Tahrirda amallar («Yuborildi», «Qabul qilish», bekor) — saqlanmagan o'zgarish avval saqlanadi.
 */
export default function PoForm({
  po,
  presetSupplierId,
  lineProducts,
  branches,
  defaultBranchId,
  suppliers: initialSuppliers,
  canAddSupplier,
  canViewPrices,
  draftReceipt,
}: PoFormProps) {
  const d = useDict();
  const t = d.production.purchase;
  const r = d.production.receipts;
  const c = d.production.common;
  const router = useRouter();
  const [pending, start] = useTransition();

  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [supplierId, setSupplierId] = useState(po?.supplierId ?? presetSupplierId ?? '');
  const [branchId, setBranchId] = useState(po?.branchId ?? defaultBranchId);
  const [expectedAt, setExpectedAt] = useState(toDateInput(po?.expectedAt));
  const [note, setNote] = useState(po?.note ?? '');
  const [lines, setLines] = useState<DocLine[]>(() => (po?.lines ?? []).map((l) => {
    const base = l.baseUnit ?? 'dona';
    const product: LineProduct = lineProducts[l.productId] ?? {
      id: l.productId, code: l.code, name: l.name, unit: l.baseUnit,
      purchaseUnit: l.unit && l.unit !== base ? l.unit : null, purchaseFactor: l.unit && l.unit !== base ? l.factor : null,
      available: null, barcode: null, cost: null,
    };
    return {
      key: l.id, product, qty: fmtQty(l.qty), unit: l.unit ?? base, price: l.price !== null ? String(l.price) : '',
      priced: l.price !== null, expiry: '', poLineId: null,
    };
  }));
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const [showErrors, setShowErrors] = useState(false);
  const [focusKey, setFocusKey] = useState<{ key: string; n: number; focus: boolean } | null>(null);
  const [clientId] = useState(newClientId);

  const touch = () => { setDirty(true); dirtyRef.current = true; };
  const clean = () => { setDirty(false); dirtyRef.current = false; };

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const total = useMemo(() => sumAmounts(lines), [lines]);
  const warehouseName = branches.find((b) => b.id === branchId)?.name ?? po?.branchName ?? '';

  function addProduct(p: LineProduct, via: 'scan' | 'pick') {
    const existing = lines.find((l) => l.product.id === p.id);
    if (existing) {
      if (via === 'scan') {
        const next = fmtQty(addQty(lineQtyOf(existing)?.qty ?? 0, 1));
        setLines((prev) => prev.map((l) => (l.key === existing.key ? { ...l, qty: next } : l)));
        touch();
      } else {
        toast(tr(r.alreadyInList, { name: p.name }), 'info');
      }
      setFocusKey({ key: existing.key, n: Date.now(), focus: via === 'pick' });
      return;
    }
    const line = lineFromProduct(p, { withPrice: canViewPrices });
    setLines((prev) => [...prev, line]);
    setFocusKey({ key: line.key, n: Date.now(), focus: via === 'pick' });
    touch();
  }

  function buildInput(): PoInput | null {
    if (!supplierId) { toast(t.supplierRequired, 'error'); document.getElementById('po-supplier')?.focus(); return null; }
    if (lines.length === 0) { toast(r.noLines, 'error'); return null; }
    const parsed = lines.map((l) => ({ l, q: lineQtyOf(l) }));
    if (parsed.some((x) => !x.q)) { setShowErrors(true); toast(r.badQty, 'error'); return null; }
    return {
      supplierId,
      branchId,
      expectedAt: fromDateInput(expectedAt),
      note: note.trim() || undefined,
      ...(po ? {} : { clientId }),
      lines: parsed.map(({ l, q }) => ({
        productId: l.product.id,
        qty: q!.qty,
        unit: l.unit,
        ...(canViewPrices ? { price: l.price === '' ? null : Number(l.price) } : {}),
      })),
    };
  }

  async function persist(input: PoInput, silent: boolean): Promise<string | null> {
    const res = await savePurchaseOrderAction(po?.id ?? null, input);
    if (!res.ok) {
      toast(res.error, 'error');
      if (res.code === 'conflict') router.refresh();
      return null;
    }
    if (!silent) toast(res.success ?? d.common.saved, 'success');
    clean();
    return res.data.po.id;
  }

  function onSave() {
    const input = buildInput();
    if (!input) return;
    start(async () => {
      const id = await persist(input, false);
      if (!id) return;
      if (!po) router.replace(`/app/purchase-orders/${id}`);
      else router.refresh();
    });
  }

  /** Amal oldidan: saqlanmagan o'zgarish bo'lsa — saqlash */
  async function beforeAction(): Promise<boolean> {
    if (!dirtyRef.current) return true;
    const input = buildInput();
    if (!input) return false;
    return !!(await persist(input, true));
  }

  return (
    <div className="rc-form">
      <section className="rc-card rc-head" aria-label={r.headLabel}>
        <div className="auth-field">
          <label htmlFor="po-supplier">{c.supplier} *</label>
          <SelectAdd
            id="po-supplier"
            value={supplierId}
            onChange={(v) => { setSupplierId(v); touch(); }}
            options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
            placeholder={t.supplierPh}
            required
            disabled={pending}
            addLabel={r.supplierQuickAdd}
            addPlaceholder={r.supplierQuickPh}
            maxLength={120}
            onAdd={canAddSupplier ? async (name) => {
              const res = await createSupplierQuickAction(name);
              if (!res.ok) return { error: res.error };
              setSuppliers((prev) => (prev.some((x) => x.id === res.item.id) ? prev : [...prev, res.item].sort((a, b) => a.name.localeCompare(b.name))));
              return { value: res.item.id, label: res.item.name };
            } : undefined}
          />
        </div>
        <div className="auth-field">
          <label htmlFor="po-branch">{c.warehouse}</label>
          {branches.length > 1 ? (
            <select id="po-branch" value={branchId} onChange={(e) => { setBranchId(e.target.value); touch(); }} disabled={pending}>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          ) : (
            <input id="po-branch" type="text" value={warehouseName} readOnly disabled />
          )}
          <span className="field-hint">{t.warehouseHint}</span>
        </div>
        <div className="auth-field">
          <label htmlFor="po-exp">{t.expectedAt}</label>
          <input id="po-exp" type="date" value={expectedAt} disabled={pending} onChange={(e) => { setExpectedAt(e.target.value); touch(); }} />
        </div>
      </section>

      <section className="rc-card" aria-labelledby="po-lines-h">
        <div className="rc-card-head">
          <h2 id="po-lines-h">{r.linesTitle}</h2>
          {lines.length > 0 && <span className="rc-count">{tr(r.linesN, { n: lines.length })}</span>}
        </div>
        <LinePicker branchId={branchId} onPick={addProduct} disabled={pending} />
        {!canViewPrices && <p className="rc-note"><Icon name="eyeOff" size={16} /><span>{r.pricesHiddenNote}</span></p>}
        <DocLines
          lines={lines}
          onChange={(key, part) => { setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...part } : l))); touch(); }}
          onRemove={(key) => { setLines((prev) => prev.filter((l) => l.key !== key)); touch(); }}
          showPrices={canViewPrices}
          showExpiry={false}
          showErrors={showErrors}
          disabled={pending}
          focusKey={focusKey}
        />
      </section>

      <section className="rc-card rc-sum">
        <div className="auth-field rc-sum-note">
          <label htmlFor="po-note">{c.note}</label>
          <textarea id="po-note" className="text-area" rows={3} maxLength={500} value={note} disabled={pending} onChange={(e) => { setNote(e.target.value); touch(); }} />
        </div>
        <dl className="rc-totals">
          <div className="rc-total-row rc-total-row--main">
            <dt>{c.total}</dt>
            <dd className="t-num">{canViewPrices ? <>{fmtMoney(total)} <small>{d.common.sum}</small></> : <span className="rc-muted">{r.priceHidden}</span>}</dd>
          </div>
        </dl>
      </section>

      <div className="rc-actions" role="group" aria-label={d.common.actions}>
        <span className={`rc-actions-hint${dirty ? ' rc-actions-hint--dirty' : ''}`}>{dirty ? r.unsaved : ''}</span>
        {po && (
          <PoActions
            id={po.id}
            can={{ send: po.can.send, receive: po.can.receive, cancel: po.can.cancel }}
            draftReceipt={draftReceipt}
            beforeAction={beforeAction}
            disabled={pending}
            only={['send', 'receive']}
          />
        )}
        <button type="button" className={`btn ${po ? 'btn-ghost' : 'btn-primary'}`} onClick={onSave} disabled={pending}>
          {pending ? d.common.saving : d.common.save}
        </button>
      </div>
    </div>
  );
}
