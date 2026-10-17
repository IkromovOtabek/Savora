'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { submitPaymentRequestAction } from '@/app/actions/payments';
import { resolvePublicFileUrl } from '@/lib/fileUrl';
import { toast } from '@/lib/toast';
import { fmtDate } from '@/lib/format';
import Icon from '@/components/icons/Icon';
import PriceInput from '@/components/ui/PriceInput';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import '@/components/tenant/styles/finance.css';

interface OwnRequest {
  id: string;
  amount: number;
  months: number;
  status: 'pending' | 'approved' | 'rejected';
  reviewNote?: string;
  createdAt: string;
}

interface Props {
  account: { paymentCardNumber: string; paymentCardHolder: string; paymentNote: string };
  monthlyPrice: number;
  requests: OwnRequest[];
}

const STATUS_CLS: Record<OwnRequest['status'], string> = {
  pending: 'badge-status--suspended',
  approved: 'badge-status--active',
  rejected: 'badge-status--expired',
};

export default function PaymentSubmit({ account, monthlyPrice, requests }: Props) {
  const router = useRouter();
  const d = useDict();
  const k = d.sales.subscription;
  // Deterministik (server=client) — hydration mosligini buzmaslik uchun Intl ishlatilmaydi
  const fmtSum = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, String.fromCharCode(0xA0)) + ' ' + d.common.sum;
  const [months, setMonths] = useState(1);
  const [receiptUrl, setReceiptUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  const hasAccount = !!account.paymentCardNumber;
  const amount = monthlyPrice * months;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set('file', file);
      const res = await fetch('/api/upload?purpose=receipt', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || k.uploadError);
      setReceiptUrl(resolvePublicFileUrl(data.url));
      toast(k.receiptUploaded, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : k.uploadError, 'error');
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!receiptUrl) return toast(k.uploadFirst, 'error');
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    fd.set('receiptUrl', receiptUrl);
    fd.set('months', String(months));
    const res = await submitPaymentRequestAction(null, fd);
    setBusy(false);
    if (res?.error) return toast(res.error, 'error');
    toast(res?.success ?? k.sent, 'success');
    setReceiptUrl('');
    router.refresh();
  }

  async function copyCard() {
    try {
      await navigator.clipboard.writeText(account.paymentCardNumber.replace(/\s+/g, ''));
      toast(k.cardCopied, 'success');
    } catch {
      toast(k.copyFailed, 'error');
    }
  }

  const pending = requests.find((r) => r.status === 'pending');

  return (
    <div className="panel" id="obuna-tolovi" style={{ marginTop: 20, scrollMarginTop: 80 }}>
      <div className="panel-head"><h2>{k.title}</h2></div>
      <div className="detail-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!hasAccount ? (
          <p className="dash-sub" style={{ margin: 0 }}>
            {k.noAccount}
          </p>
        ) : (
          <>
            <div className="pay-account">
              <div className="cell-sub">{k.transferTo}</div>
              <div className="fn-paycard" style={{ margin: '8px 0' }}>
                <div className="fn-paycard-top">
                  <small>{k.cardNumber}</small>
                  <span className="fn-emv" aria-hidden="true" />
                </div>
                <strong>{account.paymentCardNumber}</strong>
                <div className="fn-paycard-foot">
                  {account.paymentCardHolder && <span>{account.paymentCardHolder}</span>}
                  <button type="button" className="fn-paycard-copy" onClick={copyCard}>
                    <Icon name="clipboard" size={15} /> {k.copy}
                  </button>
                </div>
              </div>
              {account.paymentNote && <div className="cell-sub">{account.paymentNote}</div>}
            </div>

            {pending ? (
              <div className="auth-alert auth-alert--info" style={{ margin: 0 }}>
                {tr(k.pendingNote, { sum: fmtSum(pending.amount), months: pending.months })}
              </div>
            ) : (
              <form onSubmit={submit} className="form-grid">
                <div className="form-row">
                  <div className="auth-field">
                    <label htmlFor="pay-months">{k.howManyMonths}</label>
                    <input
                      id="pay-months"
                      type="number" min={1} max={24} value={months} disabled={busy}
                      onChange={(e) => setMonths(Math.min(24, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                    />
                    <span className="field-hint">{monthlyPrice > 0 ? tr(k.monthsHint, { n: months, sum: fmtSum(monthlyPrice) }) : k.monthsRange}</span>
                  </div>
                  <div className="auth-field">
                    <label htmlFor="pay-amount">{k.amount}</label>
                    <PriceInput key={months} id="pay-amount" name="amount" required defaultValue={amount} disabled={busy} />
                  </div>
                </div>
                <div className="auth-field">
                  <label htmlFor="pay-date">{k.date}</label>
                  <input id="pay-date" name="paidAt" type="date" required disabled={busy} defaultValue={new Date().toISOString().slice(0, 10)} />
                </div>
                <div className="auth-field">
                  <label htmlFor="pay-receipt">{k.receipt}</label>
                  <input id="pay-receipt" type="file" accept="image/*" onChange={onFile} disabled={uploading || busy} />
                  {uploading && <span className="field-hint">{k.uploading}</span>}
                  {receiptUrl && (
                    <a href={receiptUrl} target="_blank" rel="noopener noreferrer" className="cell-link" style={{ fontSize: '.85rem' }}>
                      <Icon name="check" size={13} /> {k.viewReceipt}
                    </a>
                  )}
                </div>
                <div className="auth-field">
                  <label htmlFor="pay-note">{k.noteOptional}</label>
                  <input id="pay-note" name="note" disabled={busy} />
                </div>
                <button className="btn btn-primary" disabled={busy || uploading || !receiptUrl} style={{ alignSelf: 'flex-start' }}>
                  {busy ? k.sending : k.submit}
                </button>
              </form>
            )}
          </>
        )}

        {requests.length > 0 && (
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table className="data-table">
              <thead><tr><th>{d.common.date}</th><th>{d.common.amount}</th><th>{k.colMonths}</th><th>{d.common.status}</th></tr></thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td data-label={d.common.date}>{fmtDate(r.createdAt)}</td>
                    <td data-label={d.common.amount}>{fmtSum(r.amount)}</td>
                    <td data-label={k.colMonths}>{r.months}</td>
                    <td data-label={d.common.status}>
                      <span className={`badge-status ${STATUS_CLS[r.status]}`}>{k.status[r.status]}</span>
                      {r.reviewNote ? <div className="cell-sub">{r.reviewNote}</div> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
