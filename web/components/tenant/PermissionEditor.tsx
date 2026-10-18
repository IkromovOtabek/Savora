'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateUserPermissionsAction } from '@/app/actions/permissions';
import { toast } from '@/lib/toast';
import Icon, { type IconName } from '@/components/icons/Icon';
import type { OrgFeatures } from '@/lib/featureKeys';
import {
  PERMISSION_KEYS,
  PERMISSIONS,
  ROLE_DEFAULT_PERMISSIONS,
  type PermissionGroup,
  type PermissionKey,
} from '@/lib/permissions';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import '@/components/tenant/styles/admin.css';

const GROUPS: readonly PermissionGroup[] = ['savdo', 'ombor', 'moliya', 'boshqaruv'];

const GROUP_ICONS: Record<PermissionGroup, { icon: IconName; tone: string }> = {
  savdo: { icon: 'cart', tone: '' },
  ombor: { icon: 'box', tone: ' ad-sq--ok' },
  moliya: { icon: 'wallet', tone: ' ad-sq--gold' },
  boshqaruv: { icon: 'settings', tone: ' ad-sq--muted' },
};

/** Filial login huquqlari — iOS Sozlamalar uslubidagi guruhlangan switch'lar */
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

  function toggle(key: PermissionKey) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

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

  const assignable = PERMISSION_KEYS.filter((k) => !PERMISSIONS[k].adminOnly);
  const onCount = assignable.filter((k) => checked.has(k)).length;

  return (
    <div className="ad-perm">
      <div className="ad-perm-intro">
        <p>
          <strong>{name}</strong> — {isDefault ? P.introDefault : P.introCustom}
          {' '}{P.introNote}
        </p>
        <div className="ad-perm-count" aria-live="polite">
          <b>{onCount}/{assignable.length}</b>
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

      <div className="ad-perm-groups">
        {GROUPS.map((g) => {
          const keys = PERMISSION_KEYS.filter((k) => PERMISSIONS[k].group === g);
          if (keys.length === 0) return null;
          const groupOn = keys.filter((k) => !PERMISSIONS[k].adminOnly && checked.has(k)).length;
          const groupTotal = keys.filter((k) => !PERMISSIONS[k].adminOnly).length;
          const gi = GROUP_ICONS[g];
          return (
            <section key={g} aria-labelledby={`perm-g-${g}`}>
              <div className="ad-sec-head">
                <h2 id={`perm-g-${g}`}>{d.catalog.permissionGroups[g]}</h2>
                <span>{groupOn}/{groupTotal}</span>
              </div>
              <div className="ad-group">
                {keys.map((k) => {
                  const p = PERMISSIONS[k];
                  const featureOff = p.feature ? !features[p.feature] : false;
                  const isStd = !p.adminOnly && ROLE_DEFAULT_PERMISSIONS.user.includes(k);
                  const id = `perm-${k.replace('.', '-')}`;
                  return (
                    <label
                      key={k}
                      htmlFor={id}
                      className={`ad-cell ad-perm-row${p.adminOnly ? ' ad-perm-row--locked' : ''}`}
                    >
                      <span className={`ad-sq${p.adminOnly ? ' ad-sq--muted' : gi.tone}`} aria-hidden="true">
                        <Icon name={p.adminOnly ? 'lock' : gi.icon} size={16} />
                      </span>
                      <span className="ad-cell-t">
                        <b>
                          {d.catalog.permissions[k].label}
                          <span className="ad-perm-tags">
                            {isStd && <span className="ad-pill">{P.standardTag}</span>}
                            {featureOff && <span className="ad-pill ad-pill--warn">{P.moduleOff}</span>}
                          </span>
                        </b>
                        <small>{p.adminOnly ? P.adminOnly : d.catalog.permissions[k].description}</small>
                      </span>
                      <input
                        id={id}
                        className="ad-switch"
                        type="checkbox"
                        role="switch"
                        checked={p.adminOnly ? false : checked.has(k)}
                        onChange={() => toggle(k)}
                        disabled={busy || p.adminOnly || !!role}
                      />
                    </label>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

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
