'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateUserPermissionsAction } from '@/app/actions/permissions';
import { toast } from '@/lib/toast';
import Icon from '@/components/icons/Icon';
import type { OrgFeatures } from '@/lib/featureKeys';
import type { PermissionKey } from '@/lib/permissions';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import PermissionPages, { ASSIGNABLE_KEYS } from './PermissionPages';
import '@/components/tenant/styles/admin.css';

/** Filial login huquqlari — sahifalar bo'yicha guruhlangan switch'lar (iOS Sozlamalar uslubi) */
export default function PermissionEditor({
  userId,
  name,
  initial,
  isDefault,
  features,
  onDone,
  roles = [],
  initialRoleId,
}: {
  userId: string;
  name: string;
  initial: PermissionKey[];
  isDefault: boolean;
  features: OrgFeatures;
  onDone: () => void;
  /** Rol shablonlari (/app/roles) — tanlansa huquqlar roldan olinadi */
  roles?: { id: string; name: string; permissions: string[] }[];
  initialRoleId?: string;
}) {
  const router = useRouter();
  const d = useDict();
  const P = d.crm.team.perm;
  const [checked, setChecked] = useState<Set<PermissionKey>>(new Set(initial));
  const [roleId, setRoleId] = useState(initialRoleId ?? '');
  const role = roles.find((r) => r.id === roleId);
  const R = d.crm.team.roles;

  function pickRole(id: string) {
    setRoleId(id);
    const r = roles.find((x) => x.id === id);
    if (r) setChecked(new Set(r.permissions as PermissionKey[]));
  }
  const [busy, setBusy] = useState(false);

  async function submit(reset: boolean) {
    setBusy(true);
    const fd = new FormData();
    fd.set('userId', userId);
    if (roleId && !reset) fd.set('roleId', roleId);
    if (reset) fd.set('reset', '1');
    for (const k of checked) fd.append('perm', k);
    const res = await updateUserPermissionsAction(null, fd);
    setBusy(false);
    if (res?.error) { toast(res.error, 'error'); return; }
    toast(res?.success ?? d.common.saved, 'success');
    onDone();
    router.refresh();
  }

  const onCount = ASSIGNABLE_KEYS.filter((k) => checked.has(k)).length;

  return (
    <div className="ad-perm">
      <div className="ad-perm-intro">
        <p>
          <strong>{name}</strong> — {isDefault ? P.introDefault : P.introCustom}
          {' '}{P.introNote}
        </p>
        <div className="ad-perm-count" aria-live="polite">
          <b>{onCount}/{ASSIGNABLE_KEYS.length}</b>
          <small>{P.enabled}</small>
        </div>
      </div>

      {roles.length > 0 && (
        <div className="auth-field ad-role-pick">
          <label htmlFor="perm-role">{R.roleLabel}</label>
          <select id="perm-role" value={roleId} onChange={(e) => pickRole(e.target.value)} disabled={busy}>
            <option value="">{R.custom}</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          {role && <span className="field-hint">{tr(R.fromRole, { name: role.name })}</span>}
        </div>
      )}

      <PermissionPages
        checked={checked}
        onChange={setChecked}
        features={features}
        disabled={busy || !!role}
        idPrefix="perm"
        showStandard
      />

      <div className="ad-perm-foot">
        <button
          type="button"
          className="btn btn-plain btn-sm btn-with-icon ad-perm-reset"
          onClick={() => submit(true)}
          disabled={busy}
        >
          <Icon name="repeat" size={15} /> {P.resetToDefault}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDone} disabled={busy}>
          {d.common.cancel}
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => submit(false)} disabled={busy}>
          {busy ? d.common.saving : d.common.save}
        </button>
      </div>
    </div>
  );
}
