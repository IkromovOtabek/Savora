import { useCallback, useRef, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { Text } from '@/components/ui/Text';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth, useCan } from '@/lib/auth';
import { useResource } from '@/lib/hooks';
import { useTheme, tabular } from '@/lib/theme';
import { fmtMoney, fmtCompact, fmtDayMonth, greeting, isOverdue, isToday, payLabel } from '@/lib/format';
import { useDict, tr } from '@/lib/i18n';
import {
  Screen, TopBar, IconButton, Group, GroupLink, Cell, Avatar, AmountColumn, Pill, StatCard, TileGrid, BrandMark, EmptyState, ErrorState, InlineError, Loading,
  CacheStamp,
  type TileItem,
} from '@/components/ui';
import { NotifyBellButton } from '@/components/NotifyBellButton';
import { PeriodSheet } from '@/components/PeriodSheet';
import { BranchSheet } from '@/components/BranchSheet';
import { isDayKey, fromDayKey, type HomePeriod } from '@/lib/homePeriod';

interface Summary {
  inStock: number; todaySales: number; todayRevenue: number; debtTotal: number;
  /** Tanlangan davr bo'yicha (eski server javobida bo'lmasligi mumkin — unda bugungi) */
  periodSales?: number; periodRevenue?: number;
}
interface Sale {
  id: string; saleNo: string; product: string; customer: string | null; paymentType: string;
  totalAmount: number; remainingAmount: number; installmentMonths: number | null; dueDate: string | null;
}

export default function Home() {
  const { me, inBranch } = useAuth();
  const router = useRouter();
  const { c } = useTheme();
  const d = useDict();
  const f = me?.features ?? {};
  const can = useCan();
  const isAdmin = !!me?.user.isAdmin;
  const nasiyaOn = !!(f.variant || f.nasiya);
  // Sotuvlar ro'yxati (GET /sales) — faqat sales.view; aks holda 403, shuning uchun so'ralmaydi ham
  const canSales = can('sales.view');

  const [heroSize, setHeroSize] = useState({ w: 0, h: 0 });
  // Davr: preset yoki aniq kun (YYYY-MM-DD) — server lib/period.ts bilan bir xil `?p=`
  const [period, setPeriod] = useState<HomePeriod>('today');
  const [periodOpen, setPeriodOpen] = useState(false);
  // Do'kon nomi → filialga kirish: egasi yoki egasi orqali ochilgan filial hisobi
  const [branchOpen, setBranchOpen] = useState(false);
  const canSwitchBranch = isAdmin || inBranch;

  // Keshdan darhol (oflayn/sekin internetda ham), fonda yangilanadi; davr almashsa — yangisi kelguncha eskisi turadi
  const sumQ = useResource<Summary>(`/api/mobile/summary?p=${period}`);
  const debtsQ = useResource<{ items: Sale[] }>(canSales ? '/api/mobile/sales?type=debt' : null);
  const recentQ = useResource<{ items: Sale[] }>(canSales ? '/api/mobile/sales?type=all' : null);
  const sum = sumQ.data;
  const debts = debtsQ.data?.items ?? [];
  const recent = (recentQ.data?.items ?? []).slice(0, 4);
  // Keshda hech narsa yo'q (birinchi ochilish) — hammasi kelguncha spinner
  const loading = (!sum && sumQ.loading) || (canSales && ((!debtsQ.data && debtsQ.loading) || (!recentQ.data && recentQ.loading)));
  const error = sumQ.error ?? debtsQ.error ?? recentQ.error;
  const refreshing = sumQ.refreshing || debtsQ.refreshing || recentQ.refreshing;
  const refresh = () => { void sumQ.refresh(); if (canSales) { void debtsQ.refresh(); void recentQ.refresh(); } };
  const retry = () => { sumQ.retry(); if (canSales) { debtsQ.retry(); recentQ.retry(); } };

  // Boshqa ekrandan qaytganda — jimgina yangilash (funksiyalar barqaror)
  const first = useRef(true);
  const { reloadSilently: reloadSum } = sumQ;
  const { reloadSilently: reloadDebts } = debtsQ;
  const { reloadSilently: reloadRecent } = recentQ;
  useFocusEffect(useCallback(() => {
    if (first.current) { first.current = false; return; }
    reloadSum(); reloadDebts(); reloadRecent();
  }, [reloadSum, reloadDebts, reloadRecent]));

  const today = debts.filter((x) => x.remainingAmount > 0 && isToday(x.dueDate));
  const late = debts.filter((x) => x.remainingAmount > 0 && isOverdue(x.dueDate));
  const sumOf = (xs: Sale[]) => xs.reduce((a, x) => a + x.remainingAmount, 0);
  const tasks = [...late, ...today].slice(0, 4);

  const bar = (
    <TopBar
      left={<BrandMark size={40} />}
      title={me?.org.name ?? 'Savora'}
      subtitle={inBranch && me?.stockBranch ? tr(d.home.inBranch, { name: me.stockBranch.name }) : `${greeting()}, ${me?.user.username ?? ''}`}
      onTitlePress={canSwitchBranch ? () => setBranchOpen(true) : undefined}
      titleA11y={tr(d.home.branchSwitchA11y, { name: me?.org.name ?? 'Savora' })}
      actions={(
        <>
          {/* Bildirishnomalar (mijoz chaqiruvi, kam qoldiq) — restoran moduli bilan */}
          {f.tables ? <NotifyBellButton /> : null}
          <IconButton icon="scan-outline" label={d.common.barcodeScanner} onPress={() => router.push('/scan')} />
        </>
      )}
    />
  );

  // Modullar — faqat shu do'konda yoqilgan va ruxsat berilgan bo'limlar
  const modules: TileItem[] = [
    // Restoran — ofitsant uchun asosiy ish joyi, shuning uchun birinchi
    ...(f.tables && can('order.create') ? [{ key: 'tables', label: d.restaurant.title, icon: 'restaurant' as const, color: c.sq.p, onPress: () => router.push('/tables') }] : []),
    // Bronlar: ro'yxat va «Keldi» — ofitsant ham; yaratish — reservation.manage (server tekshiradi)
    ...(f.tables && (can('reservation.manage') || can('order.create')) ? [{ key: 'reservations', label: d.reservations.tile, icon: 'calendar' as const, color: c.sq.a, onPress: () => router.push('/reservations') }] : []),
    // Ofitsant kabineti: o'z hisoblari, sotuvi va ochiq stollari (waiter-day.tsx)
    ...(f.tables && can('order.create') ? [{ key: 'waiterDay', label: d.waiterDay.tile, icon: 'today' as const, color: c.sq.g, onPress: () => router.push('/waiter-day') }] : []),
    // Sex: usta/ishchi — ishbay (asosiy ish joyi); omborchi — kirim aktlari (faqat ko'rish; server ruxsati bilan bir xil)
    ...(f.piecework && can('piecework.log') ? [{ key: 'piecework', label: d.production.piecework.tile, icon: 'hammer' as const, color: c.sq.p, onPress: () => router.push('/piecework') }] : []),
    // Server: lib/production/receipts.ts → RECEIPT_READ_PERMS (production.view ham — sex xodimi xom ashyo kelganini ko'radi)
    ...(f.purchasing && (can('receipt.create') || can('po.manage') || can('suppliers.view') || can('production.view'))
      ? [{ key: 'receipts', label: d.production.receipts.tile, icon: 'archive' as const, color: c.sq.t, onPress: () => router.push('/receipts') }] : []),
    ...(can('sale.create') ? [{ key: 'sale', label: d.tabs.newSale, icon: 'add-circle' as const, color: c.sq.b, onPress: () => router.push('/sale-new') }] : []),
    ...(canSales ? [
      { key: 'sales', label: d.home.allSales, icon: 'receipt' as const, color: c.sq.b, onPress: () => router.push('/(tabs)/sales') },
      {
        key: 'debt', label: d.home.debtors, icon: 'alert-circle' as const, color: c.sq.r,
        badge: sum && sum.debtTotal > 0 ? fmtCompact(sum.debtTotal) : undefined,
        onPress: () => router.push('/(tabs)/sales?type=debt'),
      },
    ] : []),
    ...(can('product.create') ? [{ key: 'add', label: me?.terms?.addItem ?? d.terms.addItem, icon: 'cube' as const, color: c.sq.o, onPress: () => router.push('/product-kind') }] : []),
    ...(f.kassa && can('kassa.view') ? [{ key: 'shifts', label: d.profile.shifts, icon: 'time' as const, color: c.sq.o, onPress: () => router.push('/shifts') }] : []),
    // Kunlik kirim-chiqim (web Kassa → «Kirim-chiqim»): server ham kassa moduli + kassa.view tekshiradi
    ...(f.kassa && can('kassa.view') ? [{ key: 'dayFlow', label: d.dayFlow.tile, icon: 'swap-vertical' as const, color: c.sq.g, onPress: () => router.push('/kirim-chiqim-day') }] : []),
    ...(f.transferred && can('transfer.create') ? [{ key: 'transfer', label: d.home.transfer, icon: 'swap-horizontal' as const, color: c.sq.g, onPress: () => router.push('/transfer') }] : []),
    ...(f.kirimChiqim && isAdmin && can('kirimChiqim.manage') ? [{ key: 'kc', label: d.home.kirimChiqim, icon: 'cash' as const, color: c.sq.o, onPress: () => router.push('/kirim-chiqim') }] : []),
    ...(f.daftar && can('daftar.manage') ? [{ key: 'daftar', label: d.daftar.title, icon: 'book' as const, color: c.sq.g, onPress: () => router.push('/daftar') }] : []),
    ...(f.tasks && can('tasks.view') ? [{ key: 'tasks', label: d.profile.tasks, icon: 'checkmark-done' as const, color: c.sq.a, onPress: () => router.push('/tasks') }] : []),
    ...(f.users && isAdmin && can('users.manage') ? [{ key: 'branches', label: d.home.branches, icon: 'business' as const, color: c.sq.b, onPress: () => router.push('/branches') }] : []),
  ];

  const isTodayPeriod = period === 'today';
  const periodName = isDayKey(period) ? fmtDayMonth(fromDayKey(period)) : d.home.periods[period];
  // Sana tugmasi: bugun — «22-noyabr», aniq kun — o'sha sana, boshqa davr — nomi (Hafta, Oy ...)
  const chipLabel = isTodayPeriod ? fmtDayMonth(new Date()) : periodName;
  const revenue = sum?.periodRevenue ?? sum?.todayRevenue;
  const salesN = sum?.periodSales ?? sum?.todaySales ?? 0;

  if (loading) return <Screen bar={bar}><Loading /></Screen>;
  if (!sum && error) return <Screen bar={bar} onRefresh={refresh} refreshing={refreshing}><ErrorState message={error} onRetry={retry} /></Screen>;

  return (
    <Screen bar={bar} refreshing={refreshing} onRefresh={refresh} gap={14}>
      <CacheStamp of={sumQ} />
      {error ? <InlineError message={error} onRetry={refresh} /> : null}

      {me && !me.org.active ? (
        <Group>
          <Cell icon="warning" iconColor={c.sq.a} title={d.home.subExpired} subtitle={d.home.subExpiredHint} subtitleLines={2} />
        </Group>
      ) : null}

      <View
        style={[s.hero, { backgroundColor: c.hero2 }]}
        onLayout={(e) => { const { width, height } = e.nativeEvent.layout; setHeroSize({ w: width, h: height }); }}>
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
          <Text style={s.heroL} numberOfLines={1}>{isTodayPeriod ? d.home.todayRevenue : tr(d.home.periodRevenue, { period: periodName })}</Text>
          <Pressable
            onPress={() => setPeriodOpen(true)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={tr(d.home.pickPeriodA11y, { period: chipLabel })}
            style={({ pressed }) => [s.heroDate, pressed && { opacity: 0.6 }]}
          >
            <Text style={s.heroDateT} numberOfLines={1}>{chipLabel}</Text>
            <Ionicons name="chevron-down" size={14} color="#fff" />
          </Pressable>
        </View>
        {/* Sana tugmasi alohida bosiladi — shuning uchun butun karta emas, summa o'qiladi */}
        <Text
          style={[s.heroV, tabular]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          accessibilityLabel={isTodayPeriod
            ? tr(d.home.todayRevenueA11y, { v: fmtMoney(revenue, { suffix: true }) })
            : tr(d.home.periodRevenueA11y, { period: periodName, v: fmtMoney(revenue, { suffix: true }) })}
        >
          {fmtMoney(revenue)}<Text style={s.heroSuffix}> {d.format.currency}</Text>
        </Text>
        <View style={s.heroRow}>
          <Text style={[s.heroR, tabular]}>{tr(d.home.salesCount, { n: salesN })}</Text>
          <Text style={[s.heroR, tabular]}>{tr(d.home.inStock, { v: fmtMoney(sum?.inStock) })}</Text>
          {sum && sum.debtTotal > 0 ? <Text style={[s.heroR, tabular]} numberOfLines={1}>{tr(d.home.debt, { v: fmtCompact(sum.debtTotal) })}</Text> : null}
        </View>
      </View>

      {canSales ? <View style={s.mini}>
        <StatCard label={d.home.expectedToday} value={fmtCompact(sumOf(today))} note={tr(d.home.customers, { n: today.length })} color={c.gold} />
        <StatCard label={d.home.overdue} value={fmtCompact(sumOf(late))} note={tr(d.home.customers, { n: late.length })} color={c.bad} />
      </View> : null}

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

      {canSales ? <Group header={d.home.recentSales} icon="receipt-outline" headerRight={<GroupLink title={d.common.all} onPress={() => router.push('/(tabs)/sales')} />}>
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
      </Group> : null}

      <Group header={d.home.modules} icon="grid-outline">
        <TileGrid items={modules} />
      </Group>

      <PeriodSheet visible={periodOpen} value={period} onChange={setPeriod} onClose={() => setPeriodOpen(false)} />
      {canSwitchBranch ? <BranchSheet visible={branchOpen} onClose={() => setBranchOpen(false)} /> : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  hero: { borderRadius: 24, padding: 18, gap: 4, overflow: 'hidden' },
  heroDeco: { position: 'absolute', right: 18, bottom: 0, flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  heroBar: { width: 18, borderTopLeftRadius: 9, borderTopRightRadius: 9, backgroundColor: '#fff' },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  heroDate: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 999, paddingLeft: 12, paddingRight: 9, minHeight: 32 },
  heroDateT: { color: '#fff', fontSize: 14, fontWeight: '700' },
  heroL: { flexShrink: 1, color: 'rgba(255,255,255,0.9)', fontSize: 16, fontWeight: '700' },
  heroV: { color: '#fff', fontSize: 42, fontWeight: '800', letterSpacing: -1.4 },
  heroSuffix: { fontSize: 17, fontWeight: '600', letterSpacing: 0 },
  heroRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 2, marginTop: 2 },
  heroR: { color: 'rgba(255,255,255,0.92)', fontSize: 15, fontWeight: '600' },
  mini: { flexDirection: 'row', gap: 10 },
});
