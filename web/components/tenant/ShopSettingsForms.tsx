'use client';

import { useActionState, useState, useTransition } from 'react';
import { saveReceiptSettingsAction, saveCurrencySettingsAction, refreshCbuRateAction } from '@/app/actions/shopSettings';
import PriceInput from '@/components/ui/PriceInput';
import { toast } from '@/lib/toast';
import { tr } from '@/lib/i18n/fmt';
import type { ShopSettings } from '@/lib/shopSettings';
import { useToastOnState } from '@/lib/useToastOnState';
import { fmtMoney } from '@/lib/format';
import { useDict } from '@/lib/i18n/client';

/** Chek sozlamalari + jonli ko'rinish */
export function ReceiptSettingsForm({ initial, shop }: { initial: ShopSettings['receipt']; shop: { name: string; phone?: string } }) {
  const d = useDict();
  const k = d.shell.shopSettings;
  const r = d.sales.receipt;
  const [state, action, pending] = useActionState(saveReceiptSettingsAction, null);
  useToastOnState(state);
  const [v, setV] = useState(initial);
  const set = <K extends keyof typeof v>(key: K, val: (typeof v)[K]) => setV((p) => ({ ...p, [key]: val }));

  return (
    <div className="ss-split">
      <form action={action} className="ss-card ss-form">
        <div>
          <h2 className="ss-h">{k.receiptTitle}</h2>
          <p className="ss-hint">{k.receiptHint}</p>
        </div>
        <div className="auth-field">
          <label htmlFor="ss-header">{k.headerNote}</label>
          <input id="ss-header" name="headerNote" maxLength={120} value={v.headerNote ?? ''} onChange={(e) => set('headerNote', e.target.value)} placeholder={k.headerNotePh} autoComplete="off" />
        </div>
        <div className="auth-field">
          <label htmlFor="ss-footer">{k.footer}</label>
          <input id="ss-footer" name="footer" maxLength={160} value={v.footer ?? ''} onChange={(e) => set('footer', e.target.value)} placeholder={k.footerPh} autoComplete="off" />
        </div>
        <fieldset className="ss-field">
          <legend>{k.paperWidth}</legend>
          <div className="ss-seg">
            {([58, 80] as const).map((w) => (
              <label key={w} className={v.paperWidth === w ? 'is-on' : ''}>
                <input type="radio" name="paperWidth" value={w} checked={v.paperWidth === w} onChange={() => set('paperWidth', w)} />
                {w === 58 ? k.paper58 : k.paper80}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="ss-check">
          <input type="checkbox" name="showSeller" value="1" checked={v.showSeller} onChange={(e) => set('showSeller', e.target.checked)} />
          {k.showSeller}
        </label>
        <label className="ss-check">
          <input type="checkbox" name="showCustomer" value="1" checked={v.showCustomer} onChange={(e) => set('showCustomer', e.target.checked)} />
          {k.showCustomer}
        </label>
        <button type="submit" className="btn btn-primary" disabled={pending}>{k.save}</button>
      </form>

      <aside className="ss-preview" aria-label={k.preview}>
        <span className="ss-preview-l">{k.preview}</span>
        <div className={`ss-paper${v.paperWidth === 58 ? ' ss-paper--58' : ''}`}>
          <b className="ss-p-name">{shop.name}</b>
          {v.headerNote && <span className="ss-p-mut">{v.headerNote}</span>}
          {shop.phone && <span className="ss-p-mut">Tel: {shop.phone}</span>}
          <span className="ss-p-title">{r.title}</span>
          <hr />
          <div className="ss-p-row"><span>{r.no}</span><span>S-0001</span></div>
          {v.showSeller && <div className="ss-p-row"><span>{r.seller}</span><span>demo</span></div>}
          {v.showCustomer && <div className="ss-p-row"><span>{d.common.customer}</span><span>Aziz</span></div>}
          <hr />
          <div className="ss-p-row"><b>{k.sampleItem}</b><b>{fmtMoney(150000)}</b></div>
          <hr />
          <div className="ss-p-row ss-p-total"><span>{r.total}</span><b>{fmtMoney(150000)} {d.common.sum}</b></div>
          <hr />
          <b className="ss-p-foot">{v.footer || r.thanks}</b>
        </div>
      </aside>
    </div>
  );
}

/** Dollar kursi: Markaziy bank yoki qo'lda */
export function CurrencySettingsForm({ initial, cbu, active }: {
  initial: { rateMode: 'cbu' | 'manual'; manualRate?: number };
  cbu: { rate?: number; date?: string };
  active: number | null;
}) {
  const d = useDict();
  const k = d.shell.shopSettings;
  const [state, action, pending] = useActionState(saveCurrencySettingsAction, null);
  useToastOnState(state);
  const [mode, setMode] = useState(initial.rateMode);
  const [manual, setManual] = useState(initial.manualRate ? String(Math.round(initial.manualRate)) : '');
  const [refreshing, startRefresh] = useTransition();

  function refresh() {
    startRefresh(async () => {
      const res = await refreshCbuRateAction();
      if (res?.success) toast(res.success, 'success');
      else if (res?.error) toast(res.error, 'error');
    });
  }

  return (
    <div className="ss-split">
      <form action={action} className="ss-card ss-form">
        <div>
          <h2 className="ss-h">{k.currencyTitle}</h2>
          <p className="ss-hint">{k.currencyHint}</p>
        </div>
        <div className="ss-seg">
          {(['cbu', 'manual'] as const).map((m) => (
            <label key={m} className={mode === m ? 'is-on' : ''}>
              <input type="radio" name="rateMode" value={m} checked={mode === m} onChange={() => setMode(m)} />
              {m === 'cbu' ? k.modeCbu : k.modeManual}
            </label>
          ))}
        </div>
        <div className="ss-rate">
          <span>{k.cbuNow}</span>
          {cbu.rate ? (
            <b>1 $ = {fmtMoney(Math.round(cbu.rate))} {d.common.sum} <small>{cbu.date ? tr(k.cbuOf, { date: cbu.date.split('-').reverse().join('.') }) : ''}</small></b>
          ) : <b className="ss-muted">{k.cbuNone}</b>}
          <button type="button" className="btn btn-sm btn-ghost" onClick={refresh} disabled={refreshing}>{k.refresh}</button>
        </div>
        {mode === 'manual' && (
          <div className="auth-field">
            <label htmlFor="ss-rate">{k.manualRate}</label>
            <PriceInput id="ss-rate" name="manualRate" value={manual} onValueChange={setManual} placeholder={k.manualRatePh} required />
          </div>
        )}
        {mode === 'cbu' && manual && <input type="hidden" name="manualRate" value={manual} />}
        <button type="submit" className="btn btn-primary" disabled={pending}>{k.save}</button>
      </form>

      <aside className="ss-card ss-active">
        <span className="ss-preview-l">{k.activeRate}</span>
        <b>{active ? <>1 $ = {fmtMoney(Math.round(active))} <small>{d.common.sum}</small></> : '—'}</b>
        <small>{mode === 'manual' ? k.modeManual : k.modeCbu}</small>
      </aside>
    </div>
  );
}
