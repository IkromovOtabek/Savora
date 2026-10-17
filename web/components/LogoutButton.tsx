'use client';

import { useTransition } from 'react';
import { logoutAction } from '@/app/actions/auth';
import Icon from '@/components/icons/Icon';
import { useDict } from '@/lib/i18n/client';
import '@/components/auth/auth.css';

export default function LogoutButton({ className = 'btn-ghost', iconOnly = false }: { className?: string; iconOnly?: boolean }) {
  const [isPending, start] = useTransition();
  const d = useDict();
  if (iconOnly) {
    return (
      <button
        type="button"
        className="logout-icon-btn au-round"
        disabled={isPending}
        onClick={() => start(() => logoutAction())}
        title={d.common.logout}
        aria-label={d.common.logout}
      >
        <Icon name="logout" size={17} />
      </button>
    );
  }
  return (
    <button type="button" className={`btn btn-with-icon ${className}`} disabled={isPending} onClick={() => start(() => logoutAction())}>
      <Icon name="logout" size={16} />
      {isPending ? d.auth.logout.pending : d.common.logout}
    </button>
  );
}

