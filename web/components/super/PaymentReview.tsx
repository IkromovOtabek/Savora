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
  pending: 'badge-status--suspended',
  approved: 'badge-status--active',
  rejected: 'badge-status--expired',
};
const STATUS_LABEL: Record<string, string> = {
  pending: 'Kutilmoqda',
  approved: 'Tasdiqlangan',
  rejected: 'Rad etilgan',
};

function fmtSum(n: number) {
  return new Intl.NumberFormat('uz-UZ').format(n) + ' so\'m';
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function ReceiptThumb({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);

  if (failed || !url) {
    return (
      <div className="pay-receipt pay-receipt--missing">
        <Icon name="box" size={28} />
        <span>Chek fayli topilmadi</span>
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" className="cell-link" style={{ fontSize: '.78rem' }}>
            Havolani ochish
          </a>
        )}
      </div>
    );
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="pay-receipt">
      <img src={url} alt="Chek" onError={() => setFailed(true)} />
    </a>
  );
}

export default function PaymentReview({ requests, account }: { requests: ReqRow[]; account: Account }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function approve(id: string) {
    setBusy(id);
    const fd = new FormData();
    fd.set('requestId', id);
    const res = await approvePaymentRequestAction(null, fd);
    setBusy(null);
    if (res?.error) return toast(res.error, 'error');
    toast(res?.success ?? 'Tasdiqlandi.', 'success');
    router.refresh();
  }

  async function reject(id: string) {
    const reason = prompt('Rad etish sababi (ixtiyoriy):') ?? '';
    setBusy(id);
    const fd = new FormData();
    fd.set('requestId', id);
    fd.set('reason', reason);
    const res = await rejectPaymentRequestAction(null, fd);
    setBusy(null);
    if (res?.error) return toast(res.error, 'error');
    toast(res?.success ?? 'Rad etildi.', 'success');
    router.refresh();
  }

  async function saveAccount(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy('account');
    const res = await savePaymentAccountAction(null, new FormData(e.currentTarget));
    setBusy(null);
    if (res?.error) return toast(res.error, 'error');
    toast(res?.success ?? 'Saqlandi.', 'success');
    router.refresh();
  }

  const pending = requests.filter((r) => r.status === 'pending');
  const others = requests.filter((r) => r.status !== 'pending');

  return (
    <>
      {/* To'lov rekvizitlari */}
      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-head"><h2>To&apos;lov rekvizitlari</h2></div>
        <form onSubmit={saveAccount} className="form-grid" style={{ padding: '16px 24px' }}>
          <div className="form-row">
            <div className="auth-field"><label>Karta / hisob raqami</label><input name="paymentCardNumber" defaultValue={account.paymentCardNumber} placeholder="8600 1234 5678 9012" /></div>
            <div className="auth-field"><label>Karta egasi</label><input name="paymentCardHolder" defaultValue={account.paymentCardHolder} placeholder="F.I.SH" /></div>
          </div>
          <div className="auth-field"><label>Izoh (do&apos;konga ko&apos;rsatiladi)</label><input name="paymentNote" defaultValue={account.paymentNote} placeholder="To'lovdan keyin chekni yuklang" /></div>
          <button className="btn btn-primary btn-sm" disabled={busy === 'account'} style={{ alignSelf: 'flex-start' }}>
            {busy === 'account' ? 'Saqlanmoqda...' : 'Saqlash'}
          </button>
        </form>
      </div>

      {/* Kutilayotgan so'rovlar */}
      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-head">
          <h2>Tekshiruvdagi to&apos;lovlar</h2>
          <span className="count-chip">{pending.length} ta</span>
        </div>
        {pending.length === 0 ? (
          <div className="panel-empty"><p>Yangi to&apos;lov so&apos;rovi yo&apos;q.</p></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 20 }}>
            {pending.map((r) => (
              <div key={r.id} className="pay-card">
                <ReceiptThumb url={r.receiptUrl} />
                <div className="pay-body">
                  <div className="pay-top">
                    <strong>{r.orgName}</strong>
                    <span className="cell-sub">{r.orgSlug}</span>
                  </div>
                  <div className="pay-meta">
                    <span><b>{fmtSum(r.amount)}</b></span>
                    <span>{r.months} oy</span>
                    <span>To&apos;lov: {fmtDate(r.paidAt)}</span>
                    <span className="cell-sub">Yuborildi: {fmtDate(r.createdAt)}</span>
                  </div>
                  {r.note && <div className="cell-sub">Izoh: {r.note}</div>}
                  {r.flags.length > 0 && (
                    <div className="pay-flags">
                      {r.flags.map((f, i) => (
                        <span key={i} className="pay-flag"><Icon name="bell" size={12} /> {f}</span>
                      ))}
                    </div>
                  )}
                  <div className="pay-actions">
                    <button className="btn btn-primary btn-sm" disabled={busy === r.id} onClick={() => approve(r.id)}>
                      ✓ Tasdiqlash
                    </button>
                    <button className="btn btn-ghost btn-sm" disabled={busy === r.id} onClick={() => reject(r.id)}>
                      Rad etish
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tarix */}
      {others.length > 0 && (
        <div className="panel">
          <div className="panel-head"><h2>Tarix</h2></div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Do&apos;kon</th><th>Summa</th><th>Oy</th><th>Holat</th><th>Ko&apos;rib chiqdi</th></tr></thead>
              <tbody>
                {others.map((r) => (
                  <tr key={r.id}>
                    <td><div className="cell-main">{r.orgName}</div><div className="cell-sub">{r.orgSlug}</div></td>
                    <td>{fmtSum(r.amount)}</td>
                    <td>{r.months}</td>
                    <td><span className={`badge-status ${STATUS_BADGE[r.status]}`}>{STATUS_LABEL[r.status]}</span>{r.reviewNote ? <div className="cell-sub">{r.reviewNote}</div> : null}</td>
                    <td>{r.reviewedBy ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
