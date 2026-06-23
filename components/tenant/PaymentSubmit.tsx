'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { submitPaymentRequestAction } from '@/app/actions/payments';
import { resolvePublicFileUrl } from '@/lib/fileUrl';
import { toast } from '@/lib/toast';
import Icon from '@/components/icons/Icon';
import PriceInput from '@/components/ui/PriceInput';

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

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Kutilmoqda', cls: 'badge-status--suspended' },
  approved: { label: 'Tasdiqlangan', cls: 'badge-status--active' },
  rejected: { label: 'Rad etilgan', cls: 'badge-status--expired' },
};

function fmtSum(n: number) {
  return new Intl.NumberFormat('uz-UZ').format(n) + ' so\'m';
}

export default function PaymentSubmit({ account, monthlyPrice, requests }: Props) {
  const router = useRouter();
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
      if (!res.ok) throw new Error(data.error || 'Yuklashda xatolik');
      setReceiptUrl(resolvePublicFileUrl(data.url));
      toast('Chek yuklandi', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Yuklashda xatolik', 'error');
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!receiptUrl) return toast('Avval chekni yuklang', 'error');
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    fd.set('receiptUrl', receiptUrl);
    fd.set('months', String(months));
    const res = await submitPaymentRequestAction(null, fd);
    setBusy(false);
    if (res?.error) return toast(res.error, 'error');
    toast(res?.success ?? 'Yuborildi.', 'success');
    setReceiptUrl('');
    router.refresh();
  }

  const pending = requests.find((r) => r.status === 'pending');

  return (
    <div className="panel" id="obuna-tolovi" style={{ marginTop: 20, scrollMarginTop: 80 }}>
      <div className="panel-head"><h2>Obuna to&apos;lovi</h2></div>
      <div className="detail-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!hasAccount ? (
          <p className="dash-sub" style={{ margin: 0 }}>
            To&apos;lov rekvizitlari hali kiritilmagan. Platforma egasiga murojaat qiling.
          </p>
        ) : (
          <>
            <div className="pay-account">
              <div className="cell-sub">Quyidagi hisobga o&apos;tkazing:</div>
              <div className="pay-account-card">
                <strong>{account.paymentCardNumber}</strong>
                {account.paymentCardHolder && <span>{account.paymentCardHolder}</span>}
              </div>
              {account.paymentNote && <div className="cell-sub">{account.paymentNote}</div>}
            </div>

            {pending ? (
              <div className="auth-alert auth-alert--info" style={{ margin: 0 }}>
                To&apos;lov so&apos;rovingiz tekshirilmoqda ({fmtSum(pending.amount)} · {pending.months} oy).
                Tasdiqlangach obuna avtomatik uzayadi.
              </div>
            ) : (
              <form onSubmit={submit} className="form-grid">
                <div className="form-row">
                  <div className="auth-field">
                    <label>Necha oyga? *</label>
                    <input
                      type="number" min={1} max={24} value={months} disabled={busy}
                      onChange={(e) => setMonths(Math.min(24, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                    />
                    <span className="field-hint">{monthlyPrice > 0 ? `${months} oy × ${fmtSum(monthlyPrice)}` : '1–24 oy'}</span>
                  </div>
                  <div className="auth-field">
                    <label>To&apos;lov summasi *</label>
                    <PriceInput key={months} name="amount" required defaultValue={amount} disabled={busy} />
                  </div>
                </div>
                <div className="auth-field">
                  <label>To&apos;lov sanasi *</label>
                  <input name="paidAt" type="date" required disabled={busy} defaultValue={new Date().toISOString().slice(0, 10)} />
                </div>
                <div className="auth-field">
                  <label>Chek / screenshot *</label>
                  <input type="file" accept="image/*" onChange={onFile} disabled={uploading || busy} />
                  {uploading && <span className="field-hint">Yuklanmoqda...</span>}
                  {receiptUrl && (
                    <a href={receiptUrl} target="_blank" rel="noopener noreferrer" className="cell-link" style={{ fontSize: '.85rem' }}>
                      <Icon name="check" size={13} /> Chek yuklandi — ko&apos;rish
                    </a>
                  )}
                </div>
                <div className="auth-field">
                  <label>Izoh (ixtiyoriy)</label>
                  <input name="note" disabled={busy} />
                </div>
                <button className="btn btn-primary" disabled={busy || uploading || !receiptUrl} style={{ alignSelf: 'flex-start' }}>
                  {busy ? 'Yuborilmoqda...' : 'To\'lovni yuborish'}
                </button>
              </form>
            )}
          </>
        )}

        {requests.length > 0 && (
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table className="data-table">
              <thead><tr><th>Sana</th><th>Summa</th><th>Oy</th><th>Holat</th></tr></thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.createdAt).toLocaleDateString('uz-UZ')}</td>
                    <td>{fmtSum(r.amount)}</td>
                    <td>{r.months}</td>
                    <td>
                      <span className={`badge-status ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
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
