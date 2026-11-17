import type { ReactNode } from 'react';
import Icon, { type IconName } from '@/components/icons/Icon';
import type { Dict } from '@/lib/i18n/dict';
import { fmtDuration } from '@/lib/restaurant/reports';

/** Restoran hisobotlari: umumiy kichik qismlar (server komponentlar) */

export function Section({ id, title, sub, children }: { id: string; title: string; sub?: string; children: ReactNode }) {
  return (
    <section id={id} className="rr-section" aria-labelledby={`${id}-h`}>
      <div className="rr-section-head">
        <h2 id={`${id}-h`}>{title}</h2>
        {sub && <p>{sub}</p>}
      </div>
      {children}
    </section>
  );
}

export function Panel({ id, title, sub, aside, children }: { id: string; title: string; sub?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="fn-panel rr-panel" aria-labelledby={id}>
      <div className="fn-panel-head rr-panel-head">
        <div>
          <h2 id={id}>{title}</h2>
          {sub && <p>{sub}</p>}
        </div>
        {aside != null && <small>{aside}</small>}
      </div>
      {children}
    </section>
  );
}

export function Empty({ icon, text }: { icon: IconName; text: string }) {
  return (
    <div className="ux-empty rr-empty">
      <span className="ux-empty-ic"><Icon name={icon} size={24} /></span>
      <p>{text}</p>
    </div>
  );
}

/** Davomiylik formatlagich (joriy til) */
export function durFmt(d: Dict): (ms: number | null | undefined) => string {
  const t = { minutes: d.restaurant.common.minutes, hoursMinutes: d.restaurant.reports.hoursMinutes };
  return (ms) => fmtDuration(ms, t);
}

/** O'rtacha (to'ldirilgan bo'lak) + 90-persentil (tik chiziq); shkala — `max` */
export function DurBar({ avg, p90, max }: { avg: number | null; p90: number | null; max: number }) {
  if (avg == null || max <= 0) return null;
  const pct = (v: number) => `${Math.min(100, Math.max(0, (v / max) * 100)).toFixed(1)}%`;
  return (
    <span className="rr-dur" aria-hidden="true">
      <i style={{ width: pct(avg) }} />
      {p90 != null && <b style={{ left: pct(p90) }} />}
    </span>
  );
}

/** Kasrli son: 2.5 → «2,5», 3 → «3» */
export function fmtNum(n: number, digits = 1): string {
  const r = Math.round(n * 10 ** digits) / 10 ** digits;
  return String(r).replace('.', ',');
}
