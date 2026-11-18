import { useCallback, useRef } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useResource } from '@/lib/hooks';
import { useTheme } from '@/lib/theme';
import { fmtDate, fmtDateTime, fmtMoney } from '@/lib/format';
import { qtyWithUnit } from '@/lib/qty';
import { useDict, tr } from '@/lib/i18n';
import { RECEIPT_TONE, type ReceiptView } from '@/lib/production';
import {
  Screen, NavBar, LargeTitle, Group, Cell, Pill, Loading, ErrorState, InlineError, AmountColumn,
} from '@/components/ui';

/** Kirim akti tafsiloti (faqat o'qish): yetkazib beruvchi, ombor, nakladnoy, qatorlar (asosiy birlikda ham), jami */
export default function ReceiptDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const d = useDict();
  const r = d.production.receipts;
  const units = d.productFields.units;
  const res = useResource<{ receipt: ReceiptView }>(id ? `/api/mobile/production/receipts/${encodeURIComponent(id)}` : null);
  const first = useRef(true);
  const { reloadSilently } = res;
  useFocusEffect(useCallback(() => { if (first.current) { first.current = false; return; } reloadSilently(); }, [reloadSilently]));

  const header = <NavBar backLabel={r.title} />;
  const x = res.data?.receipt;
  if (res.loading && !x) return <Screen header={header}><Loading /></Screen>;
  if (!x) return <Screen header={header}><ErrorState message={res.error} onRetry={res.retry} /></Screen>;

  const prices = x.can.viewPrices;
  const money = (n: number | null) => (n === null ? r.priceHidden : fmtMoney(n, { suffix: true }));

  return (
    <Screen header={header} refreshing={res.refreshing} onRefresh={res.refresh} gap={14}>
      <LargeTitle title={x.docNo} subtitle={x.supplierName ?? r.noSupplier} />
      {res.error ? <InlineError message={res.error} onRetry={res.retry} /> : null}

      <Group>
        <Cell title={d.common.info} right={<Pill label={d.production.receiptStatuses[x.status]} tone={RECEIPT_TONE[x.status]} />} />
        <Cell title={r.supplier} value={x.supplierName ?? r.noSupplier} wrapValue />
        <Cell title={r.warehouse} value={x.branchName ?? '—'} wrapValue />
        {x.supplierInvoiceNo || x.invoiceDate ? (
          <Cell title={r.invoice} value={[x.supplierInvoiceNo ? `№ ${x.supplierInvoiceNo}` : null, x.invoiceDate ? fmtDate(x.invoiceDate) : null].filter(Boolean).join(' · ')} wrapValue />
        ) : null}
        {x.purchaseOrderNo ? <Cell title={r.purchaseOrder} value={x.purchaseOrderNo} /> : null}
        <Cell title={r.created} value={tr(r.byLine, { date: fmtDateTime(x.createdAt), by: x.createdBy })} wrapValue />
        {x.postedAt ? <Cell title={r.posted} value={tr(r.byLine, { date: fmtDateTime(x.postedAt), by: x.postedBy ?? '—' })} wrapValue /> : null}
        {x.note ? <Cell title={d.common.note} value={x.note} wrapValue /> : null}
      </Group>

      <Group header={`${r.lines} · ${x.lines.length}`} icon="list-outline">
        {x.lines.map((l) => {
          const entered = qtyWithUnit(l.qty, l.unit, units);
          const base = l.factor !== 1 ? tr(r.baseLine, { qty: qtyWithUnit(l.baseQty, l.baseUnit, units) }) : null;
          const sub = [
            [l.code ? l.code : null, entered + (base ? ` ${base}` : '')].filter(Boolean).join(' · '),
            l.expiryDate ? tr(r.expiry, { date: fmtDate(l.expiryDate) }) : null,
            prices && l.price !== null ? `${fmtMoney(l.price)} × ${entered}` : null,
          ].filter(Boolean).join('\n');
          return (
            <Cell
              key={l.id}
              title={l.name}
              titleLines={2}
              subtitle={sub}
              subtitleLines={3}
              right={prices ? (
                <AmountColumn amount={l.amount !== null ? fmtMoney(l.amount) : '—'} color={l.priced ? undefined : c.ink3} />
              ) : undefined}
            />
          );
        })}
      </Group>

      {prices ? (
        <Group>
          <Cell title={r.total} value={money(x.total)} valueStrong />
          {x.paidNow ? <Cell title={r.paidNow} value={money(x.paidNow)} /> : null}
          {x.debt ? <Cell title={r.debt} value={money(x.debt)} valueColor={c.bad} /> : null}
          {x.unpriced > 0 ? <Cell title={tr(r.unpriced, { n: x.unpriced })} icon="alert-circle" iconColor={c.sq.a} /> : null}
        </Group>
      ) : (
        <Group footer={r.readOnly}>
          <Cell title={r.total} value={r.priceHidden} />
        </Group>
      )}
    </Screen>
  );
}
