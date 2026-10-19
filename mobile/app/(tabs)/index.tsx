import { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { Text } from '@/components/ui/Text';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth, useCan } from '@/lib/auth';
import { api, errMsg } from '@/lib/api';
import { useTheme, tabular } from '@/lib/theme';
import { fmtMoney, fmtCompact, fmtDayMonth, greeting, isOverdue, isToday, payLabel } from '@/lib/format';
import { useDict, tr } from '@/lib/i18n';
import {
  Screen, TopBar, IconButton, Group, GroupLink, Cell, Avatar, AmountColumn, Pill, StatCard, TileGrid, BrandMark, EmptyState, ErrorState, InlineError, Loading,
  type TileItem,
} from '@/components/ui';
import { OfflineBanner } from '@/components/OfflineBanner';

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
  const [heroSize, setHeroSize] = useState({ w: 0, h: 0 });
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

  const bar = (
    <TopBar
      left={<BrandMark size={40} />}
      title={me?.org.name ?? 'Savora'}
      subtitle={`${greeting()}, ${me?.user.username ?? ''}`}
      actions={<IconButton icon="scan-outline" label={d.common.barcodeScanner} onPress={() => router.push('/scan')} />}
    />
  );

  // Modullar — faqat shu do'konda yoqilgan va ruxsat berilgan bo'limlar
  const modules: TileItem[] = [
    { key: 'sale', label: d.tabs.newSale, icon: 'add-circle', color: c.sq.b, onPress: () => router.push('/sale-new') },
    { key: 'sales', label: d.home.allSales, icon: 'receipt', color: c.sq.b, onPress: () => router.push('/(tabs)/sales') },
    {
      key: 'debt', label: d.home.debtors, icon: 'alert-circle', color: c.sq.r,
      badge: sum && sum.debtTotal > 0 ? fmtCompact(sum.debtTotal) : undefined,
      onPress: () => router.push('/(tabs)/sales?type=debt'),
    },
    ...(can('product.create') ? [{ key: 'add', label: me?.terms?.addItem ?? d.terms.addItem, icon: 'cube' as const, color: c.sq.o, onPress: () => router.push('/product-new') }] : []),
    ...(f.kassa && can('kassa.view') ? [{ key: 'shifts', label: d.profile.shifts, icon: 'time' as const, color: c.sq.o, onPress: () => router.push('/shifts') }] : []),
    ...(f.transferred && can('transfer.create') ? [{ key: 'transfer', label: d.home.transfer, icon: 'swap-horizontal' as const, color: c.sq.g, onPress: () => router.push('/transfer') }] : []),
    ...(f.kirimChiqim && isAdmin ? [{ key: 'kc', label: d.home.kirimChiqim, icon: 'cash' as const, color: c.sq.o, onPress: () => router.push('/kirim-chiqim') }] : []),
    ...(f.tasks ? [{ key: 'tasks', label: d.profile.tasks, icon: 'checkmark-done' as const, color: c.sq.a, onPress: () => router.push('/tasks') }] : []),
    ...(f.users && isAdmin ? [{ key: 'branches', label: d.home.branches, icon: 'business' as const, color: c.sq.b, onPress: () => router.push('/branches') }] : []),
  ];

  if (loading) return <Screen bar={bar}><Loading /></Screen>;
  if (!sum && error) return <Screen bar={bar} onRefresh={() => { setRefreshing(true); load(); }} refreshing={refreshing}><OfflineBanner /><ErrorState message={error} onRetry={() => { setLoading(true); load(); }} /></Screen>;

  return (
    <Screen bar={bar} refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} gap={14}>
      <OfflineBanner />
      {error ? <InlineError message={error} onRetry={load} /> : null}

      {me && !me.org.active ? (
        <Group>
          <Cell icon="warning" iconColor={c.sq.a} title={d.home.subExpired} subtitle={d.home.subExpiredHint} subtitleLines={2} />
        </Group>
      ) : null}

      <View
        style={[s.hero, { backgroundColor: c.hero2 }]}
        onLayout={(e) => { const { width, height } = e.nativeEvent.layout; setHeroSize({ w: width, h: height }); }}
        accessible accessibilityLabel={tr(d.home.todayRevenueA11y, { v: fmtMoney(sum?.todayRevenue, { suffix: true }) })}>
        <Svg width={heroSize.w} height={heroSize.h} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <LinearGradient id="heroGrad" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={c.hero} />
              <Stop offset="1" stopColor={c.hero2} />
            </LinearGradient>
          </Defs>
          <Rect width={heroSize.w} height={heroSize.h} fill="url(#heroGrad)" />
        </Svg>
        {/* Bezak — brend belgisidagi o'sib boruvchi ustunlar */}
        <View style={s.heroDeco} pointerEvents="none">
          <View style={[s.heroBar, { height: 34, opacity: 0.1 }]} />
          <View style={[s.heroBar, { height: 54, opacity: 0.14 }]} />
          <View style={[s.heroBar, { height: 76, opacity: 0.18 }]} />
        </View>
        <View style={s.heroTop}>
          <Text style={s.heroL}>{d.home.todayRevenue}</Text>
          <View style={s.heroDate}><Text style={s.heroDateT}>{fmtDayMonth(new Date())}</Text></View>
        </View>
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
          icon="alarm-outline"
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

      <Group header={d.home.recentSales} icon="receipt-outline" headerRight={<GroupLink title={d.common.all} onPress={() => router.push('/(tabs)/sales')} />}>
        {recent.length === 0 ? (
          <EmptyState icon="bar-chart-outline" title={d.home.noSales} message={d.home.noSalesHint} />
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

      <Group header={d.home.modules} icon="grid-outline">
        <TileGrid items={modules} />
      </Group>
    </Screen>
  );
}

const s = StyleSheet.create({
  hero: { borderRadius: 24, padding: 18, gap: 4, overflow: 'hidden' },
  heroDeco: { position: 'absolute', right: 18, bottom: 0, flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  heroBar: { width: 18, borderTopLeftRadius: 9, borderTopRightRadius: 9, backgroundColor: '#fff' },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  heroDate: { backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  heroDateT: { color: '#fff', fontSize: 12, fontWeight: '600' },
  heroL: { color: 'rgba(255,255,255,0.9)', fontSize: 16, fontWeight: '700' },
  heroV: { color: '#fff', fontSize: 42, fontWeight: '800', letterSpacing: -1.4 },
  heroSuffix: { fontSize: 17, fontWeight: '600', letterSpacing: 0 },
  heroRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 2, marginTop: 2 },
  heroR: { color: 'rgba(255,255,255,0.92)', fontSize: 15, fontWeight: '600' },
  mini: { flexDirection: 'row', gap: 10 },
});
