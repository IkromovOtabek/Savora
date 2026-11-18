'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import { fmtQty, isFractionalUnit } from '@/lib/qty';
import { toast } from '@/lib/toast';
import type { OrderView, LaborEdit, MaterialEdit, Shortage } from '@/lib/production/orders';
import { completeProductionOrderAction } from '@/app/actions/production';
import Dialog from '../common/Dialog';
import ShortageList from '../common/ShortageList';
import { useProdRun } from '../common/useProdRun';
import { cleanQtyInput, parseActualQty, unitName } from '../common/ui';

interface Props {
  order: OrderView;
  open: boolean;
  onClose: () => void;
  /** Saqlanmagan sarf/ish haqi (yakunlashda birga yuboriladi); xato bo'lsa — matn */
  pending: { materials?: MaterialEdit[]; labor?: LaborEdit[]; error: string | null; dirty: boolean };
  canReceive: boolean;
  canPurchase: boolean;
}

/**
 * «Bajarildi» oynasi: yaroqli mahsulot va brak miqdori; saqlanmagan haqiqiy sarf va ish haqi ham qo'llanadi.
 * Xom ashyo yetmasa (`outOfStock`) — hech narsa yozilmaydi, `details.shortages` ro'yxati shu oynada ko'rinadi.
 */
export default function CompleteDialog({ order, open, onClose, pending: edits, canReceive, canPurchase }: Props) {
  const d = useDict();
  const t = d.production.orders;
  const c = d.production.common;
  const units = d.stock.fields.units;
  const unit = order.recipe.unit;
  const router = useRouter();
  const { pending, run } = useProdRun();
  const [produced, setProduced] = useState(fmtQty(order.plannedQty));
  const [scrap, setScrap] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [shortages, setShortages] = useState<Shortage[] | null>(null);

  const p = parseActualQty(produced, unit);
  const s = scrap.trim() === '' ? 0 : parseActualQty(scrap, unit);
  const valid = p !== null && s !== null && p + s > 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (edits.error) return setError(edits.error);
    if (!valid || p === null || s === null) return setError(t.errProduced);
    setError(null);
    setShortages(null);
    run(
      () => completeProductionOrderAction(order.id, {
        producedQty: p,
        ...(s > 0 ? { scrapQty: s } : {}),
        ...(edits.materials?.length ? { materials: edits.materials } : {}),
        ...(edits.labor ? { labor: edits.labor } : {}),
        expectedRev: order.rev,
      }),
      {
        after: (data) => {
          if (data.createdOutput) toast(t.createdOutput, 'info');
          onClose();
        },
        onError: (er) => {
          const list = (er.details as { shortages?: Shortage[] } | undefined)?.shortages;
          if (er.code === 'outOfStock' && Array.isArray(list) && list.length) {
            setShortages(list);
            return true;
          }
          if (er.code === 'conflict') {
            // Akt boshqa joyda o'zgargan — yangi holat yuklanadi, oyna yopiladi
            toast(t.conflictReload, 'error');
            onClose();
            router.refresh();
            return true;
          }
          setError(er.error);
          return true;
        },
      },
    );
  }

  const inputMode = isFractionalUnit(unit) ? 'decimal' : 'numeric';

  return (
    <Dialog open={open} onClose={onClose} title={t.completeTitle} wide>
      <form onSubmit={submit} noValidate>
        <p className="pr-hint">{tr(t.completeHint, { from: order.fromBranchName ?? '—', to: order.toBranchName ?? '—' })}</p>
        {edits.dirty && <p className="t-note t-note--info" style={{ margin: 0 }}>{t.completeUnsaved}</p>}
        <div className="pr-grid2">
          <label className="pr-field">
            <span>{t.producedQty}</span>
            <span className="pr-suffix">
              <input
                className="input"
                inputMode={inputMode}
                value={produced}
                onChange={(e) => setProduced(cleanQtyInput(e.target.value, unit))}
                aria-invalid={p === null || undefined}
                disabled={pending}
                autoFocus
              />
              <span>{unitName(unit, units)}</span>
            </span>
          </label>
          <label className="pr-field">
            <span>{c.scrap}</span>
            <span className="pr-suffix">
              <input
                className="input"
                inputMode={inputMode}
                value={scrap}
                onChange={(e) => setScrap(cleanQtyInput(e.target.value, unit))}
                aria-invalid={s === null || undefined}
                placeholder="0"
                disabled={pending}
                aria-describedby="pr-cd-scrap-h"
              />
              <span>{unitName(unit, units)}</span>
            </span>
            <small id="pr-cd-scrap-h">{t.scrapHint}</small>
          </label>
        </div>

        {shortages && (
          <ShortageList
            title={t.shortageTitle}
            hint={t.shortageHint}
            rows={shortages}
            d={d}
            canReceive={canReceive}
            canPurchase={canPurchase}
          />
        )}

        {error && <p className="pr-error" role="alert">{error}</p>}
        <div className="pr-actions pr-actions--end">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={pending}>{t.keep}</button>
          <button type="submit" className="btn btn-accent" disabled={pending || !valid}>
            {pending ? d.common.saving : t.confirmComplete}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
