'use client';

import { useActionState } from 'react';
import { addImeiBlacklistAction, resolveImeiBlacklistAction } from '@/app/actions/imeiBlacklist';
import { useToastOnState } from '@/lib/useToastOnState';
import { fmtDate } from '@/lib/format';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import type { BlacklistReason } from '@/lib/models/master/ImeiBlacklist';

const REASONS: BlacklistReason[] = ['debt', 'fraud', 'stolen', 'other'];

export interface OwnBlacklistRow {
  id: string;
  imei: string;
  reason: BlacklistReason;
  customerName?: string;
  customerPhone?: string;
  note?: string;
  createdAt: string;
}

function ResolveButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState(resolveImeiBlacklistAction, null);
  useToastOnState(state);
  const t = useDict().stock.blacklist;
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="btn btn-tinted btn-sm btn-with-icon" disabled={pending}>
        <Icon name="check" size={15} />
        {pending ? '...' : t.resolved}
      </button>
    </form>
  );
}

export default function ImeiBlacklistManager({ rows }: { rows: OwnBlacklistRow[] }) {
  const [state, action, pending] = useActionState(addImeiBlacklistAction, null);
  useToastOnState(state);
  const d = useDict();
  const t = d.stock.blacklist;

  return (
    <div className="st-bl-grid">
      <section aria-labelledby="st-bl-add">
        <div className="st-ghead"><span id="st-bl-add">{t.addTitle}</span></div>
        <form action={action} className="st-group st-bl-form">
          {state?.error && <div className="auth-alert auth-alert--error" role="alert">{state.error}</div>}
          <div className="auth-field">
            <label htmlFor="bl-imei">{d.stock.form.imeiLabel}</label>
            <input id="bl-imei" name="imei" type="text" required disabled={pending} placeholder="353456789012345" className="imei-input" inputMode="numeric" autoComplete="off" />
          </div>
          <div className="auth-field">
            <label htmlFor="bl-reason">{t.reason}</label>
            <select id="bl-reason" name="reason" disabled={pending} defaultValue="debt">
              {REASONS.map((r) => (
                <option key={r} value={r}>{d.stock.blacklistReasons[r]}</option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <div className="auth-field">
              <label htmlFor="bl-name">{t.customerName}</label>
              <input id="bl-name" name="customerName" type="text" disabled={pending} />
            </div>
            <div className="auth-field">
              <label htmlFor="bl-phone">{d.common.phone}</label>
              <input id="bl-phone" name="customerPhone" type="tel" disabled={pending} placeholder="+998..." />
            </div>
          </div>
          <div className="auth-field">
            <label htmlFor="bl-note">{d.common.note}</label>
            <input id="bl-note" name="note" type="text" disabled={pending} maxLength={400} placeholder={t.notePlaceholder} />
          </div>
          <button type="submit" className="btn btn-danger btn-with-icon" disabled={pending}>
            <Icon name="alert" size={17} />
            {pending ? t.adding : t.addTitle}
          </button>
        </form>
      </section>

      <section aria-labelledby="st-bl-mine">
        <div className="st-ghead">
          <span id="st-bl-mine">{t.mineTitle}</span>
          <strong>{tr(d.common.nPcs, { n: rows.length })}</strong>
        </div>
        <div className="st-group st-bl-list">
          {rows.length === 0 ? (
            <div className="ux-empty">
              <span className="ux-empty-ic"><Icon name="shield" size={24} /></span>
              <b>{t.emptyTitle}</b>
              <p>{t.emptyHint}</p>
            </div>
          ) : (
            rows.map((r) => (
              <div key={r.id} className="st-card">
                <div className="st-card-top">
                  <code className="st-mono">{r.imei}</code>
                  <span className="st-pill st-pill--sold">{d.stock.blacklistReasons[r.reason]}</span>
                </div>
                <div className="st-card-kv">
                  <span><em>{d.stock.bulk.customer}</em>{r.customerName || '—'}{r.customerPhone ? ` · ${r.customerPhone}` : ''}</span>
                  {r.note && <span><em>{d.stock.bulk.note}</em>{r.note}</span>}
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
