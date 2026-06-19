'use client';

import { useEffect, useRef } from 'react';
import { toast } from './toast';

interface ActionState {
  success?: string;
  error?: string;
}

/** useActionState natijasini avtomatik modal xabarnomaga aylantiradi */
export function useToastOnState(state: ActionState | null | undefined) {
  const last = useRef<ActionState | null | undefined>(null);

  useEffect(() => {
    if (!state || state === last.current) return;
    last.current = state;
    if (state.success) toast(state.success, 'success');
    else if (state.error) toast(state.error, 'error');
  }, [state]);
}
