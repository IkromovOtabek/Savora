'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateUserPermissionsAction } from '@/app/actions/permissions';
import { toast } from '@/lib/toast';
import Icon from '@/components/icons/Icon';
import type { OrgFeatures } from '@/lib/featureKeys';
import {
  PERMISSION_GROUP_LABELS,
  PERMISSION_KEYS,
  PERMISSIONS,
  ROLE_DEFAULT_PERMISSIONS,
  type PermissionGroup,
  type PermissionKey,
} from '@/lib/permissions';

const GROUPS = Object.keys(PERMISSION_GROUP_LABELS) as PermissionGroup[];

/** Filial login huquqlari — guruhlangan checkbox'lar (do'kon egasi uchun) */
export default function PermissionEditor({
  userId,
  name,
  initial,
  isDefault,
  features,
  onDone,
}: {
  userId: string;
  name: string;
  initial: PermissionKey[];
  isDefault: boolean;
  features: OrgFeatures;
  onDone: () => void;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState<Set<PermissionKey>>(new Set(initial));
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
    if (reset) fd.set('reset', '1');
    for (const k of checked) fd.append('perm', k);
    const res = await updateUserPermissionsAction(null, fd);
    setBusy(false);
    if (res?.error) { toast(res.error, 'error'); return; }
    toast(res?.success ?? 'Saqlandi.', 'success');
    onDone();
    router.refresh();
  }

  return (
    <div className="perm-editor">
      <p className="perm-editor-hint">
        <strong>{name}</strong> — {isDefault ? 'hozir rol standarti amal qilmoqda.' : 'maxsus huquqlar berilgan.'}
        {' '}Modul o&apos;chiq bo&apos;lsa, huquq bo&apos;lsa ham bo&apos;lim ko&apos;rinmaydi.
      </p>
      {GROUPS.map((g) => {
        const keys = PERMISSION_KEYS.filter((k) => PERMISSIONS[k].group === g);
        return (
          <div key={g} className="module-group">
            <h3 className="module-group-title">{PERMISSION_GROUP_LABELS[g]}</h3>
            <div className="module-grid">
              {keys.map((k) => {
                const p = PERMISSIONS[k];
                const featureOff = p.feature ? !features[p.feature] : false;
                return (
                  <label key={k} className={`module-check${p.adminOnly ? ' module-check--locked' : ''}`}>
                    <input
                      type="checkbox"
                      checked={p.adminOnly ? false : checked.has(k)}
                      onChange={() => toggle(k)}
                      disabled={busy || p.adminOnly}
                    />
                    <span>
                      <strong>
                        {p.label}
                        {p.adminOnly && <Icon name="lock" size={12} />}
                      </strong>
                      <small>
                        {p.adminOnly ? 'Faqat do\'kon egasi' : p.description}
                        {featureOff && ' · modul o\'chiq'}
                        {!p.adminOnly && ROLE_DEFAULT_PERMISSIONS.user.includes(k) && ' · standart'}
                      </small>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
      <div className="u-modal-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => submit(true)} disabled={busy}>
          Standartga qaytarish
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => submit(false)} disabled={busy}>
          {busy ? 'Saqlanmoqda...' : 'Saqlash'}
        </button>
      </div>
    </div>
  );
}
