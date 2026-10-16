'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast, ToastType } from '@/lib/toast';
import { useDict } from '@/lib/i18n/client';

/** Redirectda kelgan ?created=1, ?deleted=1 kabi paramlarni modal xabarnomaga aylantiradi (matn — d.ui.toast.params) */
const PARAM_TYPES: Record<string, ToastType> = {
  created: 'success',
  updated: 'success',
  deleted: 'success',
  branch: 'success',
  welcome: 'success',
  sold: 'success',
  transferred: 'success',
  saved: 'success',
  denied: 'error',
};

export default function SearchParamToast() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const fired = useRef(false);
  const d = useDict();

  useEffect(() => {
    if (fired.current) return;
    let matched = false;
    const next = new URLSearchParams(params.toString());

    for (const key of Object.keys(PARAM_TYPES) as (keyof typeof d.ui.toast.params)[]) {
      if (params.get(key) === '1') {
        toast(d.ui.toast.params[key], PARAM_TYPES[key]);
        next.delete(key);
        matched = true;
      }
    }

    if (matched) {
      fired.current = true;
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  return null;
}
