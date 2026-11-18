/** Hujjat holati belgisi (kirim akti / xarid buyurtmasi) — rang holatga qarab, matn lug'atdan */
export type DocTone = 'draft' | 'done' | 'progress' | 'sent' | 'off';

const RECEIPT_TONE: Record<string, DocTone> = { draft: 'draft', posted: 'done', cancelled: 'off' };
const PO_TONE: Record<string, DocTone> = { draft: 'draft', sent: 'sent', partial: 'progress', received: 'done', cancelled: 'off' };

export default function StatusPill({ kind, status, label }: { kind: 'receipt' | 'po'; status: string; label: string }) {
  const tone = (kind === 'receipt' ? RECEIPT_TONE : PO_TONE)[status] ?? 'draft';
  return <span className={`rc-pill rc-pill--${tone}`}>{label}</span>;
}
