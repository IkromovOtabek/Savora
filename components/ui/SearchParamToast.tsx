'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast, ToastType } from '@/lib/toast';

/** Redirectda kelgan ?created=1, ?deleted=1 kabi paramlarni modal xabarnomaga aylantiradi */
const PARAM_MESSAGES: Record<string, { msg: string; type: ToastType }> = {
  created: { msg: 'Muvaffaqiyatli qo‘shildi.', type: 'success' },
  updated: { msg: 'Muvaffaqiyatli saqlandi.', type: 'success' },
  deleted: { msg: 'Muvaffaqiyatli o‘chirildi.', type: 'success' },
  branch: { msg: 'Filial qo‘shildi.', type: 'success' },
  welcome: { msg: 'Xush kelibsiz! Do‘koningiz tayyor.', type: 'success' },
  sold: { msg: 'Mahsulot sotildi.', type: 'success' },
  transferred: { msg: 'Boshqa filialga berildi.', type: 'success' },
  saved: { msg: 'Saqlandi.', type: 'success' },
};

export default function SearchParamToast() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    let matched = false;
    const next = new URLSearchParams(params.toString());

    for (const key of Object.keys(PARAM_MESSAGES)) {
      if (params.get(key) === '1') {
        toast(PARAM_MESSAGES[key].msg, PARAM_MESSAGES[key].type);
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
