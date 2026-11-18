'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cancelReceiptAction } from '@/app/actions/receipts';
import { useDict } from '@/lib/i18n/client';
import { toast } from '@/lib/toast';
import ConfirmDialog from './ConfirmDialog';

/** Kirim aktini bekor qilish (faqat ko'rish rejimida, `can.cancel` bo'lsa) — tasdiqlash oynasi bilan */
export default function ReceiptCancelButton({ id }: { id: string }) {
  const t = useDict().production.receipts;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <>
      <button type="button" className="btn btn-danger" onClick={() => setOpen(true)} disabled={pending}>{t.cancelDoc}</button>
      <ConfirmDialog
        open={open}
        title={t.cancelConfirmTitle}
        confirmLabel={t.cancelDoc}
        cancelLabel={t.keep}
        tone="danger"
        pending={pending}
        onClose={() => { if (!pending) setOpen(false); }}
        onConfirm={() => start(async () => {
          const r = await cancelReceiptAction(id);
          setOpen(false);
          toast(r.ok ? r.success ?? t.cancelDoc : r.error, r.ok ? 'success' : 'error');
          router.refresh();
        })}
      >
        <p>{t.cancelConfirmText}</p>
      </ConfirmDialog>
    </>
  );
}
