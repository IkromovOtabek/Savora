'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { saveEcomSettingsAction } from '@/app/actions/ecom';
import { useToastOnState } from '@/lib/useToastOnState';
import { useDict } from '@/lib/i18n/client';

/** Do'kon sozlamalari → E-commerce: avtomatik chiqarish kaliti + xaridor uchun shartlar */
export default function EcomSettingsForm({ initial, slug }: { initial: { autoPublish: boolean; note?: string }; slug: string }) {
  const d = useDict();
  const k = d.ecom.settings;
  const [state, action, pending] = useActionState(saveEcomSettingsAction, null);
  useToastOnState(state);
  const [auto, setAuto] = useState(initial.autoPublish);

  return (
    <form action={action} className="ss-card ss-form" style={{ maxWidth: 720 }}>
      <div>
        <h2 className="ss-h">{k.title}</h2>
        <p className="ss-hint">{k.hint}</p>
      </div>
      <input type="hidden" name="autoPublish" value={auto ? '1' : '0'} />
      <label className="ec-setting">
        <span>
          <b>{k.autoPublish}</b>
          <small>{auto ? k.autoOn : k.autoOff}</small>
        </span>
        <span className="ec-switch">
          <input type="checkbox" role="switch" checked={auto} onChange={(e) => setAuto(e.target.checked)} aria-label={k.autoPublish} />
          <i aria-hidden />
        </span>
      </label>
      <div className="auth-field">
        <label htmlFor="ec-note">{k.note}</label>
        <textarea id="ec-note" name="note" maxLength={300} defaultValue={initial.note ?? ''} placeholder={k.notePh} rows={3} />
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="submit" className="btn btn-primary" disabled={pending}>{k.save}</button>
        <Link href="/app/ecom" className="btn btn-ghost">{k.manage}</Link>
        <a href={`/market/s/${slug}`} target="_blank" rel="noopener" className="btn btn-ghost">{k.openMarket}</a>
      </div>
    </form>
  );
}
