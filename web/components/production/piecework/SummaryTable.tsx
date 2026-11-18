'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import { fmtDate, fmtMoney } from '@/lib/format';
import { fmtQty } from '@/lib/qty';
import { payPieceworkAction } from '@/app/actions/production';
import type { WorkerSummary } from '@/lib/production/calc';
import type { PieceworkView } from '@/lib/production/piecework';
import { PwModal, newClientId, useRunAction } from './ui';

export interface PayContext {
  fromIso: string;
  toIso: string;
  /** Davr matni («noyabr, 2026» yoki «01.11.2026 – 15.11.2026») */
  periodLabel: string;
  branches: { id: string; name: string }[];
  defaultBranchId: string | null;
  /** Filial xodimi — kassa chiqimi o'z filialiga (tanlov yo'q) */
  scoped: boolean;
  /** Ishchi → filial (kassa chiqimi filiali sukuti) */
  workerBranch: Record<string, string | null>;
}

const earned = (w: WorkerSummary) => w.logged.amount + w.approved.amount + w.paid.amount;

/**
 * Xodim bo'yicha davr jamlamasi: jami ish, tekshiruvda, qoldiq (tasdiqlangan, to'lanmagan), to'langan;
 * qator ochilsa — operatsiyalar kesimi. Tasdiqlovchida «To'lash» → summa va davr tasdig'i → kassa chiqimi.
 */
export default function SummaryTable({ workers, canPay, pay, entriesBase }: {
  workers: WorkerSummary[];
  canPay: boolean;
  pay: PayContext;
  /** Ishchi yozuvlari havolasi asosi (ro'yxat ko'rinishi, shu davr) — oxiriga `w=<id>` qo'shiladi */
  entriesBase: string;
}) {
  const d = useDict();
  const t = d.production.piecework;
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [paying, setPaying] = useState<WorkerSummary | null>(null);
  const toggle = (id: string) => setOpen((p) => {
    const n = new Set(p);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const sum = (k: 'logged' | 'approved' | 'paid') => workers.reduce((s, w) => s + w[k].amount, 0);

  return (
    <>
      <div className="table-wrap">
        <table className="data-table pw-table pw-sum-table">
          <thead>
            <tr>
              <th>{t.colWorker}</th>
              <th className="num">{t.colEarned}</th>
              <th className="num">{t.colLogged}</th>
              <th className="num">{t.colDue}</th>
              <th className="num">{t.colPaid}</th>
              <th className="cell-actions"><span className="sr-only">{t.colActions}</span></th>
            </tr>
          </thead>
          <tbody>
            {workers.map((w) => {
              const isOpen = open.has(w.workerId);
              return (
                <Fragment key={w.workerId}>
                  <tr>
                    <td data-label={t.colWorker}>
                      <button type="button" className="pw-expand" aria-expanded={isOpen} onClick={() => toggle(w.workerId)}>
                        <Icon name="chevron" size={14} />
                        <span className="cell-main">{w.workerName}</span>
                      </button>
                      <div className="cell-sub">{tr(t.entriesN, { n: w.logged.count + w.approved.count + w.paid.count })}</div>
                    </td>
                    <td data-label={t.colEarned} className="num"><b>{fmtMoney(earned(w))}</b></td>
                    <td data-label={t.colLogged} className="num">
                      {fmtMoney(w.logged.amount)}
                      {w.logged.count > 0 && <div className="cell-sub">{tr(t.entriesN, { n: w.logged.count })}</div>}
                    </td>
                    <td data-label={t.colDue} className="num">
                      <b className={w.due > 0 ? 'pw-due' : ''}>{fmtMoney(w.due)}</b>
                      {w.approved.count > 0 && <div className="cell-sub">{tr(t.entriesN, { n: w.approved.count })}</div>}
                    </td>
                    <td data-label={t.colPaid} className="num">{fmtMoney(w.paid.amount)}</td>
                    <td className="cell-actions" data-label="">
                      <div className="row-actions">
                        <Link href={`${entriesBase}${entriesBase.includes('?') ? '&' : '?'}w=${w.workerId}`} className="btn btn-ghost btn-sm">{t.tabEntries}</Link>
                        {canPay && w.due > 0 && (
                          <button type="button" className="btn btn-primary btn-sm btn-with-icon" onClick={() => setPaying(w)}>
                            <Icon name="wallet" size={15} />{t.pay}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="pw-ops-row">
                      <td colSpan={6} data-label="">
                        <p className="pw-ops-h">{tr(t.byOperationOf, { name: w.workerName })}</p>
                        {w.byOperation.length === 0 ? <p className="pw-muted">{t.summaryEmpty}</p> : (
                          <ul className="pw-ops-list">
                            {w.byOperation.map((o) => (
                              <li key={o.operation}>
                                <span>{o.operation}</span>
                                <span className="num">{fmtQty(o.qty)}</span>
                                <b className="num">{fmtMoney(o.amount)}</b>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          {workers.length > 1 && (
            <tfoot>
              <tr>
                <th>{d.common.total}</th>
                <th data-label={t.colEarned} className="num">{fmtMoney(sum('logged') + sum('approved') + sum('paid'))}</th>
                <th data-label={t.colLogged} className="num">{fmtMoney(sum('logged'))}</th>
                <th data-label={t.colDue} className="num">{fmtMoney(sum('approved'))}</th>
                <th data-label={t.colPaid} className="num">{fmtMoney(sum('paid'))}</th>
                <th />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {paying && <PayDialog worker={paying} pay={pay} onClose={() => setPaying(null)} />}
    </>
  );
}

interface ApprovedList { items: PieceworkView[]; total: number; sums: { approved: { count: number; amount: number } } }

const PAY_LIST_LIMIT = 200;

/**
 * To'lov tasdig'i: ishchining davrdagi TASDIQLANGAN yozuvlari serverdan qayta o'qiladi (jamlama eskirgan bo'lishi
 * mumkin) — ro'yxat, soni va summasi ko'rsatiladi; to'lash aynan shu yozuvlar (`ids`) bilan. Ro'yxat chegaradan
 * katta bo'lsa — davr bo'yicha (server shu davrdagi barcha tasdiqlanganlarni to'laydi). `clientId` — takroriy bosish.
 */
function PayDialog({ worker, pay, onClose }: { worker: WorkerSummary; pay: PayContext; onClose: () => void }) {
  const d = useDict();
  const t = d.production.piecework;
  const { pending, run } = useRunAction();
  const [data, setData] = useState<ApprovedList | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [branchId, setBranchId] = useState(pay.workerBranch[worker.workerId] ?? pay.defaultBranchId ?? '');
  const clientId = useRef(newClientId());

  useEffect(() => {
    let alive = true;
    const q = new URLSearchParams({ status: 'approved', workerId: worker.workerId, from: pay.fromIso, to: pay.toIso, limit: String(PAY_LIST_LIMIT) });
    fetch(`/api/production/piecework?${q}`, { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!alive) return;
        if (!r.ok) { setErr(typeof j.error === 'string' ? j.error : t.loadFailed); return; }
        setData(j as ApprovedList);
      })
      .catch(() => { if (alive) setErr(t.loadFailed); });
    return () => { alive = false; };
  }, [worker.workerId, pay.fromIso, pay.toIso, t.loadFailed]);

  const count = data?.sums.approved.count ?? 0;
  const amount = data?.sums.approved.amount ?? 0;
  const partial = !!data && data.total > data.items.length;
  const showBranch = !pay.scoped && pay.branches.length > 1;

  function confirm() {
    if (!data || !count || pending) return;
    run(() => payPieceworkAction({
      workerId: worker.workerId,
      ...(partial ? {} : { ids: data.items.map((e) => e.id) }),
      from: new Date(pay.fromIso),
      to: new Date(pay.toIso),
      ...(!pay.scoped && branchId ? { branchId } : {}),
      clientId: clientId.current,
    }), { after: onClose });
  }

  return (
    <PwModal
      title={t.payTitle}
      onClose={onClose}
      busy={pending}
      wide
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={pending}>{d.common.cancel}</button>
          <button type="button" className="btn btn-primary btn-with-icon" onClick={confirm} disabled={!count || pending} data-autofocus>
            <Icon name="wallet" size={16} />{pending ? d.common.sending : tr(t.payConfirm, { sum: fmtMoney(amount) })}
          </button>
        </>
      }
    >
      <dl className="pw-pay-facts">
        <div><dt>{t.payWorker}</dt><dd>{worker.workerName}</dd></div>
        <div><dt>{t.payPeriod}</dt><dd>{pay.periodLabel}</dd></div>
        <div><dt>{t.payCount}</dt><dd>{data ? count : '…'}</dd></div>
        <div className="pw-pay-total"><dt>{t.payAmount}</dt><dd>{data ? <>{fmtMoney(amount)} <small>{d.common.sum}</small></> : '…'}</dd></div>
      </dl>

      {err && <p className="field-error" role="alert">{err}</p>}
      {!data && !err && <p className="pw-muted">{t.formLoading}</p>}
      {data && !count && <p className="t-note t-note--warn pw-note">{t.payNothing}</p>}

      {data && data.items.length > 0 && (
        <ul className="pw-pay-list">
          {data.items.map((e) => (
            <li key={e.id}>
              <span>
                {e.operation}
                <small>{[e.workDate ? fmtDate(e.workDate) : null, e.productionOrderNo].filter(Boolean).join(' · ')}</small>
              </span>
              <span className="num">{fmtQty(e.qty)} × {fmtMoney(e.rate)}</span>
              <b className="num">{fmtMoney(e.amount)}</b>
            </li>
          ))}
        </ul>
      )}
      {partial && <p className="t-note t-note--info pw-note">{tr(t.payMore, { n: PAY_LIST_LIMIT })}</p>}

      {showBranch && (
        <div className="auth-field">
          <label htmlFor="pw-pay-branch">{t.payBranch}</label>
          <select id="pw-pay-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {pay.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      )}
      <p className="field-hint">{t.payHint}</p>
    </PwModal>
  );
}
