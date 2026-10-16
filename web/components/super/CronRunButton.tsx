'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Icon from '@/components/icons/Icon';
import {
  runExpireOrgsAction, runExpiryNotifyAction, runInstallmentRemindersAction, runDaftarRemindersAction,
} from '@/app/actions/systems';
import type { CronJob } from '@/lib/models/master/CronRun';

const ACTIONS: Record<CronJob, typeof runExpireOrgsAction> = {
  'expire-orgs': runExpireOrgsAction,
  'expiry-notifications': runExpiryNotifyAction,
  'installment-reminders': runInstallmentRemindersAction,
  'daftar-reminders': runDaftarRemindersAction,
};

/** Cron ishini paneldan qo'lda ishga tushirish; natija cron_runs'ga yoziladi va sahifa yangilanadi */
export default function CronRunButton({ job }: { job: CronJob }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(ACTIONS[job], null);
  useEffect(() => {
    if (state) router.refresh();
  }, [state, router]);
  return (
    <form action={formAction} className="sa-mon-cronrun">
      <button type="submit" className="sa-btn sa-btn--sm sa-btn--tinted" disabled={pending}>
        <Icon name="clock" size={14} />
        {pending ? 'Ishlanmoqda…' : 'Hozir'}
      </button>
      {state?.error && <small className="sa-mon-err">{state.error}</small>}
      {state?.success && <small className="sa-mon-ok">{state.success}</small>}
    </form>
  );
}
