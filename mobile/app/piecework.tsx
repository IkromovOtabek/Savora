import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, Alert, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Text, TextInput } from '@/components/ui/Text';
import { useAuth } from '@/lib/auth';
import { errMsg } from '@/lib/api';
import { useTheme, tabular } from '@/lib/theme';
import { fmtDate, fmtMoney } from '@/lib/format';
import { fmtQty, isFractionalUnit, parseQty, priceTimesQty, qtyWithUnit } from '@/lib/qty';
import { useDict, tr } from '@/lib/i18n';
import {
  productionApi, useListPages, newPieceworkKey, monthStartIso, todayEndIso, PIECEWORK_TONE,
  type PieceworkEntry, type PieceworkStatus, type PieceworkTotals, type ProdOrder,
} from '@/lib/production';
import { isNetworkError } from '@/lib/offline';
import {
  Screen, NavBar, LargeTitle, Group, Cell, Button, Pill, StatCard, Chips, Sheet, Loading, ErrorState, InlineError,
  EmptyState, AmountColumn,
} from '@/components/ui';

type Filter = 'all' | PieceworkStatus;
const FILTERS: Filter[] = ['all', 'logged', 'approved', 'paid', 'rejected'];
const QUICK_ADD = [1, 5, 10, 50];

const todayStartIso = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()).toISOString(); };
const beforeTodayIso = () => new Date(new Date(todayStartIso()).getTime() - 1).toISOString();

/**
 * Usta/ishchi ekrani — «Bugungi ishim»: shu oy topgani (yozildi/tasdiqlandi/to'landi), bugungi yozuvlar,
 * «Ish yozish» (akt → operatsiya → miqdor; narx texkartadan) va oldingi yozuvlar holati bilan.
 * Takroriy bosish: `busyRef` + `clientId` (muvaffaqiyatgacha bir xil) — server ikkinchi yozuv yaratmaydi.
 */
export default function Piecework() {
  const { c } = useTheme();
  const d = useDict();
  const p = d.production.piecework;
  const st = d.production.pieceworkStatuses;
  const units = d.productFields.units;
  const { me } = useAuth();

  /* ───── oy jamlamasi va bugungi yozuvlar ───── */
  const [totals, setTotals] = useState<PieceworkTotals | null>(null);
  const [today, setToday] = useState<PieceworkEntry[] | null>(null);
  const [topErr, setTopErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const topGen = useRef(0);

  const loadTop = useCallback(async () => {
    const id = ++topGen.current;
    const [s, t] = await Promise.allSettled([
      productionApi.mySummary({ from: monthStartIso(), to: todayEndIso() }),
      productionApi.myEntries({ from: todayStartIso(), to: todayEndIso(), limit: 100 }),
    ]);
    if (id !== topGen.current) return;
    if (s.status === 'fulfilled') setTotals(s.value.totals);
    if (t.status === 'fulfilled') setToday(t.value.items);
    const failed = [s, t].find((x) => x.status === 'rejected') as PromiseRejectedResult | undefined;
    setTopErr(failed ? errMsg(failed.reason) : null);
  }, []);

  /* ───── oldingi yozuvlar (bugungacha), holat filtri ───── */
  const [filter, setFilter] = useState<Filter>('all');
  const history = useListPages<PieceworkEntry>(`pw:${filter}`, (page) => productionApi.myEntries({
    status: filter === 'all' ? undefined : filter, to: beforeTodayIso(), page, limit: 30,
  }));

  useEffect(() => { loadTop(); }, [loadTop]);
  // Boshqa ekrandan qaytganda — jimgina yangilash (filtr o'zgarishi bu yerda qayta ishga tushirmasin)
  const first = useRef(true);
  const onFocus = useRef(() => {});
  onFocus.current = () => { loadTop(); history.reloadSilently(); };
  useFocusEffect(useCallback(() => {
    if (first.current) { first.current = false; return; }
    onFocus.current();
  }, []));

  async function refreshAll() {
    setRefreshing(true);
    await Promise.all([loadTop(), history.refresh()]);
    setRefreshing(false);
  }

  /* ───── ish yozish varag'i ───── */
  const [sheet, setSheet] = useState(false);
  const [orders, setOrders] = useState<ProdOrder[] | null>(null);
  const [ordersErr, setOrdersErr] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [opName, setOpName] = useState<string | null>(null);
  const [qtyText, setQtyText] = useState('');
  const [busy, setBusyState] = useState(false);
  const busyRef = useRef(false);
  const setBusy = (v: boolean) => { busyRef.current = v; setBusyState(v); };
  // Bitta yozish urinishi — bitta kalit (javob kelmay qayta bosilsa ham ikkinchi yozuv yo'q); muvaffaqiyatda yangilanadi
  const key = useRef(newPieceworkKey());
  const [flash, setFlash] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    setOrdersErr(null);
    try {
      const r = await productionApi.activeOrders();
      setOrders(r.items);
      // Yagona akt — darhol tanlanadi; tanlangan akt yopilgan bo'lsa — tanlov tozalanadi
      setOrderId((cur) => (cur && r.items.some((o) => o.id === cur) ? cur : r.items.length === 1 ? r.items[0].id : null));
    } catch (e) {
      setOrdersErr(errMsg(e));
      setOrders((cur) => cur ?? []);
    }
  }, []);

  function openSheet() {
    setSheet(true);
    setQtyText('');
    loadOrders();
  }

  const order = useMemo(() => orders?.find((o) => o.id === orderId) ?? null, [orders, orderId]);
  const op = order?.operations.find((o) => o.name === opName) ?? null;
  // Yagona operatsiya — darhol tanlanadi
  useEffect(() => {
    if (order && !op && order.operations.length === 1) setOpName(order.operations[0].name);
  }, [order, op]);

  const unit = order?.unit ?? 'dona';
  const frac = isFractionalUnit(unit);
  const qty = parseQty(qtyText, unit);
  const amount = op && qty !== null ? priceTimesQty(op.rate, qty) : null;
  const qtyErr = qtyText.trim() && qty === null ? (frac ? p.qtyInvalid : p.qtyInvalidInt) : null;
  const unitName = units[unit] ?? unit;

  function addQty(n: number) {
    const cur = parseQty(qtyText, unit) ?? 0;
    setQtyText(fmtQty(cur + n));
  }

  async function save() {
    if (!order || !op || qty === null || busyRef.current) return;
    setBusy(true);
    try {
      const res = await productionApi.log({ productionOrderId: order.id, operation: op.name, qty, clientId: key.current });
      key.current = newPieceworkKey();
      const e = res.entry;
      setFlash(res.existing
        ? tr(p.savedExisting, { op: e.operation, qty: fmtQty(e.qty) })
        : tr(p.saved, { op: e.operation, qty: fmtQty(e.qty), sum: fmtMoney(e.amount, { suffix: true }) }));
      setSheet(false);
      setOpName(null);
      setQtyText('');
      loadTop();
    } catch (e) {
      Alert.alert(d.common.error, isNetworkError(e) ? p.netError : errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  /* ───── yozuvni tuzatish (o'z «yozildi» yozuvi, faqat miqdor; narx serverda) ───── */
  const [editing, setEditing] = useState<PieceworkEntry | null>(null);
  const [editText, setEditText] = useState('');
  const editUnit = editing?.unit ?? (editing?.productionOrderId ? 'dona' : 'kg');
  const editFrac = isFractionalUnit(editUnit);
  const editQty = parseQty(editText, editUnit);
  const editErr = editText.trim() && editQty === null ? (editFrac ? p.qtyInvalid : p.qtyInvalidInt) : null;
  const canEdit = (e: PieceworkEntry) => e.status === 'logged' && (e.can?.edit ?? true);

  function openEdit(e: PieceworkEntry) {
    setEditing(e);
    setEditText(fmtQty(e.qty));
  }

  async function saveEdit() {
    if (!editing || editQty === null || busyRef.current) return;
    if (editQty === editing.qty) { setEditing(null); return; }
    setBusy(true);
    try {
      const res = await productionApi.edit({ id: editing.id, qty: editQty });
      setFlash(tr(p.edited, { op: res.entry.operation, qty: fmtQty(res.entry.qty) }));
      setEditing(null);
      loadTop();
      history.reloadSilently();
    } catch (e) {
      Alert.alert(d.common.error, isNetworkError(e) ? p.netError : errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  // Muvaffaqiyat xabari bir necha soniyadan keyin yo'qoladi
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 6000);
    return () => clearTimeout(t);
  }, [flash]);

  /* ───── ko'rinish ───── */
  const earned = totals ? totals.logged.amount + totals.approved.amount + totals.paid.amount : 0;
  const todaySum = (today ?? []).filter((e) => e.status !== 'rejected').reduce((s, e) => s + e.amount, 0);
  const title = <LargeTitle title={p.title} subtitle={me?.user.username ? `${p.subtitle} · ${me.user.username}` : p.subtitle} />;
  const header = <NavBar />;

  if (!totals && !today && topErr) {
    return (
      <Screen header={header} onRefresh={refreshAll} refreshing={refreshing}>
        {title}
        <ErrorState message={topErr} onRetry={loadTop} />
      </Screen>
    );
  }

  const entryCell = (e: PieceworkEntry) => (
    <Cell
      key={e.id}
      icon={e.status === 'paid' ? 'checkmark-done' : e.status === 'rejected' ? 'close-circle' : e.status === 'approved' ? 'checkmark-circle' : 'time'}
      iconColor={e.status === 'paid' ? c.sq.o : e.status === 'rejected' ? c.sq.r : e.status === 'approved' ? c.sq.b : c.sq.a}
      title={`${e.operation} × ${fmtQty(e.qty)}`}
      subtitle={[
        [e.productionOrderNo ?? p.noOrder, e.workDate ? fmtDate(e.workDate) : null].filter(Boolean).join(' · '),
        e.status === 'rejected' && e.rejectReason ? tr(p.rejectedReason, { reason: e.rejectReason }) : null,
      ].filter(Boolean).join('\n')}
      subtitleLines={2}
      onPress={canEdit(e) ? () => openEdit(e) : undefined}
      chevron={canEdit(e)}
      accessibilityLabel={canEdit(e) ? `${e.operation} × ${fmtQty(e.qty)}. ${p.editTap}` : undefined}
      right={<AmountColumn amount={fmtMoney(e.amount)} color={e.status === 'rejected' ? c.ink3 : undefined}><Pill label={st[e.status]} tone={PIECEWORK_TONE[e.status]} /></AmountColumn>}
    />
  );

  return (
    <Screen header={header} refreshing={refreshing} onRefresh={refreshAll} gap={14}>
      {title}
      {topErr ? <InlineError message={topErr} onRetry={loadTop} /> : null}

      {flash ? (
        <View style={[s.flash, { backgroundColor: c.okSoft }]} accessibilityLiveRegion="polite">
          <Ionicons name="checkmark-circle" size={22} color={c.ok} />
          <Text style={[s.flashT, { color: c.ok }]}>{flash}</Text>
        </View>
      ) : null}

      {/* Shu oy topgani */}
      <View style={[s.hero, { backgroundColor: c.hero2 }]} accessible accessibilityLabel={`${p.monthEarned}: ${fmtMoney(earned, { suffix: true })}`}>
        <Text style={s.heroL}>{p.monthEarned}</Text>
        {totals ? (
          <Text style={[s.heroV, tabular]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
            {fmtMoney(earned)}<Text style={s.heroSuffix}> {d.format.currency}</Text>
          </Text>
        ) : <Loading />}
        {today ? <Text style={[s.heroR, tabular]}>{tr(p.todaySum, { sum: fmtMoney(todaySum, { suffix: true }) })}</Text> : null}
      </View>

      {totals ? (
        <View style={s.stats}>
          <StatCard label={p.paid} value={fmtMoney(totals.paid.amount)} note={tr(d.common.count, { n: totals.paid.count })} color={c.ok} />
          <StatCard label={p.due} value={fmtMoney(totals.due)} note={tr(d.common.count, { n: totals.approved.count })} color={c.tint} />
          <StatCard label={p.pending} value={fmtMoney(totals.logged.amount)} note={tr(d.common.count, { n: totals.logged.count })} color={c.gold} />
        </View>
      ) : null}

      <Button title={p.logBtn} icon="add-circle" size="lg" full onPress={openSheet} />

      <Group header={p.today} icon="today-outline">
        {today === null ? <Loading /> : today.length === 0
          ? <EmptyState icon="hammer-outline" title={p.todayEmpty} message={p.emptyHint} />
          : today.map(entryCell)}
      </Group>

      <Text style={[s.h, { color: c.ink }]} accessibilityRole="header">{p.history}</Text>
      <Chips options={FILTERS.map((f) => ({ key: f, label: f === 'all' ? d.common.all : st[f] }))} value={filter} onChange={setFilter} />
      {history.error && history.items.length ? <InlineError message={history.error} onRetry={history.retry} /> : null}
      {history.loading ? <Loading /> : history.error && !history.items.length ? (
        <ErrorState message={history.error} onRetry={history.retry} />
      ) : history.items.length === 0 ? (
        <EmptyState icon="file-tray-outline" title={p.empty} />
      ) : (
        <>
          <Group>{history.items.map(entryCell)}</Group>
          {history.hasMore ? <Button title={d.common.loadMore} variant="tinted" loading={history.loadingMore} onPress={history.loadMore} /> : null}
        </>
      )}

      <Sheet
        visible={sheet}
        onClose={() => { if (!busyRef.current) setSheet(false); }}
        title={p.logBtn}
        subtitle={order ? `${order.docNo} · ${order.outputName}` : undefined}
        footer={op ? (
          <Button
            title={p.save}
            value={amount !== null ? fmtMoney(amount, { suffix: true }) : undefined}
            size="lg"
            full
            loading={busy}
            disabled={qty === null}
            onPress={save}
          />
        ) : undefined}
      >
        {orders === null ? <Loading /> : !order ? (
          /* 1-qadam: akt */
          <>
            <Text style={[s.step, { color: c.ink }]}>{p.stepOrder}</Text>
            {ordersErr ? <ErrorState message={`${p.ordersFailed}: ${ordersErr}`} onRetry={loadOrders} /> : orders.length === 0 ? (
              <EmptyState icon="construct-outline" title={p.noOrders} />
            ) : (
              <Group>
                {orders.map((o) => (
                  <Cell
                    key={o.id}
                    icon="construct"
                    iconColor={o.status === 'in_progress' ? c.sq.b : c.sq.g}
                    title={o.outputName}
                    subtitle={[o.docNo, tr(p.planned, { qty: qtyWithUnit(o.plannedQty, o.unit, units) })].join(' · ')}
                    chevron
                    onPress={() => { setOrderId(o.id); setOpName(null); }}
                  />
                ))}
              </Group>
            )}
          </>
        ) : !op ? (
          /* 2-qadam: operatsiya */
          <>
            <Chosen icon="construct" title={order.outputName} sub={order.docNo} change={p.change} onPress={() => { setOrderId(null); setOpName(null); }} />
            <Text style={[s.step, { color: c.ink }]}>{p.stepOperation}</Text>
            {order.operations.length === 0 ? (
              <EmptyState icon="alert-circle-outline" title={p.noOperations} />
            ) : (
              <Group footer={p.rateHint}>
                {order.operations.map((o) => (
                  <Cell
                    key={o.name}
                    icon="hammer"
                    iconColor={c.sq.p}
                    title={o.name}
                    subtitle={tr(p.rateLine, { unit: unitName, sum: fmtMoney(o.rate, { suffix: true }) })}
                    chevron
                    onPress={() => setOpName(o.name)}
                  />
                ))}
              </Group>
            )}
          </>
        ) : (
          /* 3-qadam: miqdor */
          <>
            <Chosen icon="construct" title={order.outputName} sub={order.docNo} change={p.change} onPress={() => { setOrderId(null); setOpName(null); }} />
            <Chosen
              icon="hammer"
              title={op.name}
              sub={tr(p.rateLine, { unit: unitName, sum: fmtMoney(op.rate, { suffix: true }) })}
              change={order.operations.length > 1 ? p.change : undefined}
              onPress={order.operations.length > 1 ? () => setOpName(null) : undefined}
            />
            <Text style={[s.step, { color: c.ink }]}>{p.stepQty}</Text>
            <View style={[s.qtyBox, { backgroundColor: c.fill2, borderColor: qtyErr ? c.bad : c.tint }]}>
              <TextInput
                value={qtyText}
                onChangeText={(v) => setQtyText(v.replace(frac ? /[^\d.,]/g : /\D/g, ''))}
                keyboardType={frac ? 'decimal-pad' : 'number-pad'}
                placeholder="0"
                placeholderTextColor={c.ink3}
                autoFocus
                maxLength={10}
                style={[s.qtyInput, tabular, { color: c.ink }]}
                accessibilityLabel={d.common.qty}
                returnKeyType="done"
                onSubmitEditing={save}
              />
              <Text style={[s.qtyUnit, { color: c.ink3 }]}>{unitName}</Text>
            </View>
            {qtyErr ? <Text style={[s.err, { color: c.bad }]}>{qtyErr}</Text> : null}
            <View style={s.quick}>
              {QUICK_ADD.map((n) => (
                <Pressable
                  key={n}
                  onPress={() => addQty(n)}
                  accessibilityRole="button"
                  accessibilityLabel={`+${n}`}
                  style={({ pressed }) => [s.quickBtn, { backgroundColor: c.tintSoft }, pressed && { opacity: 0.5 }]}
                >
                  <Text style={[s.quickT, tabular, { color: c.tint }]}>+{n}</Text>
                </Pressable>
              ))}
            </View>
            {amount !== null ? (
              <View style={[s.amountRow, { borderColor: c.sep }]}>
                <Text style={[s.amountL, { color: c.ink3 }]}>{p.amount}</Text>
                <Text style={[s.amountV, tabular, { color: c.ink }]}>{fmtMoney(amount, { suffix: true })}</Text>
              </View>
            ) : null}
          </>
        )}
      </Sheet>

      {/* Yozuvni tuzatish (faqat miqdor) */}
      <Sheet
        visible={!!editing}
        onClose={() => { if (!busyRef.current) setEditing(null); }}
        title={p.editTitle}
        subtitle={editing ? [editing.operation, editing.productionOrderNo].filter(Boolean).join(' · ') : undefined}
        footer={editing ? (
          <Button
            title={p.save}
            value={editQty !== null ? fmtMoney(priceTimesQty(editing.rate, editQty), { suffix: true }) : undefined}
            size="lg"
            full
            loading={busy}
            disabled={editQty === null}
            onPress={saveEdit}
          />
        ) : undefined}
      >
        {editing ? (
          <>
            <Text style={[s.err, { color: c.ink3 }]}>{p.editHint}</Text>
            <View style={[s.qtyBox, { backgroundColor: c.fill2, borderColor: editErr ? c.bad : c.tint }]}>
              <TextInput
                value={editText}
                onChangeText={(v) => setEditText(v.replace(editFrac ? /[^\d.,]/g : /\D/g, ''))}
                keyboardType={editFrac ? 'decimal-pad' : 'number-pad'}
                placeholder="0"
                placeholderTextColor={c.ink3}
                autoFocus
                maxLength={10}
                style={[s.qtyInput, tabular, { color: c.ink }]}
                accessibilityLabel={d.common.qty}
                returnKeyType="done"
                onSubmitEditing={saveEdit}
              />
              <Text style={[s.qtyUnit, { color: c.ink3 }]}>{units[editUnit] ?? editUnit}</Text>
            </View>
            {editErr ? <Text style={[s.err, { color: c.bad }]}>{editErr}</Text> : null}
            <View style={[s.amountRow, { borderColor: c.sep }]}>
              <Text style={[s.amountL, { color: c.ink3 }]}>{tr(p.rateLine, { unit: units[editUnit] ?? editUnit, sum: fmtMoney(editing.rate, { suffix: true }) })}</Text>
            </View>
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}

/** Tanlangan akt/operatsiya — bosilsa o'zgartiriladi (katta bosish maydoni) */
function Chosen({ icon, title, sub, change, onPress }: { icon: 'construct' | 'hammer'; title: string; sub: string; change?: string; onPress?: () => void }) {
  const { c } = useTheme();
  return (
    <Group>
      <Cell
        icon={icon}
        iconColor={icon === 'hammer' ? c.sq.p : c.sq.b}
        title={title}
        subtitle={sub}
        onPress={onPress}
        right={change ? <Text style={{ color: c.tint, fontSize: 15, fontWeight: '600' }}>{change}</Text> : undefined}
      />
    </Group>
  );
}

const s = StyleSheet.create({
  flash: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12 },
  flashT: { flex: 1, fontSize: 15, fontWeight: '700' },
  hero: { borderRadius: 24, padding: 18, gap: 4 },
  heroL: { color: 'rgba(255,255,255,0.9)', fontSize: 16, fontWeight: '700' },
  heroV: { color: '#fff', fontSize: 40, fontWeight: '800', letterSpacing: -1.2 },
  heroSuffix: { fontSize: 17, fontWeight: '600', letterSpacing: 0 },
  heroR: { color: 'rgba(255,255,255,0.92)', fontSize: 15, fontWeight: '600' },
  stats: { flexDirection: 'row', gap: 8 },
  h: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4, paddingHorizontal: 4, marginTop: 4 },
  step: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  qtyBox: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, borderWidth: 2, paddingHorizontal: 18, minHeight: 84, gap: 10 },
  qtyInput: { flex: 1, fontSize: 40, fontWeight: '800', letterSpacing: -1, paddingVertical: 10 },
  qtyUnit: { fontSize: 20, fontWeight: '700' },
  err: { fontSize: 14, fontWeight: '600' },
  quick: { flexDirection: 'row', gap: 10 },
  quickBtn: { flex: 1, minHeight: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  quickT: { fontSize: 19, fontWeight: '800' },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
  amountL: { fontSize: 16, fontWeight: '600' },
  amountV: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
});
