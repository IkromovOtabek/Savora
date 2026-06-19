'use client';

import { useTransition } from 'react';
import { logoutAction } from '@/app/actions/auth';
import Icon from '@/components/icons/Icon';

export default function LogoutButton({ className = 'btn-ghost', iconOnly = false }: { className?: string; iconOnly?: boolean }) {
  const [isPending, start] = useTransition();
  if (iconOnly) {
    return (
      <button
        type="button"
        className="logout-icon-btn"
        disabled={isPending}
        onClick={() => start(() => logoutAction())}
        title="Chiqish"
        aria-label="Chiqish"
      >
        <Icon name="logout" size={20} />
      </button>
    );
  }
  return (
    <button type="button" className={`btn btn-with-icon ${className}`} disabled={isPending} onClick={() => start(() => logoutAction())}>
      <Icon name="logout" size={16} />
      {isPending ? '...' : 'Chiqish'}
    </button>
  );
}

