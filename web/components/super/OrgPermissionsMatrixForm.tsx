'use client';

import { useActionState } from 'react';
import { superUpdateOrgPermissionsAction } from '@/app/actions/permissions';
import type { OrgFeatures } from '@/lib/featureKeys';
import {
  PERMISSION_GROUP_LABELS,
  PERMISSION_KEYS,
  PERMISSIONS,
  type PermissionGroup,
  type PermissionKey,
} from '@/lib/permissions';

export interface MatrixUser {
  id: string;
  username: string;
  name: string;
  role: 'admin' | 'user';
  active: boolean;
  isDefault: boolean;
  permissions: PermissionKey[];
}

const GROUPS = Object.keys(PERMISSION_GROUP_LABELS) as PermissionGroup[];

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
  const editable = users.filter((u) => u.role === 'user');
  // Saqlangandan keyin checkbox'lar yangi qiymatdan qayta chizilsin
  const stamp = users.map((u) => `${u.id}:${u.permissions.join(',')}`).join('|');

  return (
    <form action={formAction} className="perm-matrix-wrap" key={stamp}>
      <input type="hidden" name="orgId" value={orgId} />
      {editable.map((u) => <input key={u.id} type="hidden" name="userId" value={u.id} />)}

      {state?.error && <div className="auth-alert auth-alert--error">{state.error}</div>}
      {state?.success && <div className="auth-alert auth-alert--info">{state.success}</div>}

      <p className="field-hint" style={{ margin: 0 }}>
        Admin (do&apos;kon egasi) doim barcha huquqlarga ega. «Faqat egasi» huquqlarini filialga berib bo&apos;lmaydi.
        Modul o&apos;chiq bo&apos;lsa huquq amalda ishlamaydi (kulrang).
      </p>

      <div className="table-wrap">
        <table className="data-table data-table--simple perm-matrix">
          <thead>
            <tr>
              <th>Huquq</th>
              {users.map((u) => (
                <th key={u.id} title={u.username}>
                  {u.name}
                  <small style={{ display: 'block', fontWeight: 500 }}>
                    {u.role === 'admin' ? 'Admin' : u.isDefault ? 'Filial · standart' : 'Filial · maxsus'}
                    {!u.active && ' · nofaol'}
                  </small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {GROUPS.flatMap((g) => [
              <tr key={`g-${g}`} className="perm-matrix-group">
                <td colSpan={users.length + 1}>{PERMISSION_GROUP_LABELS[g]}</td>
              </tr>,
              ...PERMISSION_KEYS.filter((k) => PERMISSIONS[k].group === g).map((k) => {
                const p = PERMISSIONS[k];
                const featureOff = p.feature ? !features[p.feature] : false;
                return (
                  <tr key={k} style={featureOff ? { opacity: 0.55 } : undefined}>
                    <td>
                      {p.label}
                      <small>{k}{p.adminOnly ? ' · faqat egasi' : ''}{featureOff ? ' · modul o\'chiq' : ''}</small>
                    </td>
                    {users.map((u) => (
                      <td key={u.id}>
                        <input
                          type="checkbox"
                          name={`perm_${u.id}`}
                          value={k}
                          defaultChecked={u.permissions.includes(k)}
                          disabled={isPending || u.role === 'admin' || p.adminOnly}
                          aria-label={`${u.name}: ${p.label}`}
                        />
                      </td>
                    ))}
                  </tr>
                );
              }),
            ])}
          </tbody>
        </table>
      </div>

      {editable.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="submit" className="btn btn-primary" disabled={isPending}>
            {isPending ? 'Saqlanmoqda...' : 'Huquqlarni saqlash'}
          </button>
          {editable.map((u) => (
            <button key={u.id} type="submit" name="resetUser" value={u.id} className="btn btn-ghost btn-sm" disabled={isPending}>
              {u.name}: standartga qaytarish
            </button>
          ))}
        </div>
      ) : (
        <p className="field-hint" style={{ margin: 0 }}>Filial login yo&apos;q — o&apos;zgartiriladigan huquq yo&apos;q.</p>
      )}
    </form>
  );
}
