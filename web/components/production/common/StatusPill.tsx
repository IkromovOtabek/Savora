import type { Dict } from '@/lib/i18n/dict';
import type { ProductionStatus } from '@/lib/production/calc';

const TONE: Record<ProductionStatus, string> = {
  draft: '',
  in_progress: ' pr-pill--info',
  done: ' pr-pill--ok',
  cancelled: ' pr-pill--bad',
};

/** Akt holati yorlig'i (server va client'da) */
export default function StatusPill({ status, d }: { status: ProductionStatus; d: Dict }) {
  return <span className={`t-pill pr-pill${TONE[status]}`}>{d.production.common.orderStatuses[status]}</span>;
}
