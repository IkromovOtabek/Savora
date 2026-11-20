import type { Dict } from '@/lib/i18n/dict';
import { tr } from '@/lib/i18n/fmt';
import type { PrintJobView } from '@/lib/restaurant/printQueue';
import { hhmm, ticketMeta, ticketPlace, ticketQty } from './printLogic';

/**
 * Oshxona varag'i (termal rulon, 58/80 mm): stansiya va vaqt, stol/saboy, buyurtma raqami, taomlar
 * (modifikator, izoh), buyurtma izohi. Narx chiqmaydi. `void` — «BEKOR QILINDI / TAYYORLAMANG!»,
 * qayta chop etilgan — «NUSXA». Ekranda ko'rinish (preview) va chop etish uchun bir xil.
 */
export default function KitchenTicket({ job, d, test = false }: { job: PrintJobView; d: Dict; test?: boolean }) {
  const p = d.restaurant.print;
  const isVoid = job.kind === 'void';
  return (
    <article className={`kt${isVoid ? ' kt--void' : ''}`} aria-label={`${job.stationName} · ${ticketPlace(job, d)}`}>
      {test && <div className="kt-banner">{p.ticketTest}</div>}
      {isVoid && <div className="kt-banner kt-banner--void">{p.ticketVoid}</div>}
      {job.copy && <div className="kt-banner kt-banner--copy">{p.ticketCopy}</div>}
      <div className="kt-head">
        <span className="kt-station">{job.stationName}</span>
        <span className="kt-time">{hhmm(job.queuedAt)}</span>
      </div>
      <div className="kt-place">{ticketPlace(job, d)}</div>
      <div className="kt-meta">{ticketMeta(job, d)}</div>
      <hr className="kt-cut" />
      <ul className="kt-lines">
        {job.lines.map((l, i) => (
          <li key={i} className="kt-line">
            <div className="kt-line-main">
              <span className="kt-qty">{ticketQty(l, d)}</span>
              <span className={`kt-name${isVoid ? ' kt-name--void' : ''}`}>{l.name}</span>
              {l.fromQr && <span className="kt-tag">{p.ticketQr}</span>}
            </div>
            {l.modifiers.map((m, k) => <div key={k} className="kt-mod">+ {m.name}</div>)}
            {l.note && <div className="kt-note">! {l.note}</div>}
            {isVoid && l.reason && <div className="kt-note">{tr(p.ticketReason, { reason: l.reason })}</div>}
          </li>
        ))}
      </ul>
      {isVoid && <div className="kt-banner kt-banner--void">{p.ticketVoidHint}</div>}
      {job.orderNote && (
        <>
          <hr className="kt-cut" />
          <div className="kt-order-note">{tr(p.ticketNote, { note: job.orderNote })}</div>
        </>
      )}
    </article>
  );
}
