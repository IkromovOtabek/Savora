'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateUserPermissionsAction } from '@/app/actions/permissions';
import { toast } from '@/lib/toast';
import Icon, { type IconName } from '@/components/icons/Icon';
import type { OrgFeatures } from '@/lib/featureKeys';
import {
  PERMISSION_GROUP_LABELS,
  PERMISSION_KEYS,
  PERMISSIONS,
  ROLE_DEFAULT_PERMISSIONS,
  type PermissionGroup,
  type PermissionKey,
} from '@/lib/permissions';
import '@/components/tenant/styles/admin.css';

const GROUPS = Object.keys(PERMISSION_GROUP_LABELS) as PermissionGroup[];

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

  const assignable = PERMISSION_KEYS.filter((k) => !PERMISSIONS[k].adminOnly);
  const onCount = assignable.filter((k) => checked.has(k)).length;

  return (
    <div className="ad-perm">
      <div className="ad-perm-intro">
        <p>
          <strong>{name}</strong> — {isDefault ? 'hozir rol standarti amal qilmoqda.' : 'maxsus huquqlar berilgan.'}
          {' '}Modul o&apos;chiq bo&apos;lsa, huquq bo&apos;lsa ham bo&apos;lim ko&apos;rinmaydi.
        </p>
        <div className="ad-perm-count" aria-live="polite">
          <b>{onCount}/{assignable.length}</b>
          <small>yoqilgan</small>
        </div>
      </div>

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
                <h2 id={`perm-g-${g}`}>{PERMISSION_GROUP_LABELS[g]}</h2>
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
                          {p.label}
                          <span className="ad-perm-tags">
                            {isStd && <span className="ad-pill">standart</span>}
                            {featureOff && <span className="ad-pill ad-pill--warn">modul o&apos;chiq</span>}
                          </span>
                        </b>
                        <small>{p.adminOnly ? 'Faqat do\'kon egasi' : p.description}</small>
                      </span>
                      <input
                        id={id}
                        className="ad-switch"
                        type="checkbox"
                        role="switch"
                        checked={p.adminOnly ? false : checked.has(k)}
                        onChange={() => toggle(k)}
                        disabled={busy || p.adminOnly}
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
          <Icon name="repeat" size={15} /> Standartga qaytarish
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDone} disabled={busy}>
          Bekor qilish
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => submit(false)} disabled={busy}>
          {busy ? 'Saqlanmoqda…' : 'Saqlash'}
        </button>
      </div>
    </div>
  );
}
