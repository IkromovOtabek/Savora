import { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { PeriodSheet } from '@/components/PeriodSheet';
import { useResource } from '@/lib/hooks';
import { useTheme, tabular } from '@/lib/theme';
import { fmtMoney, fmtCompact, fmtDateTime, fmtDayMonth, payMethodLabel } from '@/lib/format';
import { useDict, tr } from '@/lib/i18n';
import { fromDayKey, isDayKey, normalizeDay, toDayKey, type DayKey, type HomePeriod } from '@/lib/homePeriod';
import {
  Screen, NavBar, LargeTitle, Group, Cell, StatCard, Loading, ErrorState, InlineError, CacheStamp, EmptyState, type IconName,
} from '@/components/ui';

type Kind = 'salePay' | 'debtPay' | 'bank' | 'income' | 'expense' | 'refund' | 'supplier';
interface Row {
  id: string; at: string; kind: Kind; dir: 'in' | 'out'; amount: number; title: string;
  detail: string | null; branch: string | null; method: string | null; saleId: string | null;
}
interface Data {
  date: string; scoped: boolean; count: number;
  totals: { in: number; out: number; net: number };
  byKind: Record<Kind, number>;
  rows: Row[];
}

/** Server (web lib/dayFlow.ts) bilan bir tartib */
const IN_KINDS: Kind[] = ['salePay', 'debtPay', 'bank', 'income'];
const OUT_KINDS: Kind[] = ['expense', 'refund', 'supplier'];
const KIND_ICON: Record<Kind, IconName> = {
  salePay: 'cart', debtPay: 'wallet', bank: 'business', income: 'arrow-down',
  expense: 'arrow-up', refund: 'return-down-back', supplier: 'cube',
};

const shiftDay = (k: DayKey, n: number): DayKey => {
  const dt = fromDayKey(k);
  dt.setDate(dt.getDate() + n);
  return toDayKey(dt);
};

/**
 * Kunlik kirim-chiqim — tanlangan kundagi barcha pul harakati (web Kassa → «Kirim-chiqim» bilan bir manba):
 * sotuv va qarz/nasiya to'lovlari, bank tushumi, kirim/xarajatlar, qaytarishlar. Filial login — o'z filiali.
 */
export default function KirimChiqimDay() {
  const { c } = useTheme();
  const d = useDict();
  const k = d.dayFlow;
  const router = useRouter();
  const [day, setDay] = useState<DayKey>(() => toDayKey(new Date()));
  const [pickOpen, setPickOpen] = useState(false);
  const res = useResource<Data>(`/api/mobile/kassa/day?date=${day}`);

  const today = toDayKey(new Date());
  const canNext = day < today;
  const period = normalizeDay(day);
  const dayLabel = period === 'today' || period === 'yesterday'
    ? `${d.home.periods[period]}, ${fmtDayMonth(fromDayKey(day))}`
    : fmtDayMonth(fromDayKey(day));
  const onPick = (p: HomePeriod) => {
    if (p === 'today') setDay(today);
    else if (p === 'yesterday') setDay(shiftDay(today, -1));
    else if (isDayKey(p)) setDay(p);
  };

  // Kun almashganda oldingi kun ma'lumoti (keepPreviousData) ko'rsatilmasin
  const data = res.data?.date === day ? res.data : null;
  const parts = (kinds: Kind[]) => (data ? kinds.filter((x) => (data.byKind?.[x] ?? 0) > 0) : []);
  const inParts = parts(IN_KINDS);
  const outParts = parts(OUT_KINDS);

  return (
    <Screen header={<NavBar />} refreshing={res.refreshing} onRefresh={res.refresh} gap={14}>
      <LargeTitle title={k.title} subtitle={data ? (data.scoped ? k.subBranch : k.subAll) : undefined} />

      <View style={s.dateBar}>
        <Pressable
          onPress={() => setDay(shiftDay(day, -1))}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={k.prevDay}
          style={({ pressed }) => [s.nav, { backgroundColor: c.fill }, pressed && { opacity: 0.5 }]}
        >
          <Ionicons name="chevron-back" size={20} color={c.ink} />
        </Pressable>
        <Pressable
          onPress={() => setPickOpen(true)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={tr(k.pickDayA11y, { day: dayLabel })}
          style={({ pressed }) => [s.dateChip, { backgroundColor: c.fill }, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="calendar-outline" size={16} color={c.ink} />
          <Text style={[s.dateT, { color: c.ink }]} numberOfLines={1}>{dayLabel}</Text>
          <Ionicons name="chevron-down" size={14} color={c.ink3} />
        </Pressable>
        <Pressable
          onPress={() => canNext && setDay(shiftDay(day, 1))}
          disabled={!canNext}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={k.nextDay}
          accessibilityState={{ disabled: !canNext }}
          style={({ pressed }) => [s.nav, { backgroundColor: c.fill }, !canNext && { opacity: 0.3 }, pressed && { opacity: 0.5 }]}
        >
          <Ionicons name="chevron-forward" size={20} color={c.ink} />
        </Pressable>
      </View>

      {!data ? (
        res.error && !res.loading ? <ErrorState message={res.error} onRetry={res.retry} /> : <Loading />
      ) : (
        <>
          <CacheStamp of={res} />
          {res.error ? <InlineError message={res.error} onRetry={res.refresh} /> : null}
          <View style={s.stats}>
            <StatCard label={k.totalIn} value={fmtCompact(data.totals.in)} color={c.ok} />
            <StatCard label={k.totalOut} value={fmtCompact(data.totals.out)} color={c.bad} />
            <StatCard label={k.net} value={fmtCompact(data.totals.net)} color={data.totals.net >= 0 ? c.tint : c.bad} />
          </View>

          {inParts.length > 0 ? (
            <Group header={k.inParts}>
              {inParts.map((x) => (
                <Cell key={x} icon={KIND_ICON[x]} iconColor={c.sq.g} title={k.kinds[x]} value={`+${fmtMoney(data.byKind[x])}`} valueColor={c.ok} valueStrong />
              ))}
            </Group>
          ) : null}
          {outParts.length > 0 ? (
            <Group header={k.outParts}>
              {outParts.map((x) => (
                <Cell key={x} icon={KIND_ICON[x]} iconColor={c.sq.r} title={k.kinds[x]} value={`−${fmtMoney(data.byKind[x])}`} valueColor={c.bad} valueStrong />
              ))}
            </Group>
          ) : null}

          {data.rows.length === 0 ? (
            <EmptyState icon="wallet-outline" title={k.empty} message={k.emptyHint} />
          ) : (
            <Group header={k.rows} footer={data.count > data.rows.length ? tr(k.more, { n: data.rows.length, total: data.count }) : undefined}>
              {data.rows.map((r) => {
                const isIn = r.dir === 'in';
                return (
                  <Cell
                    key={r.id}
                    icon={KIND_ICON[r.kind] ?? 'cash'}
                    iconColor={isIn ? c.sq.g : c.sq.r}
                    title={r.title}
                    subtitle={[fmtDateTime(r.at).slice(-5), k.kinds[r.kind], r.detail, r.branch, r.method ? payMethodLabel(r.method) : null].filter(Boolean).join(' · ')}
                    subtitleLines={2}
                    value={`${isIn ? '+' : '−'}${fmtMoney(r.amount)}`}
                    valueColor={isIn ? c.ok : c.bad}
                    valueStrong
                    chevron={!!r.saleId}
                    onPress={r.saleId ? () => router.push(`/sale/${r.saleId}`) : undefined}
                  />
                );
              })}
            </Group>
          )}
        </>
      )}

      <PeriodSheet
        visible={pickOpen}
        value={period}
        onChange={onPick}
        onClose={() => setPickOpen(false)}
        presets={['today', 'yesterday']}
        title={k.pickDay}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  dateBar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nav: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  dateChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 40, borderRadius: 20, paddingHorizontal: 12 },
  dateT: { flexShrink: 1, fontSize: 15, fontWeight: '700', ...tabular },
  stats: { flexDirection: 'row', gap: 10 },
});
