'use client';

import { useActionState } from 'react';
import { addImeiBlacklistAction, resolveImeiBlacklistAction } from '@/app/actions/imeiBlacklist';
import { useToastOnState } from '@/lib/useToastOnState';
import { fmtDate } from '@/lib/format';

export interface OwnBlacklistRow {
  id: string;
  imei: string;
  reasonLabel: string;
  customerName?: string;
  customerPhone?: string;
  note?: string;
  createdAt: string;
}

function ResolveButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState(resolveImeiBlacklistAction, null);
  useToastOnState(state);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="btn btn-ghost btn-sm" disabled={pending}>
        {pending ? '...' : 'Hal qilindi'}
      </button>
    </form>
  );
}

export default function ImeiBlacklistManager({ rows }: { rows: OwnBlacklistRow[] }) {
  const [state, action, pending] = useActionState(addImeiBlacklistAction, null);
  useToastOnState(state);

  return (
    <>
      <div className="panel" style={{ marginTop: 20 }}>
        <div className="panel-head"><h2>Qora ro&apos;yxatga qo&apos;shish</h2></div>
        <form action={action} className="form-grid" style={{ padding: '16px 24px' }}>
          {state?.error && <div className="auth-alert auth-alert--error">{state.error}</div>}
          <div className="form-row">
            <div className="auth-field">
              <label htmlFor="bl-imei">IMEI *</label>
              <input id="bl-imei" name="imei" type="text" required disabled={pending} placeholder="353456789012345" />
            </div>
            <div className="auth-field">
              <label htmlFor="bl-reason">Sabab</label>
              <select id="bl-reason" name="reason" disabled={pending} defaultValue="debt">
                <option value="debt">Qarzdorlik</option>
                <option value="fraud">Firibgarlik</option>
                <option value="stolen">O&apos;g&apos;irlangan</option>
                <option value="other">Boshqa</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="auth-field">
              <label htmlFor="bl-name">Mijoz ismi</label>
              <input id="bl-name" name="customerName" type="text" disabled={pending} />
            </div>
            <div className="auth-field">
              <label htmlFor="bl-phone">Telefon</label>
              <input id="bl-phone" name="customerPhone" type="tel" disabled={pending} placeholder="+998..." />
            </div>
          </div>
          <div className="auth-field">
            <label htmlFor="bl-note">Izoh</label>
            <input id="bl-note" name="note" type="text" disabled={pending} maxLength={400} placeholder="Masalan: 3 oydan beri to'lamayapti" />
          </div>
          <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
            {pending ? 'Qo\'shilmoqda...' : 'Qora ro\'yxatga qo\'shish'}
          </button>
        </form>
      </div>

      <div className="panel" style={{ marginTop: 20 }}>
        <div className="panel-head"><h2>Mening qora ro&apos;yxatim ({rows.length})</h2></div>
        {rows.length === 0 ? (
          <div className="panel-empty"><p>Hozircha bo&apos;sh.</p></div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>IMEI</th><th>Sabab</th><th>Mijoz</th><th>Izoh</th><th>Sana</th><th></th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td><code className="imei-code">{r.imei}</code></td>
                    <td><span className="badge-status badge-status--expired">{r.reasonLabel}</span></td>
                    <td>{r.customerName || '—'}{r.customerPhone ? ` · ${r.customerPhone}` : ''}</td>
                    <td>{r.note || '—'}</td>
                    <td>{r.createdAt ? fmtDate(r.createdAt) : '—'}</td>
                    <td><ResolveButton id={r.id} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
