import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth, useCan } from '@/lib/auth';
import { useResource } from '@/lib/hooks';
import { useTheme } from '@/lib/theme';
import { fmtMoney } from '@/lib/format';
import { useDict, tr } from '@/lib/i18n';
import { usePolling } from '@/lib/restaurant';
import {
  WAITER_DAY_PERIODS, openBadges, rangeLabel, tkClock, tkDayClock, waiterDayPath,
  type OpenBadge, type WaiterDay, type WaiterDayPeriod,
} from '@/lib/waiterDay';
import {
  Screen, NavBar, LargeTitle, Group, Cell, AmountColumn, Pill, StatCard, SegmentedControl, EmptyState, ErrorState,
  InlineError, Loading, CacheStamp, type Tone,
} from '@/components/ui';

/**
 * Ofitsant kabineti «Mening kunim» — web /app/tables/me bilan bir xil (GET /api/mobile/restaurant/waiter-day).
 * Faqat o'z hisoblari: yopilgan hisoblar, sotuv, o'rtacha chek, mehmonlar, xizmat haqi, bekor qilingan taomlar;
 * hozir ochiq stollarim (bosilsa — buyurtma ekrani) va davrda yopilgan hisoblarim. 30 s da jimgina yangilanadi.
 */
export default function WaiterDayScreen() {
  const { me } = useAuth();
  const router = useRouter();
  const { c } = useTheme();
  const d = useDict();
  const w = d.waiterDay;
  const r = d.restaurant;
  const can = useCan();
  const allowed = !!me?.features?.tables && can('order.create');
  const [period, setPeriod] = useState<WaiterDayPeriod>('today');
  const res = useResource<WaiterDay>(allowed ? waiterDayPath(period) : null);
  usePolling(() => { if (allowed) res.reloadSilently(); }, 30_000);

  const data = res.data;
  const k = data?.totals;
  const multiDay = !!data && data.fromDay !== data.toDay;
  const place = (o: { tableNumber: number | null; orderNo: string }) =>
    (o.tableNumber != null ? tr(r.tableN, { n: o.tableNumber }) : tr(r.takeawayNo, { no: o.orderNo }));
  const badgeText = (b: OpenBadge) =>
    b.kind === 'ready' ? tr(w.ready, { n: b.n })
      : b.kind === 'pending' ? tr(w.pending, { n: b.n })
        : b.kind === 'unsent' ? tr(w.unsent, { n: b.n })
          : w.precheck;
  const badgeTone = (b: OpenBadge): Tone => (b.kind === 'ready' ? 'ok' : b.kind === 'pending' ? 'warn' : b.kind === 'precheck' ? 'br' : 'mut');

  if (!allowed) {
    return (
      <Screen header={<NavBar />}>
        <LargeTitle title={w.title} />
        <EmptyState icon="lock-closed-outline" title={w.title} message={w.noAccess} />
      </Screen>
    );
  }

  return (
    <Screen header={<NavBar />} refreshing={res.refreshing} onRefresh={res.refresh} gap={14}>
      <LargeTitle title={w.title} subtitle={data ? `${data.name} · ${rangeLabel(data.fromDay, data.toDay)}` : undefined} />
      <SegmentedControl
        options={WAITER_DAY_PERIODS.map((p) => ({ key: p, label: w.periods[p] }))}
        value={period}
        onChange={setPeriod}
      />

      {res.loading && !data ? <Loading /> : !data || !k ? <ErrorState message={res.error} onRetry={res.retry} /> : (
        <>
          <CacheStamp of={res} />
          {res.error ? <InlineError message={res.error} onRetry={res.refresh} /> : null}

          <View style={s.row}>
            <StatCard style={s.cell} label={w.kpi.orders} value={String(k.orders)} />
            <StatCard style={s.cell} label={w.kpi.revenue} value={fmtMoney(k.revenue)} note={w.revenueNote} color={c.ok} />
          </View>
          <View style={s.row}>
            <StatCard style={s.cell} label={w.kpi.avgCheck} value={fmtMoney(k.avgCheck)} note={d.format.currency} />
            <StatCard
              style={s.cell} label={w.kpi.guests} value={String(k.guests)}
              note={k.guestsMissing > 0 ? tr(w.guestsMissing, { n: k.guestsMissing }) : undefined}
            />
          </View>
          <View style={s.row}>
            <StatCard style={s.cell} label={w.kpi.serviceCharge} value={fmtMoney(k.serviceCharge)} note={d.format.currency} color={c.gold} />
            <StatCard
              style={s.cell} label={w.kpi.voids} value={String(k.voids)}
              note={k.voids ? (k.lossCount ? tr(w.voidsLoss, { n: k.lossCount }) : fmtMoney(k.voidAmount, { suffix: true })) : w.voidsNone}
              color={k.lossCount ? c.bad : undefined}
            />
          </View>

          <Group header={w.openTitle} icon="restaurant-outline" footer={data.open.length ? w.openHint : undefined}>
            {data.open.length === 0 ? (
              <EmptyState icon="grid-outline" title={w.openEmpty} message={w.openEmptyHint} actionTitle={r.title} onAction={() => router.push('/tables')} />
            ) : data.open.map((o) => {
              const badges = openBadges(o);
              const first = badges[0];
              return (
                <Cell
                  key={o.id}
                  icon={o.tableNumber != null ? 'restaurant' : 'bag-handle'}
                  iconColor={first?.kind === 'ready' ? c.sq.g : c.sq.p}
                  title={place(o)}
                  subtitle={[
                    ...badges.slice(1).map(badgeText),
                    o.guests ? tr(r.guestsN, { n: o.guests }) : '',
                    tr(w.openedAt, { t: tkClock(o.openedAt) }),
                  ].filter(Boolean).join(' · ')}
                  subtitleLines={2}
                  right={(
                    <AmountColumn amount={o.due != null ? fmtMoney(o.due) : '—'}>
                      {first ? <Pill label={badgeText(first)} tone={badgeTone(first)} /> : null}
                    </AmountColumn>
                  )}
                  chevron
                  onPress={() => router.push(`/order/${o.id}`)}
                />
              );
            })}
          </Group>

          <Group
            header={w.closedTitle}
            icon="receipt-outline"
            footer={k.orders > data.closed.length ? tr(w.closedShown, { n: data.closed.length, total: k.orders }) : undefined}
          >
            {data.closed.length === 0 ? (
              <EmptyState icon="time-outline" title={w.closedEmpty} />
            ) : data.closed.map((b) => (
              <Cell
                key={b.id}
                icon="checkmark-circle"
                iconColor={c.sq.g}
                title={place(b)}
                subtitle={[multiDay ? tkDayClock(b.paidAt) : tkClock(b.paidAt), b.guests ? tr(r.guestsN, { n: b.guests }) : '', b.tableNumber != null ? b.orderNo : '']
                  .filter(Boolean).join(' · ')}
                value={fmtMoney(b.total)}
                valueStrong
              />
            ))}
          </Group>
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  cell: { flex: 1 },
});
