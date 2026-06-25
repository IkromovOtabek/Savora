'use client';

import { useActionState, useState, useTransition } from 'react';
import { updateProfileAction, changePasswordAction } from '@/app/actions/profile';
import { useToastOnState } from '@/lib/useToastOnState';

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
    <div className="two-col">
      <div className="panel">
        <div className="panel-head"><h2>Kabinet</h2></div>
        <form action={profileAction} className="form-grid">
          <div className="form-meta"><span className="form-meta-l">Login:</span> <code>{username}</code></div>
          {profileState?.error && <div className="auth-alert auth-alert--error">{profileState.error}</div>}
          {profileState?.success && <div className="auth-alert auth-alert--info">{profileState.success}</div>}
          <div className="auth-field">
            <label htmlFor="fullName">To&apos;liq ism</label>
            <input id="fullName" name="fullName" type="text" defaultValue={fullName} disabled={profilePending} />
          </div>
          <button type="submit" className="btn btn-primary btn-sm" disabled={profilePending}>Saqlash</button>
        </form>
      </div>

      <div className="panel">
        <div className="panel-head"><h2>Parolni o&apos;zgartirish</h2></div>
        {mustChangePassword && (
          <div className="auth-alert auth-alert--warn" style={{ margin: '16px 24px 0' }}>
            Birinchi kirish — yangi parol o&apos;rnating.
          </div>
        )}
        <form action={pwdAction} className="form-grid">
          {pwdState?.error && <div className="auth-alert auth-alert--error">{pwdState.error}</div>}
          {pwdState?.success && <div className="auth-alert auth-alert--info">{pwdState.success}</div>}
          {!mustChangePassword && (
            <div className="auth-field">
              <label htmlFor="currentPassword">Joriy parol</label>
              <input id="currentPassword" name="currentPassword" type="password" required disabled={pwdPending} />
            </div>
          )}
          <div className="auth-field">
            <label htmlFor="newPassword">Yangi parol</label>
            <input id="newPassword" name="newPassword" type="password" required minLength={6} disabled={pwdPending} />
          </div>
          <div className="auth-field">
            <label htmlFor="confirmPassword">Tasdiq</label>
            <input id="confirmPassword" name="confirmPassword" type="password" required minLength={6} disabled={pwdPending} />
          </div>
          <button type="submit" className="btn btn-primary btn-sm" disabled={pwdPending}>Yangilash</button>
        </form>
      </div>
    </div>
  );
}
