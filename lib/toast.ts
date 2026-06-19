'use client';

export type ToastType = 'success' | 'error' | 'info' | 'warn';

export interface ToastDetail {
  message: string;
  type?: ToastType;
}

/** Ixtiyoriy joydan modal xabarnoma chiqarish */
export function toast(message: string, type: ToastType = 'success') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ToastDetail>('app:toast', { detail: { message, type } }));
}
