'use client';

import { useActionState } from 'react';
import { updateProfileAction, changePasswordAction } from '@/app/actions/profile';
import { useToastOnState } from '@/lib/useToastOnState';
import '@/components/tenant/styles/admin.css';

/** Kabinet: «Hisob» va «Xavfsizlik» bo'limlari (iOS Sozlamalar uslubida) */
export default function ProfileForms({
  username,
  fullName,
  mustChangePassword,
}: {
  username: string;
  fullName: string;
  mustChangePassword: boolean;
}) {
  const [profileState, profileAction, profilePending] = useActionState(updateProfileAction, null);
  const [pwdState, pwdAction, pwdPending] = useActionState(changePasswordAction, null);
  useToastOnState(profileState);
  useToastOnState(pwdState);

  return (
    <>
      <section id="hisob" aria-labelledby="sec-hisob">
        <div className="ad-sec-head"><h2 id="sec-hisob">Hisob</h2></div>
        <div className="ad-group ad-form-group">
          <form action={profileAction}>
            <div className="ad-form-row ad-form-row--meta">
              <span>Login</span>
              <code>{username}</code>
            </div>
            {profileState?.error && (
              <div className="ad-form-row"><div className="auth-alert auth-alert--error" role="alert">{profileState.error}</div></div>
            )}
            {profileState?.success && (
              <div className="ad-form-row"><div className="auth-alert auth-alert--info" role="status">{profileState.success}</div></div>
            )}
            <div className="ad-form-row auth-field">
              <label htmlFor="fullName">To&apos;liq ism</label>
              <input id="fullName" name="fullName" type="text" defaultValue={fullName} disabled={profilePending} autoComplete="name" />
            </div>
            <div className="ad-form-actions">
              <button type="submit" className="btn btn-primary btn-sm" disabled={profilePending}>
                {profilePending ? 'Saqlanmoqda…' : 'Saqlash'}
              </button>
            </div>
          </form>
        </div>
      </section>

      <section id="xavfsizlik" aria-labelledby="sec-xavfsizlik">
        <div className="ad-sec-head"><h2 id="sec-xavfsizlik">Xavfsizlik</h2></div>
        <div className="ad-group ad-form-group">
          <form action={pwdAction}>
            {mustChangePassword && (
              <div className="ad-form-row">
                <div className="auth-alert auth-alert--warn" role="status">Birinchi kirish — yangi parol o&apos;rnating.</div>
              </div>
            )}
            {pwdState?.error && (
              <div className="ad-form-row"><div className="auth-alert auth-alert--error" role="alert">{pwdState.error}</div></div>
            )}
            {pwdState?.success && (
              <div className="ad-form-row"><div className="auth-alert auth-alert--info" role="status">{pwdState.success}</div></div>
            )}
            {!mustChangePassword && (
              <div className="ad-form-row auth-field">
                <label htmlFor="currentPassword">Joriy parol</label>
                <input id="currentPassword" name="currentPassword" type="password" required disabled={pwdPending} autoComplete="current-password" />
              </div>
            )}
            <div className="ad-form-row auth-field">
              <label htmlFor="newPassword">Yangi parol</label>
              <input id="newPassword" name="newPassword" type="password" required minLength={6} disabled={pwdPending} autoComplete="new-password" />
            </div>
            <div className="ad-form-row auth-field">
              <label htmlFor="confirmPassword">Yangi parolni tasdiqlang</label>
              <input id="confirmPassword" name="confirmPassword" type="password" required minLength={6} disabled={pwdPending} autoComplete="new-password" />
            </div>
            <div className="ad-form-actions">
              <button type="submit" className="btn btn-primary btn-sm" disabled={pwdPending}>
                {pwdPending ? 'Yangilanmoqda…' : 'Parolni yangilash'}
              </button>
            </div>
          </form>
        </div>
        <p className="ad-sec-foot">Parol kamida 6 belgidan iborat bo&apos;lsin. Parolni unutsangiz, tiklash kodi Telegram orqali keladi.</p>
      </section>
    </>
  );
}
