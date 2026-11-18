import Link from 'next/link';
import { redirect } from 'next/navigation';
import { productionCtxFromSession } from '@/lib/production/session';
import { pieceworkSummary } from '@/lib/production/piecework';
import { getI18n } from '@/lib/i18n/server';
import { tr } from '@/lib/i18n/fmt';
import { fmtDate, fmtMoney } from '@/lib/format';
import { fmtQty } from '@/lib/qty';
import { monthLabel } from '@/components/ui/MonthNav';
import PrintButton from '@/components/ui/PrintButton';
import { parsePwRange, pwHref, rangeParams } from '@/components/production/piecework/range';

export async function generateMetadata() {
  const { d } = await getI18n();
  return { title: d.production.piecework.printTitle };
}

/**
 * Ishbay hisob varag'i (A4): davr bo'yicha har ishchi — operatsiyalar kesimi (miqdor, summa), yozildi/tasdiqlandi/
 * to'landi va qoldiq, imzo joylari. Ishchi (`piecework.log`) — faqat o'zi; tasdiqlovchi — hammasi yoki `?w=`.
 */
export default async function PieceworkPrintPage({ searchParams }: { searchParams: Promise<{ m?: string; from?: string; to?: string; w?: string }> }) {
  const sp = await searchParams;
  const ctx = await productionCtxFromSession();
  const { locale, d } = await getI18n();
  const t = d.production.piecework;
  const canApprove = ctx.perms.has('piecework.approve');
  if (!ctx.perms.has('piecework.log') && !canApprove) redirect('/app/locked?p=piecework.log');

  const range = parsePwRange(sp);
  const workerId = canApprove && sp.w && /^[a-f0-9]{24}$/i.test(sp.w) ? sp.w : undefined;
  const r = await pieceworkSummary(ctx, { from: range.from, to: range.to, workerId });
  const periodLabel = range.isRange ? `${fmtDate(range.from)} – ${fmtDate(range.to)}` : monthLabel(range.month, locale);
  const back = pwHref('/app/piecework', { ...rangeParams(range), w: workerId, view: 'summary' });
  const workers = r.ok ? r.data.workers : [];

  return (
    <div className="pw-print">
      <style>{'@media print{@page{size:A4 portrait;margin:12mm}}'}</style>
      <div className="pw-print-bar no-print">
        <Link href={back} className="back-link">{t.printBack}</Link>
        <div className="pw-print-bar-row">
          <p className="pw-muted">{t.printHint}</p>
          {workers.length > 0 && <PrintButton label={d.common.print} />}
        </div>
      </div>

      {!r.ok ? (
        <p className="t-note t-note--warn" role="alert">{r.error}</p>
      ) : workers.length === 0 ? (
        <p className="t-note t-note--info no-print">{t.printEmpty}</p>
      ) : (
        <article className="pw-sheet">
          <header className="pw-sheet-head">
            <div>
              <h1>{t.printTitle}</h1>
              <p>{ctx.orgName}</p>
            </div>
            <dl>
              <div><dt>{t.printPeriod}</dt><dd>{periodLabel}</dd></div>
              {workers.length === 1 && <div><dt>{t.printWorker}</dt><dd>{workers[0].workerName}</dd></div>}
            </dl>
          </header>

          {workers.map((w) => (
            <section key={w.workerId} className="pw-sheet-worker">
              <h2>{w.workerName}</h2>
              <table className="pw-sheet-table">
                <thead>
                  <tr>
                    <th>{t.colOperation}</th>
                    <th className="num">{t.colQty}</th>
                    <th className="num">{t.colAmount}</th>
                  </tr>
                </thead>
                <tbody>
                  {w.byOperation.map((o) => (
                    <tr key={o.operation}>
                      <td>{o.operation}</td>
                      <td className="num">{fmtQty(o.qty)}</td>
                      <td className="num">{fmtMoney(o.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th>{t.colEarned}</th>
                    <th />
                    <th className="num">{fmtMoney(w.logged.amount + w.approved.amount + w.paid.amount)}</th>
                  </tr>
                </tfoot>
              </table>
              <dl className="pw-sheet-sums">
                <div><dt>{t.colLogged}</dt><dd>{fmtMoney(w.logged.amount)}</dd></div>
                <div><dt>{t.colApproved}</dt><dd>{fmtMoney(w.approved.amount)}</dd></div>
                <div><dt>{t.colPaid}</dt><dd>{fmtMoney(w.paid.amount)}</dd></div>
                <div className="pw-sheet-due"><dt>{t.colDue}</dt><dd>{fmtMoney(w.due)} {d.common.sum}</dd></div>
              </dl>
              <div className="pw-sheet-sign">
                <span>{t.printWorkerSign}: ____________________</span>
              </div>
            </section>
          ))}

          <footer className="pw-sheet-foot">
            <span>{t.printChief}: ____________________</span>
            <span>{t.printAccountant}: ____________________</span>
            <small>{tr(t.printMade, { date: fmtDate(new Date()) })}</small>
          </footer>
        </article>
      )}
    </div>
  );
}
