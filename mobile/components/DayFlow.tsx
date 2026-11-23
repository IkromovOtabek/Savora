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
import { Group, Cell, StatCard, EmptyState, type IconName } from '@/components/ui';

type Kind = 'salePay' | 'debtPay' | 'bank' | 'income' | 'expense' | 'refund' | 'supplier';
interface Row {
  id: string; at: string; kind: Kind; dir: 'in' | 'out'; amount: number; title: string;
  detail: string | null; branch: string | null; method: string | null; saleId: string | null;
}
/** Server `/api/mobile/kassa/day` javobi (web lib/dayFlow.ts) */
export interface DayFlowData {
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
 * Tanlangan kundagi barcha pul harakati (web Kassa → «Kirim-chiqim» bilan bir manba). Kun almashganda
 * oldingi kun ma'lumoti (keepPreviousData) ko'rsatilmaydi — `data` null bo'ladi.
 */
export function useDayFlow(day: DayKey) {
  const res = useResource<DayFlowData>(`/api/mobile/kassa/day?date=${day}`);
  return { res, data: res.data?.date === day ? res.data : null };
}

/** Kun filtri: ‹ · Bugun · Sana (kalendar) · › — kelajakdagi kun tanlanmaydi */
export function DayFilter({ day, onChange }: { day: DayKey; onChange: (d: DayKey) => void }) {
  const { c } = useTheme();
  const d = useDict();
  const k = d.dayFlow;
  const [open, setOpen] = useState(false);
  const today = toDayKey(new Date());
  const isToday = day === today;
  const canNext = day < today;
  const dateLabel = fmtDayMonth(fromDayKey(day));
  const onPick = (p: HomePeriod) => {
    if (p === 'today') onChange(today);
    else if (p === 'yesterday') onChange(shiftDay(today, -1));
    else if (isDayKey(p)) onChange(p);
  };
  const chip = (on: boolean) => ({ backgroundColor: on ? c.tintFill : c.fill });
  const ink = (on: boolean) => (on ? c.onTint : c.ink);

  return (
    <View style={s.bar}>
      <Pressable
        onPress={() => onChange(shiftDay(day, -1))}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={k.prevDay}
        style={({ pressed }) => [s.nav, { backgroundColor: c.fill }, pressed && { opacity: 0.5 }]}
      >
        <Ionicons name="chevron-back" size={20} color={c.ink} />
      </Pressable>
      <Pressable
        onPress={() => onChange(today)}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityState={{ selected: isToday }}
        style={({ pressed }) => [s.chip, chip(isToday), pressed && { opacity: 0.6 }]}
      >
        <Text style={[s.chipT, { color: ink(isToday) }]}>{d.home.periods.today}</Text>
      </Pressable>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityState={{ selected: !isToday }}
        accessibilityLabel={tr(k.pickDayA11y, { day: isToday ? `${d.home.periods.today}, ${dateLabel}` : dateLabel })}
        style={({ pressed }) => [s.chip, s.dateChip, chip(!isToday), pressed && { opacity: 0.6 }]}
      >
        <Ionicons name="calendar-outline" size={16} color={ink(!isToday)} />
        <Text style={[s.chipT, { color: ink(!isToday) }]} numberOfLines={1}>{isToday ? k.pickDate : dateLabel}</Text>
        <Ionicons name="chevron-down" size={14} color={isToday ? c.ink3 : c.onTint} />
      </Pressable>
      <Pressable
        onPress={() => canNext && onChange(shiftDay(day, 1))}
        disabled={!canNext}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={k.nextDay}
        accessibilityState={{ disabled: !canNext }}
        style={({ pressed }) => [s.nav, { backgroundColor: c.fill }, !canNext && { opacity: 0.3 }, pressed && { opacity: 0.5 }]}
      >
        <Ionicons name="chevron-forward" size={20} color={c.ink} />
      </Pressable>
      <PeriodSheet
        visible={open}
        value={normalizeDay(day)}
        onChange={onPick}
        onClose={() => setOpen(false)}
        presets={['today', 'yesterday']}
        title={k.pickDay}
      />
    </View>
  );
}

/** Kun jami: kirim · chiqim · natija */
export function DayStats({ data }: { data: DayFlowData }) {
  const { c } = useTheme();
  const k = useDict().dayFlow;
  return (
    <View style={s.stats}>
      <StatCard label={k.totalIn} value={fmtCompact(data.totals.in)} color={c.ok} />
      <StatCard label={k.totalOut} value={fmtCompact(data.totals.out)} color={c.bad} />
      <StatCard label={k.net} value={fmtCompact(data.totals.net)} color={data.totals.net >= 0 ? c.tint : c.bad} />
    </View>
  );
}

/** Kirim/chiqim tarkibi va kun davomidagi barcha yozuvlar (sotuv qatori — sotuv detaliga) */
export function DayDetails({ data }: { data: DayFlowData }) {
  const { c } = useTheme();
  const k = useDict().dayFlow;
  const router = useRouter();
  const parts = (kinds: Kind[]) => kinds.filter((x) => (data.byKind?.[x] ?? 0) > 0);
  const inParts = parts(IN_KINDS);
  const outParts = parts(OUT_KINDS);

  return (
    <>
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
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nav: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  chip: { minHeight: 40, borderRadius: 20, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  dateChip: { flex: 1, flexDirection: 'row', gap: 6, paddingHorizontal: 12 },
  chipT: { flexShrink: 1, fontSize: 15, fontWeight: '700', ...tabular },
  stats: { flexDirection: 'row', gap: 10 },
});
