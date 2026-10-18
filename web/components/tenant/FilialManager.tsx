'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createFilialAction, updateFilialAction, deleteFilialAction } from '@/app/actions/filials';
import { toast } from '@/lib/toast';
import { fmtDate } from '@/lib/format';
import Icon from '@/components/icons/Icon';
import PermissionEditor from '@/components/tenant/PermissionEditor';
import Tilt from '@/components/ui/Tilt';
import MoreMenu from '@/components/ui/MoreMenu';
import type { OrgFeatures } from '@/lib/featureKeys';
import type { PermissionKey } from '@/lib/permissions';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import '@/components/tenant/styles/admin.css';

interface Row {
  id: string;
  username: string;
  name: string;
  role: 'admin' | 'user';
  active: boolean;
  createdAt: string;
  isSelf: boolean;
  branchId?: string;
  phone?: string;
  address?: string;
  /** Amaldagi huquqlar va rol standartimi */
  permissions: PermissionKey[];
  permissionsDefault: boolean;
  roleId?: string;
  roleName?: string;
}

type ActResult = { error?: string; success?: string } | null;
type Modal = null | { type: 'create' } | { type: 'edit'; row: Row } | { type: 'perms'; row: Row };

/** Ism/nomdan 1–2 harfli bosh harflar (avatar uchun) */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const s = parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2);
  return s.toUpperCase();
}

export default function FilialManager({
  rows,
  maxFilial,
  activeBranchCount,
  features,
  roles = [],
}: {
  rows: Row[];
  maxFilial: number;
  activeBranchCount: number;
  features: OrgFeatures;
  roles?: { id: string; name: string; permissions: string[] }[];
}) {
  const router = useRouter();
  const d = useDict();
  const t = d.crm.team;
  const [modal, setModal] = useState<Modal>(null);
  const [busy, setBusy] = useState(false);
  /** Ikki bosqichli o'chirish: birinchi bosishda shu qatorga tasdiq chiqadi */
  const [confirmId, setConfirmId] = useState<string | null>(null);

  // Esc — oynani yopish (saqlanayotgan paytda emas)
  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) setModal(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal, busy]);

  // Tasdiq 6 soniyadan keyin o'z-o'zidan bekor bo'ladi
  useEffect(() => {
    if (!confirmId) return;
    const t = window.setTimeout(() => setConfirmId(null), 6000);
    return () => window.clearTimeout(t);
  }, [confirmId]);

  async function run(action: (fd: FormData) => Promise<ActResult>, form: HTMLFormElement) {
    setBusy(true);
    const res = await action(new FormData(form));
    setBusy(false);
    if (res?.error) { toast(res.error, 'error'); return; }
    toast(res?.success ?? d.common.saved, 'success');
    setModal(null);
    router.refresh();
  }

  async function remove(row: Row) {
    if (!row.branchId) return;
    setConfirmId(null);
    setBusy(true);
    const fd = new FormData();
    fd.set('branchId', row.branchId);
    const res = await deleteFilialAction(null, fd);
    setBusy(false);
    if (res?.error) { toast(res.error, 'error'); return; }
    toast(res?.success ?? d.common.deleted, 'success');
    router.refresh();
  }

  const limitPct = maxFilial > 0 ? Math.min(100, Math.round((activeBranchCount / maxFilial) * 100)) : 0;
  const atLimit = maxFilial > 0 && activeBranchCount >= maxFilial;
  const meterTone = atLimit ? ' ad-meter--over' : limitPct >= 80 ? ' ad-meter--warn' : '';
  const activeLogins = rows.filter((r) => r.active).length;
  const offLogins = rows.length - activeLogins;

  return (
    <>
      {/* ===== Xulosa: tarif limiti (3D asosiy ob'ekt) + loginlar ===== */}
      <div className="ad-team-summary">
        <Tilt stack className={`ad-hero${atLimit ? ' ad-hero--over' : ''}`}>
          <span className="ad-hero-l"><Icon name="store" size={15} /> {t.limitLabel}</span>
          <span className="ad-hero-v ux-z">{activeBranchCount}<small> / {maxFilial}</small></span>
          <div
            className={`ad-meter ad-meter--hero${meterTone}`}
            role="meter"
            aria-label={t.limitAria}
            aria-valuemin={0}
            aria-valuemax={maxFilial}
            aria-valuenow={activeBranchCount}
          >
            <div className="ad-meter-bar"><div className="ad-meter-fill" style={{ width: `${limitPct}%` }} /></div>
          </div>
          <span className="ad-hero-s">
            {atLimit
              ? <>{t.limitReached} · <a href="/app/profile#obuna-tolovi">{t.upgradePlan}</a></>
              : tr(t.canOpenMore, { n: Math.max(0, maxFilial - activeBranchCount) })}
          </span>
        </Tilt>
        <div className="ad-team-stats">
          <div className="ad-stat">
            <span className="ad-stat-l"><Icon name="users" size={15} /> {t.activeLogins}</span>
            <span className="ad-stat-v">{activeLogins}</span>
            <span className="ad-stat-sub">{tr(t.totalLogins, { n: rows.length })}</span>
          </div>
          <div className="ad-stat">
            <span className="ad-stat-l"><Icon name="lock" size={15} /> {t.disabled}</span>
            <span className="ad-stat-v">{offLogins}</span>
            <span className="ad-stat-sub">{t.cannotLogin}</span>
          </div>
        </div>
      </div>

      {/* ===== Jamoa kartalari ===== */}
      <section id="filial" className="ad-team" aria-labelledby="ad-team-title">
        <div className="ad-sec-head">
          <h2 id="ad-team-title">{t.teamTitle}</h2>
          <span>{tr(t.nLogins, { n: rows.length })}</span>
        </div>

        <ul className="ad-team-grid" role="list">
          {rows.map((r) => {
            const isAdmin = r.role === 'admin';
            const canEdit = !isAdmin && !!r.branchId;
            const canDelete = !isAdmin && !r.isSelf && !!r.branchId;
            const confirming = confirmId === r.id;
            return (
              <li key={r.id} className={`ad-member${r.active ? '' : ' ad-member--off'}`}>
                <div className="ad-member-top">
                  <span className={`ad-avatar${isAdmin ? ' ad-avatar--admin' : ''}`} aria-hidden="true">
                    {initials(r.name)}
                  </span>
                  <div className="ad-member-id">
                    <h3 className="ad-member-name">{r.name}</h3>
                    <span className="ad-member-login">@{r.username}</span>
                  </div>
                </div>

                <div className="ad-member-pills">
                  <span className={`ad-pill ${isAdmin ? 'ad-pill--brand' : ''}`}>
                    {isAdmin ? t.roleAdmin : t.roleBranch}
                  </span>
                  <span className={`ad-pill ${r.active ? 'ad-pill--ok' : 'ad-pill--danger'}`}>
                    <span className="ad-dot" aria-hidden="true" />
                    {r.active ? d.common.active : t.off}
                  </span>
                  <span className="ad-pill">
                    <Icon name="key" size={12} />
                    {isAdmin ? t.allPermissions : r.roleName ? `${r.roleName} · ${tr(t.nPermissions, { n: r.permissions.length })}` : `${tr(t.nPermissions, { n: r.permissions.length })}${r.permissionsDefault ? ` · ${t.standard}` : ''}`}
                  </span>
                  {r.isSelf && <span className="ad-pill ad-pill--gold">{t.you}</span>}
                </div>

                <div className="ad-member-meta">
                  {!isAdmin && (
                    <>
                      <div><Icon name="phone" size={14} /><span>{r.phone || t.noPhone}</span></div>
                      <div><Icon name="map" size={14} /><span>{r.address || t.noAddress}</span></div>
                    </>
                  )}
                  <div><Icon name="clock" size={14} /><span>{tr(t.createdAt, { date: fmtDate(r.createdAt) })}</span></div>
                </div>

                {!isAdmin && (
                  <div className="ad-member-actions" aria-live="polite">
                    {confirming ? (
                      <div className="ad-confirm">
                        <span className="ad-confirm-q">{t.deleteQ}</span>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmId(null)} disabled={busy}>
                          {d.common.no}
                        </button>
                        <button type="button" className="btn btn-danger-fill btn-sm" onClick={() => remove(r)} disabled={busy} autoFocus>
                          {busy ? d.common.deleting : t.yesDelete}
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn btn-tinted btn-sm btn-with-icon"
                          onClick={() => setModal({ type: 'perms', row: r })}
                        >
                          <Icon name="key" size={15} /> {t.permissionsBtn}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm btn-with-icon"
                          disabled={!canEdit}
                          onClick={() => setModal({ type: 'edit', row: r })}
                        >
                          <Icon name="edit" size={15} /> {d.common.edit}
                        </button>
                        {canDelete && (
                          <MoreMenu label={tr(t.moreAria, { name: r.name })}>
                            <button
                              type="button"
                              role="menuitem"
                              className="ux-danger"
                              disabled={busy}
                              onClick={() => setConfirmId(r.id)}
                            >
                              <Icon name="trash" size={16} /> {t.deleteBranch}
                            </button>
                          </MoreMenu>
                        )}
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}

          <li className="ad-member-add-wrap ux-hide-mobile">
            <button type="button" className="ad-member-add" onClick={() => setModal({ type: 'create' })}>
              <span className="ad-member-add-ic"><Icon name="plus" size={22} /></span>
              <b>{t.addNew}</b>
              <small>{atLimit ? t.addNewLimit : t.addNewHint}</small>
            </button>
          </li>
        </ul>
      </section>

      {/* Telefonda asosiy amal — pastki o'ng FAB (tab bar ustida) */}
      {!modal && (
        <button type="button" className="ux-fab" onClick={() => setModal({ type: 'create' })}>
          <Icon name="plus" size={18} /> {t.newBranch}
        </button>
      )}

      {/* ===== Yon panel: yangi filial ===== */}
      {modal?.type === 'create' && (
        <div className="u-modal-overlay ad-side-overlay" onClick={() => !busy && setModal(null)}>
          <div
            className="u-modal ad-side"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ad-create-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="u-modal-head">
              <h3 id="ad-create-title">{t.newBranch}</h3>
              <button type="button" className="u-icon-btn" aria-label={d.common.close} onClick={() => setModal(null)} disabled={busy}>
                <Icon name="close" size={18} />
              </button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); run((fd) => createFilialAction(null, fd), e.currentTarget); }}>
              <fieldset className="ad-fieldset">
                <legend>{t.branchLegend}</legend>
                <div className="auth-field">
                  <label htmlFor="fc-name">{t.branchName}</label>
                  <input id="fc-name" name="name" required disabled={busy} placeholder={t.branchNamePlaceholder} autoFocus />
                </div>
                <div className="auth-field">
                  <label htmlFor="fc-phone">{t.phone}</label>
                  <input id="fc-phone" name="phone" type="tel" inputMode="tel" disabled={busy} placeholder="+998..." />
                </div>
                <div className="auth-field">
                  <label htmlFor="fc-address">{t.address}</label>
                  <input id="fc-address" name="address" disabled={busy} />
                </div>
              </fieldset>
              <fieldset className="ad-fieldset">
                <legend>{t.loginLegend}</legend>
                <div className="auth-field">
                  <label htmlFor="fc-username">{t.login}</label>
                  <input id="fc-username" name="username" required disabled={busy} placeholder="chilonzor" autoComplete="off" autoCapitalize="none" />
                </div>
                <div className="auth-field">
                  <label htmlFor="fc-password">{t.password}</label>
                  <input id="fc-password" name="password" type="text" required disabled={busy} placeholder={t.passwordPlaceholder} autoComplete="off" />
                </div>
                <p className="ad-hint">{t.loginHint}</p>
              </fieldset>
              <div className="u-modal-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setModal(null)} disabled={busy}>{d.common.cancel}</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy ? d.common.saving : d.common.create}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== Oyna: huquqlar ===== */}
      {modal?.type === 'perms' && (
        <div className="u-modal-overlay" onClick={() => !busy && setModal(null)}>
          <div
            className="u-modal u-modal--wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ad-perms-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="u-modal-head">
              <h3 id="ad-perms-title">{tr(t.permissionsTitle, { name: modal.row.name })}</h3>
              <button type="button" className="u-icon-btn" aria-label={d.common.close} onClick={() => setModal(null)}>
                <Icon name="close" size={18} />
              </button>
            </div>
            <PermissionEditor
              userId={modal.row.id}
              name={modal.row.name}
              initial={modal.row.permissions}
              isDefault={modal.row.permissionsDefault}
              roles={roles}
              initialRoleId={modal.row.roleId}
              features={features}
              onDone={() => setModal(null)}
            />
          </div>
        </div>
      )}

      {/* ===== Yon panel: filialni tahrirlash ===== */}
      {modal?.type === 'edit' && (
        <div className="u-modal-overlay ad-side-overlay" onClick={() => !busy && setModal(null)}>
          <div
            className="u-modal ad-side"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ad-edit-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="u-modal-head">
              <h3 id="ad-edit-title">{t.editBranch}</h3>
              <button type="button" className="u-icon-btn" aria-label={d.common.close} onClick={() => setModal(null)} disabled={busy}>
                <Icon name="close" size={18} />
              </button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); run((fd) => updateFilialAction(null, fd), e.currentTarget); }}>
              <input type="hidden" name="branchId" value={modal.row.branchId} />
              <fieldset className="ad-fieldset">
                <legend>{t.branchLegend}</legend>
                <div className="auth-field">
                  <label htmlFor="fe-name">{t.branchName}</label>
                  <input id="fe-name" name="name" required defaultValue={modal.row.name} disabled={busy} />
                </div>
                <div className="auth-field">
                  <label htmlFor="fe-phone">{t.phone}</label>
                  <input id="fe-phone" name="phone" type="tel" inputMode="tel" defaultValue={modal.row.phone} disabled={busy} />
                </div>
                <div className="auth-field">
                  <label htmlFor="fe-address">{t.address}</label>
                  <input id="fe-address" name="address" defaultValue={modal.row.address} disabled={busy} />
                </div>
              </fieldset>
              <fieldset className="ad-fieldset">
                <legend>{tr(t.loginLegendUser, { username: modal.row.username })}</legend>
                <div className="auth-field">
                  <label htmlFor="fe-password">{t.newPassword}</label>
                  <input id="fe-password" name="newPassword" type="text" disabled={busy} placeholder={t.newPasswordPlaceholder} autoComplete="off" />
                </div>
                <label className="ad-toggle-row" htmlFor="fe-active">
                  <span>
                    <b>{t.activeLabel}</b>
                    <small>{t.activeHint}</small>
                  </span>
                  <input
                    id="fe-active"
                    className="ad-switch"
                    type="checkbox"
                    role="switch"
                    name="active"
                    defaultChecked={modal.row.active}
                    disabled={busy}
                  />
                </label>
              </fieldset>
              <div className="u-modal-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setModal(null)} disabled={busy}>{d.common.cancel}</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy ? d.common.saving : d.common.save}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
