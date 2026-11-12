'use client';

import Icon, { type IconName } from '@/components/icons/Icon';
import type { OrgFeatures } from '@/lib/featureKeys';
import { NAV_ICONS } from '@/lib/navConfig';
import {
  PERMISSION_PAGE_DEFS,
  PERMISSION_PAGES,
  PERMISSIONS,
  ROLE_DEFAULT_PERMISSIONS,
  permissionsOfPage,
  type PermissionKey,
  type PermissionPage,
} from '@/lib/permissions';
import { useDict } from '@/lib/i18n/client';

/** Filial loginga beriladigan sahifalar (har birida kamida bitta amal) */
export const ASSIGNABLE_PAGES = PERMISSION_PAGES.filter(
  (p) => !PERMISSION_PAGE_DEFS[p].ownerOnly && permissionsOfPage(p).some((k) => !PERMISSIONS[k].adminOnly),
);
const OWNER_PAGES = PERMISSION_PAGES.filter((p) => PERMISSION_PAGE_DEFS[p].ownerOnly);

export const ASSIGNABLE_KEYS: PermissionKey[] = ASSIGNABLE_PAGES.flatMap((p) => permissionsOfPage(p).filter((k) => !PERMISSIONS[k].adminOnly));

function pageIcon(page: PermissionPage): IconName {
  return NAV_ICONS[PERMISSION_PAGE_DEFS[page].href] ?? 'grid';
}

/**
 * Huquqlar — SAHIFALAR bo'yicha: har sahifa sarlavhasi (ikonka, nom, yoqilganlar soni, «barchasi»
 * switch'i) va shu sahifadagi amallar. Oxirida faqat egasiga tegishli sahifalar qulf bilan.
 * Filial loginini tahrirlash (/app/users) va rol shablonlari (/app/roles) shuni ishlatadi.
 */
export default function PermissionPages({
  checked,
  onChange,
  features,
  disabled = false,
  idPrefix,
  showStandard = false,
}: {
  checked: ReadonlySet<PermissionKey>;
  onChange: (next: Set<PermissionKey>) => void;
  features: OrgFeatures;
  disabled?: boolean;
  idPrefix: string;
  /** Rol standartiga kiradigan huquqlarga «standart» belgisi */
  showStandard?: boolean;
}) {
  const d = useDict();
  const P = d.crm.team.perm;

  function setKeys(keys: PermissionKey[], on: boolean) {
    const next = new Set(checked);
    for (const k of keys) {
      if (on) next.add(k);
      else next.delete(k);
    }
    onChange(next);
  }

  return (
    <div className="ad-perm-groups">
      {ASSIGNABLE_PAGES.map((page) => {
        const def = PERMISSION_PAGE_DEFS[page];
        const keys = permissionsOfPage(page).filter((k) => !PERMISSIONS[k].adminOnly);
        const on = keys.filter((k) => checked.has(k)).length;
        const pageOff = def.feature ? !features[def.feature] : false;
        const hid = `${idPrefix}-pg-${page}`;
        return (
          <section key={page} aria-labelledby={hid} className={pageOff ? 'ad-perm-page is-off' : 'ad-perm-page'}>
            <div className="ad-sec-head">
              <h2 id={hid} className="ad-perm-page-h">
                <Icon name={pageIcon(page)} size={14} />
                {d.catalog.permissionPages[page]}
                {pageOff && <span className="ad-pill ad-pill--warn">{P.moduleOff}</span>}
              </h2>
              <span>{on}/{keys.length}</span>
            </div>
            <div className="ad-group">
              {keys.length > 1 && (
                <label htmlFor={`${hid}-all`} className="ad-cell ad-cell--flat ad-perm-row ad-perm-all">
                  <span className="ad-cell-t"><b>{d.catalog.permissionPageAll}</b></span>
                  <input
                    id={`${hid}-all`}
                    className="ad-switch"
                    type="checkbox"
                    role="switch"
                    checked={on === keys.length}
                    aria-checked={on === keys.length ? 'true' : on === 0 ? 'false' : 'mixed'}
                    onChange={(e) => setKeys(keys, e.target.checked)}
                    disabled={disabled}
                  />
                </label>
              )}
              {keys.map((k) => {
                const p = PERMISSIONS[k];
                const rowOff = !pageOff && p.feature && p.feature !== def.feature ? !features[p.feature] : false;
                const isStd = showStandard && ROLE_DEFAULT_PERMISSIONS.user.includes(k);
                const id = `${idPrefix}-${k.replace('.', '-')}`;
                return (
                  <label key={k} htmlFor={id} className="ad-cell ad-cell--flat ad-perm-row">
                    <span className="ad-cell-t">
                      <b>
                        {d.catalog.permissions[k].label}
                        <span className="ad-perm-tags">
                          {isStd && <span className="ad-pill">{P.standardTag}</span>}
                          {rowOff && <span className="ad-pill ad-pill--warn">{P.moduleOff}</span>}
                        </span>
                      </b>
                      <small>{d.catalog.permissions[k].description}</small>
                    </span>
                    <input
                      id={id}
                      className="ad-switch"
                      type="checkbox"
                      role="switch"
                      checked={checked.has(k)}
                      onChange={(e) => setKeys([k], e.target.checked)}
                      disabled={disabled}
                    />
                  </label>
                );
              })}
            </div>
          </section>
        );
      })}

      <section aria-labelledby={`${idPrefix}-owner`}>
        <div className="ad-sec-head">
          <h2 id={`${idPrefix}-owner`} className="ad-perm-page-h">
            <Icon name="lock" size={14} />
            {d.catalog.permissionOwnerPages}
          </h2>
          <span>{OWNER_PAGES.length}</span>
        </div>
        <div className="ad-group">
          {OWNER_PAGES.map((page) => (
            <div key={page} className="ad-cell ad-perm-row ad-perm-row--locked">
              <span className="ad-sq ad-sq--muted" aria-hidden="true"><Icon name={pageIcon(page)} size={16} /></span>
              <span className="ad-cell-t">
                <b>{d.catalog.permissionPages[page]}</b>
                <small>{d.catalog.permissionPageOwnerOnly}</small>
              </span>
              <Icon name="lock" size={16} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
