'use client';

import { useActionState } from 'react';
import { superUpdateOrgPermissionsAction } from '@/app/actions/permissions';
import type { OrgFeatures } from '@/lib/featureKeys';
import {
  PERMISSION_PAGE_DEFS,
  PERMISSION_PAGES,
  PERMISSIONS,
  permissionsOfPage,
  type PermissionKey,
} from '@/lib/permissions';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import { Alert } from './ui';

export interface MatrixUser {
  id: string;
  username: string;
  name: string;
  role: 'admin' | 'user';
  active: boolean;
  isDefault: boolean;
  /** Biriktirilgan rol nomi (bo'lsa — huquqlar roldan) */
  roleName?: string;
  permissions: PermissionKey[];
}

// Filialga beriladigan sahifalar — amallari bilan; faqat egasiga xos sahifalar — bitta qulflangan qatorda
const ASSIGNABLE_PAGES = PERMISSION_PAGES.filter((p) => !PERMISSION_PAGE_DEFS[p].ownerOnly);
const OWNER_PAGES = PERMISSION_PAGES.filter((p) => PERMISSION_PAGE_DEFS[p].ownerOnly);

export default function OrgPermissionsMatrixForm({
  orgId,
  users,
  features,
}: {
  orgId: string;
  users: MatrixUser[];
  features: OrgFeatures;
}) {
  const [state, formAction, isPending] = useActionState(superUpdateOrgPermissionsAction, null);
  const d = useDict();
  const s = d.superPanel.orgPerms;
  const editable = users.filter((u) => u.role === 'user');
  // Saqlangandan keyin checkbox'lar yangi qiymatdan qayta chizilsin
  const stamp = users.map((u) => `${u.id}:${u.permissions.join(',')}`).join('|');

  return (
    <form action={formAction} className="sa-form" key={stamp}>
      <input type="hidden" name="orgId" value={orgId} />
      {editable.map((u) => <input key={u.id} type="hidden" name="userId" value={u.id} />)}

      {state?.error && <Alert tone="error">{state.error}</Alert>}
      {state?.success && <Alert tone="ok">{state.success}</Alert>}

      <p className="sa-gfoot" style={{ padding: 0 }}>{s.intro}</p>
      {users.some((u) => u.roleName) && <p className="sa-gfoot" style={{ padding: 0 }}>{s.roleNote}</p>}

      <div className="sa-matrix-wrap">
        <table className="sa-matrix">
          <thead>
            <tr>
              <th scope="col">{s.colPermission}</th>
              {users.map((u) => (
                <th key={u.id} scope="col" title={u.username}>
                  {u.name}
                  <small>
                    {u.role === 'admin' ? s.roleAdmin : u.roleName ? tr(s.branchRole, { name: u.roleName }) : u.isDefault ? s.branchDefault : s.branchCustom}
                    {!u.active && s.inactiveSuffix}
                  </small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ASSIGNABLE_PAGES.flatMap((page) => {
              const keys = permissionsOfPage(page).filter((k) => !PERMISSIONS[k].adminOnly);
              if (keys.length === 0) return [];
              const pf = PERMISSION_PAGE_DEFS[page].feature;
              return [
                <tr key={`g-${page}`} className={`sa-matrix-group${pf && !features[pf] ? ' sa-matrix-off' : ''}`}>
                  <td colSpan={users.length + 1}>
                    {d.catalog.permissionPages[page]}
                    {pf && !features[pf] ? s.moduleOffSuffix : ''}
                  </td>
                </tr>,
                ...keys.map((k) => {
                  const p = PERMISSIONS[k];
                  const label = d.catalog.permissions[k].label;
                  const featureOff = p.feature ? !features[p.feature] : false;
                  return (
                    <tr key={k} className={featureOff ? 'sa-matrix-off' : undefined}>
                      <th scope="row" style={{ fontWeight: 500 }}>
                        {label}
                        <small style={{ display: 'block', fontSize: 12, color: 'var(--ink-3)', fontWeight: 400 }}>
                          {d.catalog.permissions[k].description}
                        </small>
                      </th>
                      {users.map((u) => (
                        <td key={u.id}>
                          <input
                            type="checkbox"
                            className="sa-check"
                            name={`perm_${u.id}`}
                            value={k}
                            defaultChecked={u.permissions.includes(k)}
                            disabled={isPending || u.role === 'admin'}
                            aria-label={`${u.name}: ${d.catalog.permissionPages[page]} — ${label}`}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                }),
              ];
            })}
            <tr className="sa-matrix-group">
              <td colSpan={users.length + 1}>{d.catalog.permissionOwnerPages}</td>
            </tr>
            {OWNER_PAGES.map((page) => (
              <tr key={page}>
                <th scope="row" style={{ fontWeight: 500 }}>
                  {d.catalog.permissionPages[page]}
                  <small style={{ display: 'block', fontSize: 12, color: 'var(--ink-3)', fontWeight: 400 }}>
                    {d.catalog.permissionPageOwnerOnly}
                  </small>
                </th>
                {users.map((u) => (
                  <td key={u.id}>
                    <input
                      type="checkbox"
                      className="sa-check"
                      checked={u.role === 'admin'}
                      readOnly
                      disabled
                      aria-label={`${u.name}: ${d.catalog.permissionPages[page]}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editable.length > 0 ? (
        <div className="sa-form-actions">
          <button type="submit" className="sa-btn sa-btn--filled" disabled={isPending}>
            {isPending ? d.common.saving : s.savePerms}
          </button>
          {editable.map((u) => (
            <button key={u.id} type="submit" name="resetUser" value={u.id} className="sa-btn sa-btn--gray sa-btn--sm" disabled={isPending}>
              {tr(s.resetUser, { name: u.name })}
            </button>
          ))}
        </div>
      ) : (
        <p className="sa-gfoot" style={{ padding: 0 }}>{s.noEditable}</p>
      )}
    </form>
  );
}
