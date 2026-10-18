'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveRoleAction, deleteRoleAction } from '@/app/actions/roles';
import { toast } from '@/lib/toast';
import Icon from '@/components/icons/Icon';
import type { OrgFeatures } from '@/lib/featureKeys';
import { PERMISSION_KEYS, PERMISSIONS, type PermissionGroup, type PermissionKey } from '@/lib/permissions';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import '@/components/tenant/styles/admin.css';

const GROUPS: readonly PermissionGroup[] = ['savdo', 'ombor', 'moliya', 'boshqaruv'];
const ASSIGNABLE = PERMISSION_KEYS.filter((k) => !PERMISSIONS[k].adminOnly);

interface RoleRow { id: string; name: string; permissions: string[]; users: number }

/** Rollar ro'yxati + tahrirlagich (nom va guruhlangan huquq switch'lari) */
export default function RoleManager({ roles, features }: { roles: RoleRow[]; features: OrgFeatures }) {
  const d = useDict();
  const r = d.crm.team.roles;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [edit, setEdit] = useState<{ id?: string; name: string; perms: Set<PermissionKey> } | null>(null);

  function open(row?: RoleRow) {
    setEdit(row ? { id: row.id, name: row.name, perms: new Set(row.permissions as PermissionKey[]) } : { name: '', perms: new Set() });
  }
  function toggle(k: PermissionKey) {
    setEdit((e) => {
      if (!e) return e;
      const next = new Set(e.perms);
      if (next.has(k)) next.delete(k); else next.add(k);
      return { ...e, perms: next };
    });
  }
  function save() {
    if (!edit) return;
    start(async () => {
      const res = await saveRoleAction({ id: edit.id, name: edit.name, permissions: [...edit.perms] });
      if (res?.success) { toast(res.success, 'success'); setEdit(null); router.refresh(); }
      else if (res?.error) toast(res.error, 'error');
    });
  }
  function remove(row: RoleRow) {
    if (!window.confirm(r.confirmDelete)) return;
    start(async () => {
      const res = await deleteRoleAction(row.id);
      if (res?.success) { toast(res.success, 'success'); if (edit?.id === row.id) setEdit(null); router.refresh(); }
      else if (res?.error) toast(res.error, 'error');
    });
  }

  return (
    <div className="rl-wrap">
      <ul className="rl-list">
        {roles.map((row) => (
          <li key={row.id} className={`rl-card${edit?.id === row.id ? ' is-on' : ''}`}>
            <span className="rl-ic" aria-hidden="true"><Icon name="shield" size={18} /></span>
            <span className="rl-t">
              <b>{row.name}</b>
              <small>{tr(r.nPerms, { n: row.permissions.length })} · {tr(r.nUsers, { n: row.users })}</small>
            </span>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => open(row)}>{r.edit}</button>
            <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(row)} aria-label={`${r.remove}: ${row.name}`} disabled={pending}>
              <Icon name="trash" size={14} />
            </button>
          </li>
        ))}
        <li>
          <button type="button" className="rl-new" onClick={() => open()}><Icon name="plus" size={16} />{r.newRole}</button>
        </li>
      </ul>

      {edit && (
        <section className="rl-editor" aria-label={edit.id ? edit.name : r.newRole}>
          <div className="auth-field">
            <label htmlFor="rl-name">{r.name}</label>
            <input id="rl-name" value={edit.name} maxLength={40} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoComplete="off" />
          </div>
          <div className="ad-perm-groups">
            {GROUPS.map((g) => {
              const keys = ASSIGNABLE.filter((k) => PERMISSIONS[k].group === g);
              if (!keys.length) return null;
              return (
                <section key={g} aria-labelledby={`rl-g-${g}`}>
                  <div className="ad-sec-head">
                    <h2 id={`rl-g-${g}`}>{d.catalog.permissionGroups[g]}</h2>
                    <span>{keys.filter((k) => edit.perms.has(k)).length}/{keys.length}</span>
                  </div>
                  <div className="ad-group">
                    {keys.map((k) => {
                      const p = PERMISSIONS[k];
                      const off = p.feature ? !features[p.feature] : false;
                      const id = `rl-${k.replace('.', '-')}`;
                      return (
                        <label key={k} htmlFor={id} className="ad-cell ad-perm-row">
                          <span className="ad-cell-t">
                            <b>{d.catalog.permissions[k].label}{off && <span className="ad-pill ad-pill--warn">{d.crm.team.perm.moduleOff}</span>}</b>
                            <small>{d.catalog.permissions[k].description}</small>
                          </span>
                          <input id={id} className="ad-switch" type="checkbox" role="switch" checked={edit.perms.has(k)} onChange={() => toggle(k)} disabled={pending} />
                        </label>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
          <div className="rl-foot">
            <button type="button" className="btn btn-ghost" onClick={() => setEdit(null)} disabled={pending}>{r.cancel}</button>
            <button type="button" className="btn btn-primary" onClick={save} disabled={pending || !edit.name.trim()}>{r.save}</button>
          </div>
        </section>
      )}
    </div>
  );
}
