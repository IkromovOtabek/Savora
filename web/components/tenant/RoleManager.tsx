'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveRoleAction, deleteRoleAction } from '@/app/actions/roles';
import { toast } from '@/lib/toast';
import Icon from '@/components/icons/Icon';
import type { OrgFeatures } from '@/lib/featureKeys';
import type { PermissionKey } from '@/lib/permissions';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import PermissionPages from './PermissionPages';
import '@/components/tenant/styles/admin.css';

interface RoleRow { id: string; name: string; permissions: string[]; users: number }

/** Rollar ro'yxati + tahrirlagich (nom va sahifalar bo'yicha huquq switch'lari) */
export default function RoleManager({ roles, features }: { roles: RoleRow[]; features: OrgFeatures }) {
  const d = useDict();
  const r = d.crm.team.roles;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [edit, setEdit] = useState<{ id?: string; name: string; perms: Set<PermissionKey> } | null>(null);

  function open(row?: RoleRow) {
    setEdit(row ? { id: row.id, name: row.name, perms: new Set(row.permissions as PermissionKey[]) } : { name: '', perms: new Set() });
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
          <PermissionPages
            checked={edit.perms}
            onChange={(perms) => setEdit((e) => (e ? { ...e, perms } : e))}
            features={features}
            disabled={pending}
            idPrefix="rl"
          />
          <div className="rl-foot">
            <button type="button" className="btn btn-ghost" onClick={() => setEdit(null)} disabled={pending}>{r.cancel}</button>
            <button type="button" className="btn btn-primary" onClick={save} disabled={pending || !edit.name.trim()}>{r.save}</button>
          </div>
        </section>
      )}
    </div>
  );
}
