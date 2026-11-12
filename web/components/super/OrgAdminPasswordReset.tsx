'use client';

import { useState, useTransition } from 'react';
import { resetOrgAdminPasswordAction } from '@/app/actions/organizations';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import { Alert, Sq } from './ui';
import CopyButton from './CopyButton';

/**
 * Super Admin — do'kon adminiga yangi vaqtinchalik parol berish. Formaning ichida
 * turadi (OrgEditForm), shuning uchun alohida <form> emas — server action to'g'ridan-to'g'ri chaqiriladi.
 * Parol faqat shu komponent holatida bir marta ko'rinadi.
 */
export default function OrgAdminPasswordReset({ orgId, username }: { orgId: string; username: string }) {
  const d = useDict();
  const s = d.superPanel.orgEdit;
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ error?: string; username?: string; password?: string } | null>(null);

  function onReset() {
    if (!window.confirm(tr(s.resetConfirm, { login: username || '—' }))) return;
    startTransition(async () => {
      try {
        setResult(await resetOrgAdminPasswordAction(orgId));
      } catch {
        setResult({ error: s.resetFailed });
      }
    });
  }

  return (
    <>
      <div className="sa-cell sa-cell--ic">
        <Sq icon="key" tone="o" />
        <span className="sa-cell-t"><b>{s.tempPassword}</b></span>
        {result?.password ? (
          <>
            <code className="sa-code" style={{ userSelect: 'all' }}>{result.password}</code>
            <CopyButton text={result.password} label={s.tempPassword} />
          </>
        ) : (
          <button type="button" className="sa-btn sa-btn--sm" onClick={onReset} disabled={isPending}>
            {isPending ? s.resetting : s.resetBtn}
          </button>
        )}
      </div>
      {result?.password && (
        <div style={{ padding: '0 12px 12px' }}>
          <Alert tone="warn">{s.resetDone}</Alert>
        </div>
      )}
      {result?.error && (
        <div style={{ padding: '0 12px 12px' }}>
          <Alert tone="error">{result.error}</Alert>
        </div>
      )}
    </>
  );
}
