import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth, useCan } from '@/lib/auth';
import { api, errMsg } from '@/lib/api';
import { useTheme, tabular } from '@/lib/theme';
import { fmtMoney, fmtCompact, fmtEyebrow, greeting, isOverdue, isToday, payLabel } from '@/lib/format';
import { useDict, tr } from '@/lib/i18n';
import {
  Screen, LargeTitle, IconButton, Group, GroupLink, Cell, Avatar, AmountColumn, Pill, StatCard, ErrorState, InlineError, Loading,
} from '@/components/ui';

interface Summary { inStock: number; todaySales: number; todayRevenue: number; debtTotal: number }
interface Sale {
  id: string; saleNo: string; product: string; customer: string | null; paymentType: string;
  totalAmount: number; remainingAmount: number; installmentMonths: number | null; dueDate: string | null;
}

export default function Home() {
  const { me } = useAuth();
  const router = useRouter();
  const { c } = useTheme();
  const d = useDict();
  const f = me?.features ?? {};
  const can = useCan();
  const isAdmin = !!me?.user.isAdmin;
  const nasiyaOn = !!(f.variant || f.nasiya);

  const [sum, setSum] = useState<Summary | null>(null);
  const [debts, setDebts] = useState<Sale[]>([]);
  const [recent, setRecent] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gen = useRef(0);

  const load = useCallback(async () => {
    const id = ++gen.current;
    const [s, d, r] = await Promise.allSettled([
      api<Summary>('/api/mobile/summary'),
      api<{ items: Sale[] }>('/api/mobile/sales?type=debt'),
      api<{ items: Sale[] }>('/api/mobile/sales?type=all'),
    ]);
    if (id !== gen.current) return;
    if (s.status === 'fulfilled') setSum(s.value);
    if (d.status === 'fulfilled') setDebts(d.value.items);
    if (r.status === 'fulfilled') setRecent(r.value.items.slice(0, 4));
    const failed = [s, d, r].find((x) => x.status === 'rejected') as PromiseRejectedResult | undefined;
    setError(failed ? errMsg(failed.reason) : null);
    setLoading(false); setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  // Boshqa ekrandan qaytganda — jimgina yangilash
  const first = useRef(true);
  useFocusEffect(useCallback(() => { if (first.current) { first.current = false; return; } load(); }, [load]));

  const today = debts.filter((x) => x.remainingAmount > 0 && isToday(x.dueDate));
  const late = debts.filter((x) => x.remainingAmount > 0 && isOverdue(x.dueDate));
  const sumOf = (xs: Sale[]) => xs.reduce((a, x) => a + x.remainingAmount, 0);
  const tasks = [...late, ...today].slice(0, 4);

  if (loading) return <Screen><Loading /></Screen>;
  if (!sum && error) return <Screen onRefresh={() => { setRefreshing(true); load(); }} refreshing={refreshing}><ErrorState message={error} onRetry={() => { setLoading(true); load(); }} /></Screen>;

  return (
    <Screen refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} gap={16}>
      <LargeTitle
        eyebrow={fmtEyebrow()}
        title={me?.org.name ?? 'Savora'}
        subtitle={`${greeting()}, ${me?.user.username ?? ''}`}
        actions={<IconButton icon="scan-outline" label={d.common.barcodeScanner} onPress={() => router.push('/scan')} />}
      />

      {error ? <InlineError message={error} onRetry={load} /> : null}

      {me && !me.org.active ? (
        <Group>
          <Cell icon="warning" iconColor={c.sq.a} title={d.home.subExpired} subtitle={d.home.subExpiredHint} subtitleLines={2} />
        </Group>
      ) : null}

      <View style={[s.hero, { backgroundColor: c.hero }]} accessible accessibilityLabel={tr(d.home.todayRevenueA11y, { v: fmtMoney(sum?.todayRevenue, { suffix: true }) })}>
        <Text style={s.heroL}>{d.home.todayRevenue}</Text>
        <Text style={[s.heroV, tabular]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
          {fmtMoney(sum?.todayRevenue)}<Text style={s.heroSuffix}> {d.format.currency}</Text>
        </Text>
        <View style={s.heroRow}>
          <Text style={[s.heroR, tabular]}>{tr(d.home.salesCount, { n: sum?.todaySales ?? 0 })}</Text>
          <Text style={[s.heroR, tabular]}>{tr(d.home.inStock, { v: fmtMoney(sum?.inStock) })}</Text>
          {sum && sum.debtTotal > 0 ? <Text style={[s.heroR, tabular]} numberOfLines={1}>{tr(d.home.debt, { v: fmtCompact(sum.debtTotal) })}</Text> : null}
        </View>
      </View>

      <View style={s.mini}>
        <StatCard label={d.home.expectedToday} value={fmtCompact(sumOf(today))} note={tr(d.home.customers, { n: today.length })} color={c.gold} />
        <StatCard label={d.home.overdue} value={fmtCompact(sumOf(late))} note={tr(d.home.customers, { n: late.length })} color={c.bad} />
      </View>

      {tasks.length > 0 ? (
        <Group
          header={d.home.todayTasks}
          headerRight={<GroupLink title={d.common.all} onPress={() => router.push(nasiyaOn ? '/(tabs)/nasiya' : '/(tabs)/sales?type=debt')} />}
        >
          {tasks.map((x) => (
            <Cell
              key={x.id}
              left={<Avatar name={x.customer ?? x.product} />}
              title={x.customer ?? x.product}
              subtitle={[x.installmentMonths ? tr(d.common.months, { n: x.installmentMonths }) : payLabel(x.paymentType), x.product].join(' · ')}
              right={<AmountColumn amount={fmtMoney(x.remainingAmount)}><Pill label={isOverdue(x.dueDate) ? d.common.overdue : d.common.today} tone={isOverdue(x.dueDate) ? 'bad' : 'warn'} /></AmountColumn>}
              onPress={() => router.push(`/sale/${x.id}`)}
            />
          ))}
        </Group>
      ) : null}

      <Group header={d.home.recentSales} headerRight={<GroupLink title={d.common.all} onPress={() => router.push('/(tabs)/sales')} />}>
        {recent.length === 0 ? (
          <Cell icon="cart-outline" iconColor={c.sq.g} title={d.home.noSales} subtitle={d.home.noSalesHint} />
        ) : recent.map((x) => (
          <Cell
            key={x.id}
            icon="bag-handle"
            iconColor={x.paymentType === 'installment' ? c.sq.a : x.paymentType === 'cash' ? c.sq.o : c.sq.b}
            title={x.product}
            subtitle={[payLabel(x.paymentType), x.customer].filter(Boolean).join(' · ')}
            value={fmtMoney(x.totalAmount)}
            valueStrong
            chevron
            onPress={() => router.push(`/sale/${x.id}`)}
          />
        ))}
      </Group>

      <Group header={d.home.quick}>
        {nasiyaOn ? <Cell icon="receipt" iconColor={c.sq.b} title={d.home.allSales} chevron onPress={() => router.push('/(tabs)/sales')} /> : null}
        <Cell icon="alert-circle" iconColor={c.sq.r} title={d.home.debtors} value={sum && sum.debtTotal > 0 ? fmtCompact(sum.debtTotal) : undefined} chevron onPress={() => router.push('/(tabs)/sales?type=debt')} />
        {f.transferred && can('transfer.create') ? <Cell icon="swap-horizontal" iconColor={c.sq.g} title={d.home.transfer} chevron onPress={() => router.push('/transfer')} /> : null}
        {f.kirimChiqim && isAdmin ? <Cell icon="cash" iconColor={c.sq.o} title={d.home.kirimChiqim} chevron onPress={() => router.push('/kirim-chiqim')} /> : null}
        {f.users && isAdmin ? <Cell icon="business" iconColor={c.sq.b} title={d.home.branches} chevron onPress={() => router.push('/branches')} /> : null}
      </Group>
    </Screen>
  );
}

const s = StyleSheet.create({
  hero: { borderRadius: 20, padding: 16, gap: 2 },
  heroL: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '500' },
  heroV: { color: '#fff', fontSize: 30, fontWeight: '700', letterSpacing: -0.8 },
  heroSuffix: { fontSize: 17, fontWeight: '600', letterSpacing: 0 },
  heroRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 2, marginTop: 2 },
  heroR: { color: 'rgba(255,255,255,0.92)', fontSize: 13, fontWeight: '500' },
  mini: { flexDirection: 'row', gap: 10 },
});
