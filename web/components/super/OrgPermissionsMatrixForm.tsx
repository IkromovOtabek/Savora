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
import { Alert } from './ui';

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
    <form action={formAction} className="sa-form" key={stamp}>
      <input type="hidden" name="orgId" value={orgId} />
      {editable.map((u) => <input key={u.id} type="hidden" name="userId" value={u.id} />)}

      {state?.error && <Alert tone="error">{state.error}</Alert>}
      {state?.success && <Alert tone="ok">{state.success}</Alert>}

      <p className="sa-gfoot" style={{ padding: 0 }}>
        Admin (do&apos;kon egasi) doim barcha huquqlarga ega. «Faqat egasi» huquqlarini filialga berib bo&apos;lmaydi.
        Modul o&apos;chiq bo&apos;lsa, huquq amalda ishlamaydi (xira ko&apos;rinadi).
      </p>

      <div className="sa-matrix-wrap">
        <table className="sa-matrix">
          <thead>
            <tr>
              <th scope="col">Huquq</th>
              {users.map((u) => (
                <th key={u.id} scope="col" title={u.username}>
                  {u.name}
                  <small>
                    {u.role === 'admin' ? 'Admin' : u.isDefault ? 'Filial · standart' : 'Filial · maxsus'}
                    {!u.active && ' · nofaol'}
                  </small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {GROUPS.flatMap((g) => [
              <tr key={`g-${g}`} className="sa-matrix-group">
                <td colSpan={users.length + 1}>{PERMISSION_GROUP_LABELS[g]}</td>
              </tr>,
              ...PERMISSION_KEYS.filter((k) => PERMISSIONS[k].group === g).map((k) => {
                const p = PERMISSIONS[k];
                const featureOff = p.feature ? !features[p.feature] : false;
                return (
                  <tr key={k} className={featureOff ? 'sa-matrix-off' : undefined}>
                    <th scope="row" style={{ fontWeight: 500 }}>
                      {p.label}
                      <small style={{ display: 'block', fontSize: 12, color: 'var(--ink-3)', fontWeight: 400 }}>
                        {k}{p.adminOnly ? ' · faqat egasi' : ''}{featureOff ? ' · modul o\'chiq' : ''}
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
        <div className="sa-form-actions">
          <button type="submit" className="sa-btn sa-btn--filled" disabled={isPending}>
            {isPending ? 'Saqlanmoqda…' : 'Huquqlarni saqlash'}
          </button>
          {editable.map((u) => (
            <button key={u.id} type="submit" name="resetUser" value={u.id} className="sa-btn sa-btn--gray sa-btn--sm" disabled={isPending}>
              {u.name}: standartga qaytarish
            </button>
          ))}
        </div>
      ) : (
        <p className="sa-gfoot" style={{ padding: 0 }}>Filial logini yo&apos;q — o&apos;zgartiriladigan huquq yo&apos;q.</p>
      )}
    </form>
  );
}
