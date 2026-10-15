'use client';

import { useActionState } from 'react';
import { addImeiBlacklistAction, resolveImeiBlacklistAction } from '@/app/actions/imeiBlacklist';
import { useToastOnState } from '@/lib/useToastOnState';
import { fmtDate } from '@/lib/format';
import Icon from '@/components/icons/Icon';

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
      <button type="submit" className="btn btn-tinted btn-sm btn-with-icon" disabled={pending}>
        <Icon name="check" size={15} />
        {pending ? '...' : 'Hal qilindi'}
      </button>
    </form>
  );
}

export default function ImeiBlacklistManager({ rows }: { rows: OwnBlacklistRow[] }) {
  const [state, action, pending] = useActionState(addImeiBlacklistAction, null);
  useToastOnState(state);

  return (
    <div className="st-bl-grid">
      <section aria-labelledby="st-bl-add">
        <div className="st-ghead"><span id="st-bl-add">Qora ro&apos;yxatga qo&apos;shish</span></div>
        <form action={action} className="st-group st-bl-form">
          {state?.error && <div className="auth-alert auth-alert--error" role="alert">{state.error}</div>}
          <div className="auth-field">
            <label htmlFor="bl-imei">IMEI *</label>
            <input id="bl-imei" name="imei" type="text" required disabled={pending} placeholder="353456789012345" className="imei-input" inputMode="numeric" autoComplete="off" />
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
          <button type="submit" className="btn btn-danger btn-with-icon" disabled={pending}>
            <Icon name="alert" size={17} />
            {pending ? 'Qo\'shilmoqda...' : 'Qora ro\'yxatga qo\'shish'}
          </button>
        </form>
      </section>

      <section aria-labelledby="st-bl-mine">
        <div className="st-ghead">
          <span id="st-bl-mine">Mening qora ro&apos;yxatim</span>
          <strong>{rows.length} ta</strong>
        </div>
        <div className="st-group st-bl-list">
          {rows.length === 0 ? (
            <div className="ux-empty">
              <span className="ux-empty-ic"><Icon name="shield" size={24} /></span>
              <b>Hozircha bo&apos;sh</b>
              <p>Qarzdor yoki shubhali IMEI ni qo&apos;shsangiz, boshqa do&apos;konlar ham ogohlantiriladi.</p>            </div>
          ) : (
            rows.map((r) => (
              <div key={r.id} className="st-card">
                <div className="st-card-top">
                  <code className="st-mono">{r.imei}</code>
                  <span className="st-pill st-pill--sold">{r.reasonLabel}</span>
                </div>
                <div className="st-card-kv">
                  <span><em>Mijoz:</em>{r.customerName || '—'}{r.customerPhone ? ` · ${r.customerPhone}` : ''}</span>
                  {r.note && <span><em>Izoh:</em>{r.note}</span>}
                </div>
                <div className="st-card-foot">
                  <span>{r.createdAt ? fmtDate(r.createdAt) : '—'}</span>
                  <ResolveButton id={r.id} />
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
