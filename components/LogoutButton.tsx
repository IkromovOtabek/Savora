'use client';

import { useTransition } from 'react';
import { logoutAction } from '@/app/actions/auth';
import Icon from '@/components/icons/Icon';

export default function LogoutButton({ className = 'btn-ghost' }: { className?: string }) {
  const [isPending, start] = useTransition();
  return (
    <button type="button" className={`btn btn-with-icon ${className}`} disabled={isPending} onClick={() => start(() => logoutAction())}>
      <Icon name="logout" size={16} />
      {isPending ? '...' : 'Chiqish'}
    </button>
  );
}

