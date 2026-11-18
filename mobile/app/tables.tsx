import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, Alert, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { errMsg } from '@/lib/api';
import { useCachedState } from '@/lib/hooks';
import { useTheme, tabular, MAX_CONTENT, type Palette } from '@/lib/theme';
import { fmtCompact, fmtMoney } from '@/lib/format';
import { useDict, tr } from '@/lib/i18n';
import {
  restaurantApi, usePolling, newClientKey, isNetErr, fmtDur, sinceMs,
  type TablesBoard, type TableRow, type OrderSummary, type CallKind,
} from '@/lib/restaurant';
import {
  Screen, NavBar, LargeTitle, SegmentedControl, Chips, Group, Cell, Button, Pill, Stepper, Sheet, Loading, ErrorState,
  InlineError, CacheStamp, EmptyState, useLayout,
} from '@/components/ui';

type Filter = 'all' | 'mine' | 'free';
const GUEST_PRESETS = [1, 2, 3, 4, 5, 6, 8];

/** Stol holati → rang va yorliq (ofitsant bir qarashda ajratsin) */
function tableLook(t: TableRow, c: Palette) {
  const o = t.order;
  if (!o) return { bg: c.cell, fg: c.ink, sub: c.ink3 };
  if (!o.access) return { bg: c.fill, fg: c.ink2, sub: c.ink3 };
  if (o.status === 'precheck') return { bg: c.goldSoft, fg: c.gold, sub: c.ink2 };
  return { bg: c.tintSoft, fg: c.tint, sub: c.ink2 };
}

const hasCall = (t: TableRow) => !!(t.calls.waiterAt || t.calls.billAt);
/** Chaqiruvni ko'rsatamiz: bo'sh stol yoki buyurtmasi menga ochiq stol */
const callVisible = (t: TableRow) => hasCall(t) && (!t.order || t.order.access);

/** Ofitsant ekrani — zal tanlash, stollar to'ri, chaqiruvlar, saboy. Polling 5 s (fokusda). */
export default function Tables() {
  const router = useRouter();
  const { c } = useTheme();
  const d = useDict();
  const r = d.restaurant;
  const L = useLayout();

  const [branchId, setBranchId] = useState<string | null>(null);
  // Oxirgi holat telefonda saqlanadi: qayta ochilganda / internet yo'q paytda stollar darhol ko'rinadi (polling o'zgarmagan)
  const [board, setBoard, boardAt] = useCachedState<TablesBoard>(['restaurant', 'tables', branchId ?? '']);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [hall, setHall] = useState<string>('all');
  const [acking, setAcking] = useState<string | null>(null);
  const ackRef = useRef(false);
  const gen = useRef(0);
  const inFlight = useRef(false);

  const load = useCallback(async (mode: 'initial' | 'refresh' | 'silent') => {
    if (mode === 'silent' && inFlight.current) return;
    const id = ++gen.current;
    inFlight.current = true;
    if (mode === 'refresh') setRefreshing(true);
    try {
      const b = await restaurantApi.tables(branchId);
      if (id !== gen.current) return;
      setBoard(b); setError(null);
    } catch (e) {
      if (id === gen.current) setError(errMsg(e));
    } finally {
      if (mode === 'refresh') setRefreshing(false);
      if (id === gen.current) { inFlight.current = false; setLoading(false); }
    }
  }, [branchId]);

  useEffect(() => { setLoading(true); load('initial'); }, [load]);
  usePolling(() => load('silent'), 5000);

  // Zal o'chirilsa yoki filial almashsa — tanlov «Barcha zallar»ga qaytadi
  useEffect(() => {
    if (board && hall !== 'all' && !board.halls.some((h) => h.id === hall)) setHall('all');
  }, [board, hall]);

  /* ───── stol ochish ───── */
  const [openFor, setOpenFor] = useState<TableRow | null>(null);
  const [guests, setGuests] = useState(2);
  const [busy, setBusyState] = useState(false);
  const busyRef = useRef(false); // bir kadrdagi ikki bosish — bitta so'rov
  const setBusy = (v: boolean) => { busyRef.current = v; setBusyState(v); };
  // Bitta ochish urinishi — bitta kalit: javob kelmay qolib qayta bosilsa ham server ikkinchi buyurtma ochmaydi
  const openKey = useRef<{ target: string; key: string } | null>(null);
  const keyFor = (target: string) => {
    if (openKey.current?.target !== target) openKey.current = { target, key: newClientKey() };
    return openKey.current.key;
  };

  /** Yangi ochilgan buyurtma — darhol menyuga (orqaga bosilsa buyurtma ekrani) */
  function goOrder(o: { id: string; branchId: string; tableNumber: number | null; orderNo: string }, withMenu: boolean) {
    router.push(`/order/${o.id}`);
    if (!withMenu) return;
    const title = o.tableNumber !== null ? tr(r.tableN, { n: o.tableNumber }) : tr(r.takeawayNo, { no: o.orderNo });
    router.push(`/order-menu?orderId=${encodeURIComponent(o.id)}&branchId=${encodeURIComponent(o.branchId)}&title=${encodeURIComponent(title)}`);
  }

  async function openTable() {
    if (!openFor || busyRef.current) return;
    setBusy(true);
    try {
      const res = await restaurantApi.open({ type: 'dine_in', tableId: openFor.id, guests, clientOrderId: keyFor(`t:${openFor.id}`) });
      openKey.current = null;
      setOpenFor(null);
      goOrder(res.order, !res.existing);
      load('silent');
    } catch (e) {
      Alert.alert(d.common.error, isNetErr(e) ? r.netError : errMsg(e));
      if (!isNetErr(e)) load('silent');
    } finally { setBusy(false); }
  }

  async function newTakeaway() {
    if (busyRef.current || !board) return;
    setBusy(true);
    try {
      const res = await restaurantApi.open({
        type: 'takeaway',
        // Admin — tanlangan filialda; filial xodimida server o'z filialini oladi
        branchId: board.branches.length ? board.branchId : undefined,
        clientOrderId: keyFor(`takeaway:${board.branchId}`),
      });
      openKey.current = null;
      goOrder(res.order, true);
      load('silent');
    } catch (e) {
      Alert.alert(d.common.error, isNetErr(e) ? r.netError : errMsg(e));
    } finally { setBusy(false); }
  }

  function onTable(t: TableRow) {
    const o = t.order;
    if (!o) { setGuests(2); setOpenFor(t); return; }
    if (o.access) { router.push(`/order/${o.id}`); return; }
    Alert.alert(r.busyTitle, tr(r.busyMsg, { n: t.number, name: o.waiterName ?? '—' }));
  }

  async function ack(t: TableRow, kind: CallKind) {
    const k = `${t.id}:${kind}`;
    if (ackRef.current) return;
    ackRef.current = true;
    setAcking(k);
    try {
      await restaurantApi.ackCall(t.id, kind);
      // Darhol yashiramiz — keyingi polling tasdiqlaydi (ack'dan oldin boshlangan polling javobi tashlanadi)
      gen.current++;
      inFlight.current = false;
      setBoard((b) => b && {
        ...b,
        tables: b.tables.map((x) => (x.id === t.id ? { ...x, calls: { ...x.calls, [kind === 'waiter' ? 'waiterAt' : 'billAt']: null } } : x)),
      });
    } catch (e) {
      Alert.alert(d.common.error, isNetErr(e) ? r.netError : errMsg(e));
    } finally { ackRef.current = false; setAcking(null); }
  }

  /* ───── ko'rinish ───── */
  const halls = board?.halls ?? [];
  const shown = useMemo(() => (board?.tables ?? []).filter((t) => {
    if (hall !== 'all' && t.hallId !== hall) return false;
    if (filter === 'mine') return !!t.order?.mine;
    if (filter === 'free') return !t.order;
    return true;
  }), [board, hall, filter]);

  const calls = useMemo(() => {
    const out: { t: TableRow; kind: CallKind; at: string }[] = [];
    for (const t of board?.tables ?? []) {
      if (!callVisible(t)) continue;
      if (filter === 'mine' && t.order && !t.order.mine) continue;
      if (t.calls.billAt) out.push({ t, kind: 'bill', at: t.calls.billAt });
      if (t.calls.waiterAt) out.push({ t, kind: 'waiter', at: t.calls.waiterAt });
    }
    return out.sort((a, b) => a.at.localeCompare(b.at));
  }, [board, filter]);

  const takeaway = board?.takeaway ?? [];
  const mineCount = (board?.tables ?? []).filter((t) => t.order?.mine).length;
  const freeCount = (board?.tables ?? []).filter((t) => !t.order).length;
  const branchName = board?.branches.find((b) => b.id === board.branchId)?.name;

  // To'r: telefonda 3 ustun, kengroqda 4
  const contentW = Math.min(L.width, MAX_CONTENT) - L.padX * 2;
  const cols = contentW >= 420 ? 4 : 3;
  const GAP = 10;
  const tileW = Math.floor((contentW - GAP * (cols - 1)) / cols);

  const header = <NavBar />;
  const title = <LargeTitle title={r.title} subtitle={branchName} />;

  if (loading && !board) return <Screen header={header}>{title}<Loading /></Screen>;
  if (!board) return <Screen header={header}>{title}<ErrorState message={error} onRetry={() => { setLoading(true); load('initial'); }} /></Screen>;

  const renderTile = (t: TableRow) => {
    const o = t.order;
    const look = tableLook(t, c);
    const ready = o?.counts?.ready ?? 0;
    const pending = o?.counts?.pending ?? 0;
    const call = callVisible(t);
    const status = !o ? `${r.free} · ${tr(r.seatsN, { n: t.seats })}`
      : !o.access ? (o.waiterName ?? r.busy)
      : o.status === 'precheck' ? r.precheck
      : o.guests ? tr(r.guestsN, { n: o.guests }) : r.statuses.open;
    // Ochiq summa (o'z stoli); hali taom yo'q yoki boshqa ofitsant stoli — ochilganidan beri vaqt
    const bottom = o?.access && o.due ? fmtCompact(o.due) : o ? fmtDur(sinceMs(o.openedAt)) : '';
    return (
      <Pressable
        key={t.id}
        onPress={() => onTable(t)}
        accessibilityRole="button"
        accessibilityLabel={[tr(r.tableN, { n: t.number }), status, call ? r.calls : '', ready ? tr(r.readyN, { n: ready }) : ''].filter(Boolean).join(', ')}
        style={({ pressed }) => [
          s.tile,
          { width: tileW, backgroundColor: look.bg, borderColor: call ? c.bad : ready ? c.ok : o ? 'transparent' : c.sep },
          (call || ready > 0) && { borderWidth: 2 },
          pressed && { opacity: 0.6 },
        ]}
      >
        <View style={s.tileTop}>
          <Text style={[s.num, tabular, { color: look.fg }]} numberOfLines={1} adjustsFontSizeToFit>{t.number}</Text>
          <View style={s.icons}>
            {t.calls.billAt && call ? <Ionicons name="receipt" size={18} color={c.gold} /> : null}
            {t.calls.waiterAt && call ? <Ionicons name="notifications" size={18} color={c.bad} /> : null}
            {o?.mine ? <Ionicons name="person" size={15} color={c.tint} /> : null}
          </View>
        </View>
        <Text style={[s.tileSub, { color: look.sub }]} numberOfLines={1}>{status}</Text>
        <View style={s.tileBottom}>
          {bottom ? <Text style={[s.tileSum, tabular, { color: look.fg }]} numberOfLines={1}>{bottom}</Text> : <View />}
          {ready > 0 ? <View style={[s.badge, { backgroundColor: c.ok }]}><Text style={s.badgeT}>{ready}</Text></View>
            : pending > 0 ? <View style={[s.badge, { backgroundColor: c.gold }]}><Text style={s.badgeT}>QR</Text></View> : null}
        </View>
      </Pressable>
    );
  };

  const grid = (list: TableRow[]) => <View style={[s.grid, { gap: GAP }]}>{list.map(renderTile)}</View>;
  const groupedByHall = hall === 'all' && halls.length > 1;

  return (
    <Screen header={header} refreshing={refreshing} onRefresh={() => load('refresh')} gap={14}>
      {title}
      <CacheStamp of={{ updatedAt: boardAt, fromCache: !!error }} />
      {error ? <InlineError message={error} onRetry={() => load('silent')} /> : null}

      {board.branches.length > 1 ? (
        <Chips options={board.branches.map((b) => ({ key: b.id, label: b.name }))} value={branchId ?? board.branchId} onChange={(k) => { setBranchId(k); setHall('all'); }} />
      ) : null}

      <SegmentedControl<Filter>
        options={[
          { key: 'all', label: r.filterAll },
          { key: 'mine', label: mineCount ? `${r.filterMine} · ${mineCount}` : r.filterMine },
          { key: 'free', label: freeCount ? `${r.filterFree} · ${freeCount}` : r.filterFree },
        ]}
        value={filter}
        onChange={setFilter}
      />

      {halls.length > 1 ? (
        <Chips options={[{ key: 'all', label: r.allHalls }, ...halls.map((h) => ({ key: h.id, label: h.name }))]} value={hall} onChange={setHall} />
      ) : null}

      {calls.length ? (
        <Group header={r.calls} icon="notifications-outline">
          {calls.map(({ t, kind, at }) => (
            <Cell
              key={`${t.id}:${kind}`}
              icon={kind === 'bill' ? 'receipt' : 'notifications'}
              iconColor={kind === 'bill' ? c.sq.a : c.sq.r}
              title={`${tr(r.tableN, { n: t.number })} · ${kind === 'bill' ? r.callBill : r.callWaiter}`}
              subtitle={[tr(r.ago, { v: fmtDur(sinceMs(at)) }), t.order?.waiterName].filter(Boolean).join(' · ')}
              onPress={() => onTable(t)}
              right={<Button title={r.ack} size="sm" variant="tinted" loading={acking === `${t.id}:${kind}`} onPress={() => ack(t, kind)} />}
            />
          ))}
        </Group>
      ) : null}

      {board.tables.length === 0 ? (
        <EmptyState icon="restaurant-outline" title={r.title} message={r.noHalls} />
      ) : shown.length === 0 ? (
        <EmptyState icon="grid-outline" title={r.noTables} />
      ) : groupedByHall ? (
        halls.map((h) => {
          const list = shown.filter((t) => t.hallId === h.id);
          if (!list.length) return null;
          return (
            <View key={h.id} style={{ gap: 8 }}>
              <Text style={[s.hallT, { color: c.ink }]} accessibilityRole="header">{h.name}</Text>
              {grid(list)}
            </View>
          );
        })
      ) : grid(shown)}

      {filter !== 'free' ? (
        <Group header={r.takeawayList} icon="bag-handle-outline">
          {[
            ...takeaway.filter((o) => filter !== 'mine' || o.mine).map((o) => <TakeawayCell key={o.id} o={o} onPress={() => router.push(`/order/${o.id}`)} />),
            <Cell key="__new" icon="add-circle" iconColor={c.sq.b} title={r.newTakeaway} onPress={newTakeaway} disabled={busy} chevron />,
          ]}
        </Group>
      ) : null}

      <Sheet
        visible={!!openFor}
        onClose={() => setOpenFor(null)}
        title={openFor ? tr(r.openTitle, { n: openFor.number }) : ''}
        subtitle={openFor ? tr(r.seatsN, { n: openFor.seats }) : undefined}
        footer={<Button title={r.openBtn} size="lg" full loading={busy} onPress={openTable} />}
      >
        <Text style={[s.label, { color: c.ink3 }]}>{r.guests}</Text>
        <Chips options={GUEST_PRESETS.map((n) => ({ key: n, label: String(n) }))} value={GUEST_PRESETS.includes(guests) ? guests : null} onChange={setGuests} />
        <Group footer={r.guestsHint}>
          <Cell title={r.guests} right={<Stepper value={guests} onChange={setGuests} min={1} max={100} />} />
        </Group>
      </Sheet>
    </Screen>
  );
}

function TakeawayCell({ o, onPress }: { o: OrderSummary; onPress: () => void }) {
  const { c } = useTheme();
  const d = useDict();
  const r = d.restaurant;
  const ready = o.counts?.ready ?? 0;
  return (
    <Cell
      icon="bag-handle"
      iconColor={o.status === 'precheck' ? c.sq.a : c.sq.t}
      title={tr(r.takeawayNo, { no: o.orderNo })}
      subtitle={[fmtDur(sinceMs(o.openedAt)), o.waiterName].filter(Boolean).join(' · ')}
      right={
        <View style={{ alignItems: 'flex-end', gap: 3 }}>
          <Text style={[{ fontSize: 16, fontWeight: '800', color: c.ink }, tabular]}>{o.due !== null ? fmtMoney(o.due) : '—'}</Text>
          {ready > 0 ? <Pill label={tr(r.readyN, { n: ready })} tone="ok" /> : o.status === 'precheck' ? <Pill label={r.precheck} tone="au" /> : null}
        </View>
      }
      onPress={onPress}
      chevron
    />
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  tile: { minHeight: 108, borderRadius: 20, padding: 12, borderWidth: 1, justifyContent: 'space-between' },
  tileTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 4 },
  num: { fontSize: 30, fontWeight: '800', letterSpacing: -0.8, flexShrink: 1 },
  icons: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingTop: 4 },
  tileSub: { fontSize: 13, fontWeight: '600' },
  tileBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4, minHeight: 22 },
  tileSum: { fontSize: 15, fontWeight: '800', flexShrink: 1 },
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  badgeT: { color: '#fff', fontSize: 12, fontWeight: '800' },
  hallT: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3, paddingHorizontal: 4 },
  label: { fontSize: 14, fontWeight: '600' },
});
