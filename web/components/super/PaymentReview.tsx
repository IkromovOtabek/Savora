'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  approvePaymentRequestAction,
  rejectPaymentRequestAction,
  savePaymentAccountAction,
} from '@/app/actions/payments';
import { toast } from '@/lib/toast';
import Icon from '@/components/icons/Icon';
import { fmtDate as fmtDateStable } from '@/lib/format';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';

interface ReqRow {
  id: string;
  orgName: string;
  orgSlug: string;
  amount: number;
  paidAt: string;
  months: number;
  receiptUrl: string;
  note?: string;
  status: 'pending' | 'approved' | 'rejected';
  flags: string[];
  reviewNote?: string;
  reviewedBy?: string;
  createdAt: string;
}

interface Account {
  paymentCardNumber: string;
  paymentCardHolder: string;
  paymentNote: string;
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'sa-pill--warn',
  approved: 'sa-pill--ok',
  rejected: 'sa-pill--bad',
};

function fmtSum(n: number, sum: string) {
  // Deterministik (server=client) — hydration mosligini buzmaslik uchun Intl ishlatilmaydi
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, String.fromCharCode(0xA0)) + ' ' + sum;
}
function fmtDate(d: string) {
  return fmtDateStable(d);
}

function ReceiptThumb({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  const d = useDict();
  const s = d.superPanel.payments;

  if (failed || !url) {
    return (
      <div className="sa-receipt">
        <span style={{ display: 'grid', gap: 4, justifyItems: 'center' }}>
          <Icon name="box" size={24} />
          <span>{s.receiptMissing}</span>
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand)' }}>
              {s.openLink}
            </a>
          )}
        </span>
      </div>
    );
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="sa-receipt" aria-label={s.openReceipt}>
      <img src={url} alt={s.receiptAlt} onError={() => setFailed(true)} />
    </a>
  );
}

export default function PaymentReview({ requests, account }: { requests: ReqRow[]; account: Account }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const d = useDict();
  const s = d.superPanel.payments;

  async function approve(id: string) {
    setBusy(id);
    const fd = new FormData();
    fd.set('requestId', id);
    const res = await approvePaymentRequestAction(null, fd);
    setBusy(null);
    if (res?.error) return toast(res.error, 'error');
    toast(res?.success ?? s.approved, 'success');
    router.refresh();
  }

  async function reject(id: string) {
    const answer = prompt(s.rejectPrompt);
    // "Bekor qilish" bosilsa — rad etilmaydi
    if (answer === null) return;
    const reason = answer;
    setBusy(id);
    const fd = new FormData();
    fd.set('requestId', id);
    fd.set('reason', reason);
    const res = await rejectPaymentRequestAction(null, fd);
    setBusy(null);
    if (res?.error) return toast(res.error, 'error');
    toast(res?.success ?? s.rejected, 'success');
    router.refresh();
  }

  async function saveAccount(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy('account');
    const res = await savePaymentAccountAction(null, new FormData(e.currentTarget));
    setBusy(null);
    if (res?.error) return toast(res.error, 'error');
    toast(res?.success ?? d.common.saved, 'success');
    router.refresh();
  }

  const pending = requests.filter((r) => r.status === 'pending');
  const others = requests.filter((r) => r.status !== 'pending');

  return (
    <>
      {/* Kutilayotgan so'rovlar */}
      <section className="sa-section">
        <div className="sa-ghead">
          {s.pendingTitle}
          <span className="sa-count">{tr(d.common.nPcs, { n: pending.length })}</span>
        </div>
        <div className="sa-group">
          {pending.length === 0 ? (
            <div className="ux-empty">
              <span className="ux-empty-ic"><Icon name="check" size={24} /></span>
              <b>{s.allReviewedTitle}</b>
              <p>{s.allReviewedText}</p>
            </div>
          ) : (
            pending.map((r) => (
              <div key={r.id} className="sa-pay">
                <ReceiptThumb url={r.receiptUrl} />
                <div className="sa-pay-body">
                  <div className="sa-pay-top">
                    <strong>{r.orgName}</strong>
                    <span>{r.orgSlug}</span>
                  </div>
                  <div className="sa-pay-sum">{fmtSum(r.amount, d.common.sum)}</div>
                  <div className="sa-pay-meta">
                    <span>{tr(s.nMonths, { n: r.months })}</span>
                    <span>{s.paidAt} {fmtDate(r.paidAt)}</span>
                    <span>{s.sentAt} {fmtDate(r.createdAt)}</span>
                  </div>
                  {r.note && <div className="sa-pay-meta">{s.noteLabel} {r.note}</div>}
                  {r.flags.length > 0 && (
                    <div className="sa-pay-flags">
                      {r.flags.map((f, i) => (
                        <span key={i} className="sa-pill sa-pill--warn"><Icon name="alert" size={12} /> {f}</span>
                      ))}
                    </div>
                  )}
                  <div className="sa-pay-actions">
                    <button type="button" className="sa-btn sa-btn--filled sa-btn--sm" disabled={busy === r.id} onClick={() => approve(r.id)}>
                      <Icon name="check" size={14} strokeWidth={2.6} /> {s.approve}
                    </button>
                    <button type="button" className="sa-btn sa-btn--danger sa-btn--sm" disabled={busy === r.id} onClick={() => reject(r.id)}>
                      {s.reject}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* To'lov rekvizitlari */}
      <section className="sa-section">
        <div className="sa-ghead">{s.accountTitle}</div>
        <div className="sa-card">
          <form onSubmit={saveAccount} className="sa-form" style={{ padding: 16 }}>
            <div className="sa-grid-2">
              <div className="sa-field">
                <label htmlFor="pa-card">{s.cardNumber}</label>
                <input id="pa-card" name="paymentCardNumber" defaultValue={account.paymentCardNumber} placeholder="8600 1234 5678 9012" inputMode="numeric" />
              </div>
              <div className="sa-field">
                <label htmlFor="pa-holder">{s.cardHolder}</label>
                <input id="pa-holder" name="paymentCardHolder" defaultValue={account.paymentCardHolder} placeholder={s.cardHolderPlaceholder} />
              </div>
            </div>
            <div className="sa-field">
              <label htmlFor="pa-note">{s.noteForStore}</label>
              <input id="pa-note" name="paymentNote" defaultValue={account.paymentNote} placeholder={s.notePlaceholder} />
            </div>
            <div className="sa-form-actions">
              <button type="submit" className="sa-btn sa-btn--filled" disabled={busy === 'account'}>
                {busy === 'account' ? d.common.saving : d.common.save}
              </button>
            </div>
          </form>
        </div>
        <div className="sa-gfoot">{s.accountFoot}</div>
      </section>

      {/* Tarix */}
      {others.length > 0 && (
        <section className="sa-card">
          <div className="sa-card-h"><h2>{s.history}</h2><span className="sa-count">{tr(d.common.nPcs, { n: others.length })}</span></div>
          <div className="sa-table-wrap">
            <table className="sa-table">
              <thead>
                <tr><th>{d.superPanel.shell.store}</th><th className="sa-td-r">{d.common.amount}</th><th className="sa-td-r">{s.colMonths}</th><th>{d.common.status}</th><th>{s.colReviewedBy}</th></tr>
              </thead>
              <tbody>
                {others.map((r) => (
                  <tr key={r.id}>
                    <td><span className="sa-td-main">{r.orgName}</span><span className="sa-td-sub">{r.orgSlug}</span></td>
                    <td className="sa-td-r">{fmtSum(r.amount, d.common.sum)}</td>
                    <td className="sa-td-r">{r.months}</td>
                    <td>
                      <span className={`sa-pill ${STATUS_BADGE[r.status]}`}>{s.statusLabel[r.status] ?? r.status}</span>
                      {r.reviewNote ? <span className="sa-td-sub">{r.reviewNote}</span> : null}
                    </td>
                    <td>{r.reviewedBy ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
