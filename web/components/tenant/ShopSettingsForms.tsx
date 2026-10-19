'use client';

import { useActionState, useState } from 'react';
import { saveReceiptSettingsAction } from '@/app/actions/shopSettings';
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
