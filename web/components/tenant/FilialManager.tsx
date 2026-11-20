'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createFilialAction, updateFilialAction, deleteFilialAction } from '@/app/actions/filials';
import { createStaffAction, updateStaffAction, deleteStaffAction } from '@/app/actions/staff';
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
import '@/components/tenant/styles/staffPick.css';

interface Row {
  id: string;
  username: string;
  name: string;
  /** admin — egasi; branch — filialning o'z logini; staff — filialga biriktirilgan xodim */
  kind: 'admin' | 'branch' | 'staff';
  role: 'admin' | 'user';
  active: boolean;
  createdAt: string;
  isSelf: boolean;
  branchId?: string;
  branchName?: string;
  phone?: string;
  address?: string;
  /** Amaldagi huquqlar va rol standartimi */
  permissions: PermissionKey[];
  permissionsDefault: boolean;
  roleId?: string;
  roleName?: string;
}

interface BranchOpt { id: string; name: string; isMain: boolean }

type ActResult = { error?: string; success?: string } | null;
type Modal =
  | null
  | { type: 'choose' }
  | { type: 'create' }
  | { type: 'createStaff'; branchId?: string }
  | { type: 'edit'; row: Row }
  | { type: 'editStaff'; row: Row }
  | { type: 'perms'; row: Row }
  /** Xodim yaratildi — unga beriladigan «Login · Parol» kartasi (parol faqat shu oynada, formadan) */
  | { type: 'staffCreated'; name: string; username: string; password: string };

/** Rol (sahifa lib/staffRoles.ts → staffRoleOptions bilan tartiblaydi: restoran shablonlari birinchi, izoh bilan) */
interface RoleOpt { id: string; name: string; permissions: string[]; group?: 'restaurant' | 'other'; hint?: string }

/** Ism/nomdan 1–2 harfli bosh harflar (avatar uchun) */
function initials(name: string): string {
  // Qavs va belgilar avatarga tushmasin: «Aziz (ofitsant)» → «AO»
  const parts = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const s = parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2);
  return s.toUpperCase();
}

export default function FilialManager({
  rows,
  maxFilial,
  activeBranchCount,
  maxUsers,
  activeUserCount,
  branches,
  features,
  roles = [],
}: {
  rows: Row[];
  maxFilial: number;
  activeBranchCount: number;
  /** Tarif: faol loginlar limiti (egasi bilan) */
  maxUsers: number;
  activeUserCount: number;
  /** Faol filiallar (asosiy ombor bilan) — xodim biriktirish uchun */
  branches: BranchOpt[];
  features: OrgFeatures;
  roles?: RoleOpt[];
}) {
  const router = useRouter();
  const d = useDict();
  const t = d.crm.team;
  const s = t.staff;
  const w = d.waiterDay.staff;
  const [modal, setModal] = useState<Modal>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
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
    let res: ActResult = null;
    try {
      res = await action(new FormData(form));
    } catch {
      res = { error: d.common.error };
    } finally {
      setBusy(false);
    }
    if (res?.error) { toast(res.error, 'error'); return; }
    toast(res?.success ?? d.common.saved, 'success');
    setModal(null);
    router.refresh();
  }

  /** Yangi xodim: muvaffaqiyatda oyna yopilmaydi — xodimga beriladigan login/parol kartasi ko'rsatiladi */
  async function createStaff(form: HTMLFormElement) {
    const fd = new FormData(form);
    const password = String(fd.get('password') || '');
    setBusy(true);
    let res: Awaited<ReturnType<typeof createStaffAction>> = null;
    try {
      res = await createStaffAction(null, fd);
    } catch {
      res = { error: d.common.error };
    } finally {
      setBusy(false);
    }
    if (res?.error) { toast(res.error, 'error'); return; }
    if (!res?.created) {
      toast(res?.success ?? d.common.saved, 'success');
      setModal(null);
    } else {
      setCopied(false);
      setModal({ type: 'staffCreated', name: res.created.name, username: res.created.username, password });
    }
    router.refresh();
  }

  /** «Login: X · Parol: Y» + kirish manzili — xodimga yuborish uchun */
  async function copyCredentials(m: { username: string; password: string }) {
    const text = `${w.login}: ${m.username} · ${w.password}: ${m.password}\n${w.enterAt}: ${window.location.origin}/login`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast(w.copied, 'success');
    } catch {
      toast(w.copyFailed, 'error');
    }
  }

  async function remove(row: Row) {
    setConfirmId(null);
    const fd = new FormData();
    let action: (fd: FormData) => Promise<ActResult>;
    if (row.kind === 'staff') {
      fd.set('userId', row.id);
      action = (f) => deleteStaffAction(null, f);
    } else {
      if (!row.branchId) return;
      fd.set('branchId', row.branchId);
      action = (f) => deleteFilialAction(null, f);
    }
    setBusy(true);
    let res: ActResult = null;
    try {
      res = await action(fd);
    } catch {
      res = { error: d.common.error };
    } finally {
      setBusy(false);
    }
    if (res?.error) { toast(res.error, 'error'); return; }
    toast(res?.success ?? d.common.deleted, 'success');
    router.refresh();
  }

  const limitPct = maxFilial > 0 ? Math.min(100, Math.round((activeBranchCount / maxFilial) * 100)) : 0;
  const atLimit = maxFilial > 0 && activeBranchCount >= maxFilial;
  const meterTone = atLimit ? ' ad-meter--over' : limitPct >= 80 ? ' ad-meter--warn' : '';
  const usersAtLimit = maxUsers > 0 && activeUserCount >= maxUsers;
  const offLogins = rows.filter((r) => !r.active).length;
  // Asosiy ombor belgisi — nomida allaqachon bo'lsa («Restoran (asosiy)», «Asosiy ombor») takrorlanmaydi
  const mainWord = tr(s.mainBranch, { name: '' }).replace(/[()\s]/g, '').toLowerCase();
  const branchLabel = (b: BranchOpt) =>
    b.isMain && !b.name.toLowerCase().includes(mainWord) ? tr(s.mainBranch, { name: b.name }) : b.name;
  const branchName = (r: Row) => {
    const b = branches.find((x) => x.id === r.branchId);
    return b ? branchLabel(b) : r.branchName ?? '—';
  };

  /** Filial tanlash maydoni (xodim qo'shish va tahrirlash) */
  const branchSelect = (id: string, value?: string) => (
    <div className="auth-field">
      <label htmlFor={id}>{s.branchLabel}</label>
      <select id={id} name="branchId" required defaultValue={value ?? (branches.length === 1 ? branches[0].id : '')} disabled={busy}>
        {branches.length !== 1 && <option value="" disabled>—</option>}
        {branches.map((b) => <option key={b.id} value={b.id}>{branchLabel(b)}</option>)}
      </select>
    </div>
  );

  // Restoran do'konida rol shablonlari (Ofitsant birinchi — standart tanlov); boshqa do'konda — oddiy ro'yxat
  const restRoles = roles.filter((r) => r.group === 'restaurant');
  const otherRoles = roles.filter((r) => r.group !== 'restaurant');
  const roleRadio = (r: Pick<RoleOpt, 'id' | 'name' | 'hint'>, checked: boolean) => (
    <label key={r.id || 'none'} className="sp-role">
      <input type="radio" name="roleId" value={r.id} defaultChecked={checked} />
      <span>
        <b>{r.name}</b>
        {r.hint && <small>{r.hint}</small>}
      </span>
    </label>
  );

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
            <span className="ad-stat-l"><Icon name="users" size={15} /> {s.usersLabel}</span>
            <span className="ad-stat-v">{activeUserCount}<small> / {maxUsers}</small></span>
            <span className="ad-stat-sub">
              {usersAtLimit
                ? <>{t.limitReached} · <a href="/app/profile#obuna-tolovi">{t.upgradePlan}</a></>
                : tr(s.usersLeft, { n: Math.max(0, maxUsers - activeUserCount) })}
            </span>
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
        <p className="ad-sec-foot ad-team-explain">{s.explain}</p>

        <ul className="ad-team-grid" role="list">
          {rows.map((r) => {
            const isAdmin = r.kind === 'admin';
            const isStaff = r.kind === 'staff';
            const canEdit = !isAdmin && !!r.branchId && !r.isSelf;
            const canDelete = !isAdmin && !r.isSelf && (isStaff || !!r.branchId);
            const confirming = confirmId === r.id;
            return (
              <li key={r.id} className={`ad-member${r.active ? '' : ' ad-member--off'}`} data-kind={r.kind}>
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
                  <span className={`ad-pill ${isAdmin ? 'ad-pill--brand' : isStaff ? 'ad-pill--staff' : ''}`}>
                    {isAdmin ? t.roleAdmin : isStaff ? s.roleStaff : t.roleBranch}
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
                  {isStaff ? (
                    <div><Icon name="store" size={14} /><span>{branchName(r)}</span></div>
                  ) : !isAdmin && (
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
                          onClick={() => setModal(isStaff ? { type: 'editStaff', row: r } : { type: 'edit', row: r })}
                        >
                          <Icon name="edit" size={15} /> {d.common.edit}
                        </button>
                        {(canDelete || (!isStaff && r.branchId)) && (
                          <MoreMenu label={tr(t.moreAria, { name: r.name })}>
                            {!isStaff && r.branchId && (
                              <button type="button" role="menuitem" disabled={busy} onClick={() => setModal({ type: 'createStaff', branchId: r.branchId })}>
                                <Icon name="user" size={16} /> {s.addStaff}
                              </button>
                            )}
                            {canDelete && (
                              <button
                                type="button"
                                role="menuitem"
                                className="ux-danger"
                                disabled={busy}
                                onClick={() => setConfirmId(r.id)}
                              >
                                <Icon name="trash" size={16} /> {isStaff ? s.deleteStaff : t.deleteBranch}
                              </button>
                            )}
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
            <button type="button" className="ad-member-add" onClick={() => setModal({ type: 'createStaff' })}>
              <span className="ad-member-add-ic"><Icon name="user" size={22} /></span>
              <b>{s.addStaff}</b>
              <small>{usersAtLimit ? t.addNewLimit : s.addStaffHint}</small>
            </button>
          </li>
          <li className="ad-member-add-wrap ux-hide-mobile">
            <button type="button" className="ad-member-add" onClick={() => setModal({ type: 'create' })}>
              <span className="ad-member-add-ic"><Icon name="plus" size={22} /></span>
              <b>{t.addNew}</b>
              <small>{atLimit ? t.addNewLimit : t.addNewHint}</small>
            </button>
          </li>
        </ul>
      </section>

      {/* Telefonda asosiy amal — pastki o'ng FAB (tab bar ustida): filial yoki xodim tanlanadi */}
      {!modal && (
        <button type="button" className="ux-fab" onClick={() => setModal({ type: 'choose' })}>
          <Icon name="plus" size={18} /> {d.common.add}
        </button>
      )}

      {/* ===== Tanlov: filial yoki xodim (telefon FAB) ===== */}
      {modal?.type === 'choose' && (
        <div className="u-modal-overlay" onClick={() => setModal(null)}>
          <div className="u-modal" role="dialog" aria-modal="true" aria-labelledby="ad-choose-title" onClick={(e) => e.stopPropagation()}>
            <div className="u-modal-head">
              <h3 id="ad-choose-title">{s.chooseTitle}</h3>
              <button type="button" className="u-icon-btn" aria-label={d.common.close} onClick={() => setModal(null)}>
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="ad-choose">
              <button type="button" className="ad-choose-opt" onClick={() => setModal({ type: 'createStaff' })} autoFocus>
                <span className="ad-member-add-ic"><Icon name="user" size={20} /></span>
                <span><b>{s.addStaff}</b><small>{s.chooseStaff}</small></span>
              </button>
              <button type="button" className="ad-choose-opt" onClick={() => setModal({ type: 'create' })}>
                <span className="ad-member-add-ic"><Icon name="store" size={20} /></span>
                <span><b>{t.addNew}</b><small>{s.chooseBranch}</small></span>
              </button>
            </div>
          </div>
        </div>
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
              <p className="ad-hint">{s.chooseBranch}</p>
              <fieldset className="ad-fieldset">
                <legend>{t.branchLegend}</legend>
                <div className="auth-field">
                  <label htmlFor="fc-name">{t.branchName}</label>
                  <input id="fc-name" name="name" required disabled={busy} placeholder={t.branchNamePlaceholder} autoFocus />
                </div>
                <div className="auth-field">
                  <label htmlFor="fc-phone">{t.phone}</label>
                  <input id="fc-phone" name="phone" type="tel" inputMode="tel" disabled={busy} placeholder="+998 99 000 00 00" />
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

      {/* ===== Yon panel: yangi xodim (mavjud filialga) ===== */}
      {modal?.type === 'createStaff' && (
        <div className="u-modal-overlay ad-side-overlay" onClick={() => !busy && setModal(null)}>
          <div
            className="u-modal ad-side"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ad-staff-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="u-modal-head">
              <h3 id="ad-staff-title">{s.newStaff}</h3>
              <button type="button" className="u-icon-btn" aria-label={d.common.close} onClick={() => setModal(null)} disabled={busy}>
                <Icon name="close" size={18} />
              </button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); void createStaff(e.currentTarget); }}>
              <p className="ad-hint">{s.chooseStaff}</p>
              {usersAtLimit && (
                <p className="ad-hint ad-hint--warn" role="alert">
                  {tr(s.errUserLimit, { max: maxUsers })} <a href="/app/profile#obuna-tolovi">{t.upgradePlan}</a>
                </p>
              )}
              <fieldset className="ad-fieldset">
                <legend>{s.personLegend}</legend>
                <div className="auth-field">
                  <label htmlFor="sc-name">{s.fullName}</label>
                  <input id="sc-name" name="fullName" required maxLength={80} disabled={busy} placeholder={s.fullNamePlaceholder} autoComplete="off" autoFocus />
                </div>
                {branchSelect('sc-branch', modal.branchId)}
                {restRoles.length > 0 ? (
                  // Restoran: shablonlar kartochka ko'rinishida (izoh bilan), qolganlari — «Boshqa rollar» ichida
                  <fieldset className="sp-roles" disabled={busy}>
                    <legend>{s.roleLabel}</legend>
                    <p className="sp-group">{w.restaurantRoles}</p>
                    {restRoles.map((r) => roleRadio(r, r.id === restRoles[0].id))}
                    <details className="sp-more">
                      <summary>{w.otherRoles}</summary>
                      {otherRoles.map((r) => roleRadio(r, false))}
                      {roleRadio({ id: '', name: w.roleNoneShort, hint: w.noneHint }, false)}
                    </details>
                  </fieldset>
                ) : (
                  <div className="auth-field">
                    <label htmlFor="sc-role">{s.roleLabel}</label>
                    <select id="sc-role" name="roleId" defaultValue="" disabled={busy}>
                      <option value="">{s.roleNone}</option>
                      {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                )}
                <p className="ad-hint">{s.roleHint}</p>
              </fieldset>
              <fieldset className="ad-fieldset">
                <legend>{t.loginLegend}</legend>
                <div className="auth-field">
                  <label htmlFor="sc-username">{t.login}</label>
                  <input id="sc-username" name="username" required minLength={3} maxLength={40} disabled={busy} placeholder="aziz" autoComplete="off" autoCapitalize="none" spellCheck={false} />
                </div>
                <div className="auth-field">
                  <label htmlFor="sc-password">{t.password}</label>
                  <input id="sc-password" name="password" type="text" required minLength={6} disabled={busy} placeholder={t.passwordPlaceholder} autoComplete="off" />
                </div>
                <p className="ad-hint">{s.loginHint}</p>
              </fieldset>
              <div className="u-modal-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setModal(null)} disabled={busy}>{d.common.cancel}</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={busy || usersAtLimit}>{busy ? d.common.saving : d.common.create}</button>
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

      {/* ===== Yon panel: xodimni tahrirlash (ism, filial, parol, bloklash; rol — «Huquqlar») ===== */}
      {modal?.type === 'editStaff' && (
        <div className="u-modal-overlay ad-side-overlay" onClick={() => !busy && setModal(null)}>
          <div
            className="u-modal ad-side"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ad-sedit-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="u-modal-head">
              <h3 id="ad-sedit-title">{s.editStaff}</h3>
              <button type="button" className="u-icon-btn" aria-label={d.common.close} onClick={() => setModal(null)} disabled={busy}>
                <Icon name="close" size={18} />
              </button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); run((fd) => updateStaffAction(null, fd), e.currentTarget); }}>
              <input type="hidden" name="userId" value={modal.row.id} />
              <fieldset className="ad-fieldset">
                <legend>{s.personLegend}</legend>
                <div className="auth-field">
                  <label htmlFor="se-name">{s.fullName}</label>
                  <input id="se-name" name="fullName" required maxLength={80} defaultValue={modal.row.name} disabled={busy} autoComplete="off" />
                </div>
                {branchSelect('se-branch', modal.row.branchId)}
              </fieldset>
              <fieldset className="ad-fieldset">
                <legend>{tr(t.loginLegendUser, { username: modal.row.username })}</legend>
                <div className="auth-field">
                  <label htmlFor="se-password">{t.newPassword}</label>
                  <input id="se-password" name="newPassword" type="text" disabled={busy} placeholder={t.newPasswordPlaceholder} autoComplete="off" />
                </div>
                <label className="ad-toggle-row" htmlFor="se-active">
                  <span>
                    <b>{t.activeLabel}</b>
                    <small>{s.activeHint}</small>
                  </span>
                  <input
                    id="se-active"
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

      {/* ===== Xodim yaratildi: xodimga beriladigan login va parol (nusxa olish) ===== */}
      {/* Tashqariga bosilganda yopilmaydi — parol tasodifan yo'qolmasin («Tayyor», ✕ yoki Esc) */}
      {modal?.type === 'staffCreated' && (
        <div className="u-modal-overlay">
          <div className="u-modal sp-done" role="dialog" aria-modal="true" aria-labelledby="sp-done-title">
            <div className="u-modal-head">
              <h3 id="sp-done-title"><span className="sp-done-ic" aria-hidden="true"><Icon name="check" size={16} /></span>{w.createdTitle}</h3>
              <button type="button" className="u-icon-btn" aria-label={d.common.close} onClick={() => setModal(null)}>
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="sp-done-body">
              <p className="ad-hint">{tr(w.createdLead, { name: modal.name })}</p>
              <div className="sp-cred">
                <div className="sp-cred-row"><span>{w.login}</span><b>{modal.username}</b></div>
                <div className="sp-cred-row"><span>{w.password}</span><b>{modal.password}</b></div>
                <div className="sp-cred-row sp-cred-row--sub"><span>{w.enterAt}</span><b>{`${window.location.host}/login`}</b></div>
              </div>
              <p className="ad-hint">{w.passwordOnce}</p>
              <div className="u-modal-actions sp-done-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setModal({ type: 'createStaff' })}>{w.addAnother}</button>
                <button type="button" className="btn btn-tinted btn-sm" onClick={() => void copyCredentials(modal)} autoFocus>
                  <Icon name={copied ? 'check' : 'clipboard'} size={16} /> {copied ? w.copied : w.copy}
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setModal(null)}>{w.done}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
