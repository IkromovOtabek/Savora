'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/lib/toast';
import { useDict } from '@/lib/i18n/client';
import type { ActionResult } from '@/lib/restaurant/session';

interface RunOpts<T> {
  /** Muvaffaqiyat xabari (berilmasa — action'ning `success` matni) */
  ok?: string | ((data: T) => string);
  /** Muvaffaqiyatdan keyin (holatni yangilash) */
  after?: (data: T) => void;
  /** Sahifa ma'lumotini qayta o'qish (standart — ha) */
  refresh?: boolean;
}

/**
 * Restoran server action'ini bajarish: natija `{ ok, data } | { ok: false, error }` → xabarnoma,
 * muvaffaqiyatda `router.refresh()` (action'lar faqat /app/restaurant ni revalidate qiladi).
 */
export function useRun() {
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
        toast(res.error, 'error');
        return;
      }
      const msg = typeof opts.ok === 'function' ? opts.ok(res.data) : opts.ok ?? res.success;
      if (msg) toast(msg, 'success');
      opts.after?.(res.data);
      if (opts.refresh !== false) router.refresh();
    });
  }

  return { pending, run };
}
