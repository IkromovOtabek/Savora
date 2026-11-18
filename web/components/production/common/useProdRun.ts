'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/lib/toast';
import { useDict } from '@/lib/i18n/client';
import type { ActionResult } from '@/lib/production/session';

export type ActionFail = Extract<ActionResult<unknown>, { ok: false }>;

interface RunOpts<T> {
  /** Muvaffaqiyat xabari (berilmasa — action'ning `success` matni) */
  ok?: string | ((data: T) => string | undefined);
  /** Muvaffaqiyatdan keyin */
  after?: (data: T) => void;
  /** Xato: `true` qaytarsa — umumiy xabarnoma chiqmaydi (masalan yetishmovchilik ro'yxati sahifada ko'rsatiladi) */
  onError?: (e: ActionFail) => boolean | void;
  /** Sahifa ma'lumotini qayta o'qish (standart — ha) */
  refresh?: boolean;
}

/**
 * Ishlab chiqarish server action'ini bajarish: `{ ok, data } | { ok: false, error, code, details? }` → xabarnoma,
 * muvaffaqiyatda `router.refresh()`. Restoran `useRun` naqshi + xato tafsilotlari (`details.shortages`).
 */
export function useProdRun() {
  const d = useDict();
  const router = useRouter();
  const [pending, start] = useTransition();

  function run<T>(fn: () => Promise<ActionResult<T>>, opts: RunOpts<T> = {}) {
    start(async () => {
      let res: ActionResult<T>;
      try {
        res = await fn();
      } catch {
        // Tarmoq uzilishi yoki server xatosi (action natija qaytarmadi)
        toast(d.common.errorGeneric, 'error');
        return;
      }
      if (!res.ok) {
        if (opts.onError?.(res) !== true) toast(res.error, 'error');
        return;
      }
      const msg = (typeof opts.ok === 'function' ? opts.ok(res.data) : opts.ok) ?? res.success;
      if (msg) toast(msg, 'success');
      opts.after?.(res.data);
      if (opts.refresh !== false) router.refresh();
    });
  }

  return { pending, run };
}
