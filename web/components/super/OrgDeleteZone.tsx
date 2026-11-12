'use client';

import { useActionState, useState } from 'react';
import { deleteOrganizationAction } from '@/app/actions/orgAdmin';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import { Alert } from './ui';

/**
 * Super Admin — do'konni butunlay o'chirish («xavfli zona»).
 * Tugma faqat do'kon manzili aynan yozilganda va parol kiritilganda faollashadi.
 */
export default function OrgDeleteZone({ orgId, slug }: { orgId: string; slug: string }) {
  const d = useDict();
  const t = d.superPanel.orgDelete;
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [pass, setPass] = useState('');
  const [state, formAction, isPending] = useActionState(deleteOrganizationAction, null);
  const ready = typed.trim().toLowerCase() === slug && pass.length > 0;

  return (
    <div className="sa-form">
      <p className="sa-danger-lead">{t.lead}</p>
      <p className="sa-hint">{t.keeps}</p>

      {!open ? (
        <div className="sa-form-actions">
          <button type="button" className="sa-btn sa-btn--danger" onClick={() => setOpen(true)}>{t.open}</button>
        </div>
      ) : (
        <form action={formAction} className="sa-form">
          <input type="hidden" name="orgId" value={orgId} />
          {state?.error && <Alert tone="error">{state.error}</Alert>}
          <div className="sa-grid-2">
            <div className="sa-field">
              <label htmlFor="del-slug">{tr(t.slugLabel, { slug })}</label>
              <input
                id="del-slug"
                name="confirmSlug"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder={slug}
                disabled={isPending}
              />
            </div>
            <div className="sa-field">
              <label htmlFor="del-pass">{t.passwordLabel}</label>
              <input
                id="del-pass"
                name="password"
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                autoComplete="current-password"
                disabled={isPending}
              />
            </div>
          </div>
          <div className="sa-form-actions">
            <button type="submit" className="sa-btn sa-btn--danger sa-btn--strong" disabled={!ready || isPending}>
              {isPending ? t.deleting : t.submit}
            </button>
            <button
              type="button"
              className="sa-btn sa-btn--gray"
              onClick={() => { setOpen(false); setTyped(''); setPass(''); }}
              disabled={isPending}
            >
              {t.cancel}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
