'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cancelPurchaseOrderAction, receiveFromPurchaseOrderAction, sendPurchaseOrderAction } from '@/app/actions/receipts';
import Icon from '@/components/icons/Icon';
import ConfirmDialog from '@/components/production/receipts/ConfirmDialog';
import { newClientId } from '@/components/production/receipts/lines';
import { useDict } from '@/lib/i18n/client';
import { tr } from '@/lib/i18n/fmt';
import { toast } from '@/lib/toast';

/**
 * Xarid buyurtmasi amallari (`can` bo'yicha): «Yuborildi» (faqat belgi), «Qabul qilish» (qolgan miqdorlar bilan
 * kirim qoralamasi → kirim sahifasiga o'tish), bekor qilish. Shu buyurtmaning qabul qoralamasi bor bo'lsa — yangisi
 * ochilmaydi, o'sha qoralamaga havola beriladi (ikki marta qabul qilinmasin).
 */
export default function PoActions({
  id,
  can,
  draftReceipt,
  beforeAction,
  disabled,
  only,
}: {
  id: string;
  can: { send: boolean; receive: boolean; cancel: boolean };
  /** Faqat shu amallar (sarlavhada — bekor qilish, pastki panelda — yuborish/qabul) */
  only?: readonly ('send' | 'receive' | 'cancel')[];
  draftReceipt: { id: string; docNo: string } | null;
  /** Forma ichida: saqlanmagan o'zgarishni avval saqlash (false — to'xtatish) */
  beforeAction?: () => Promise<boolean>;
  disabled?: boolean;
}) {
  const d = useDict();
  const t = d.production.purchase;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<'send' | 'cancel' | null>(null);
  const [clientId] = useState(newClientId);
  const busy = pending || disabled;
  const show = (k: 'send' | 'receive' | 'cancel') => can[k] && (!only || only.includes(k));

  function run(kind: 'send' | 'cancel' | 'receive') {
    start(async () => {
      if (beforeAction && !(await beforeAction())) { setConfirm(null); return; }
      if (kind === 'receive') {
        const r = await receiveFromPurchaseOrderAction(id, { clientId });
        if (!r.ok) { toast(r.error, 'error'); router.refresh(); return; }
        toast(r.success ?? d.common.saved, 'success');
        router.push(`/app/receipts/${r.data.receipt.id}`);
        return;
      }
      const r = kind === 'send' ? await sendPurchaseOrderAction(id) : await cancelPurchaseOrderAction(id);
      setConfirm(null);
      toast(r.ok ? r.success ?? d.common.saved : r.error, r.ok ? 'success' : 'error');
      router.refresh();
    });
  }

  if (!show('send') && !show('receive') && !show('cancel')) return null;
  return (
    <>
      {show('cancel') && (
        <button type="button" className="btn btn-danger" onClick={() => setConfirm('cancel')} disabled={busy}>{t.cancelDoc}</button>
      )}
      {show('send') && (
        <button type="button" className="btn btn-tinted btn-with-icon" onClick={() => setConfirm('send')} disabled={busy}>
          <Icon name="send" size={16} /> {t.send}
        </button>
      )}
      {show('receive') && (draftReceipt ? (
        <Link href={`/app/receipts/${draftReceipt.id}`} className="btn btn-accent btn-with-icon" title={tr(t.draftReceipt, { no: draftReceipt.docNo })}>
          <Icon name="download" size={16} /> {t.openDraft}
        </Link>
      ) : (
        <button type="button" className="btn btn-accent btn-with-icon" onClick={() => run('receive')} disabled={busy} title={t.receiveHint}>
          <Icon name="download" size={16} /> {pending ? t.receiving : t.receive}
        </button>
      ))}

      <ConfirmDialog
        open={confirm === 'send'}
        title={t.sendConfirmTitle}
        confirmLabel={t.send}
        cancelLabel={d.production.receipts.keep}
        pending={pending}
        onConfirm={() => run('send')}
        onClose={() => { if (!pending) setConfirm(null); }}
      >
        <p>{t.sendConfirmText}</p>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === 'cancel'}
        title={t.cancelConfirmTitle}
        confirmLabel={t.cancelDoc}
        cancelLabel={d.production.receipts.keep}
        tone="danger"
        pending={pending}
        onConfirm={() => run('cancel')}
        onClose={() => { if (!pending) setConfirm(null); }}
      >
        <p>{t.cancelConfirmText}</p>
      </ConfirmDialog>
    </>
  );
}
