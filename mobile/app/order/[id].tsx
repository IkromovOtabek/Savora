import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Alert, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { errMsg } from '@/lib/api';
import { useTheme, tabular } from '@/lib/theme';
import { fmtMoney } from '@/lib/format';
import { fmtQty } from '@/lib/qty';
import { useDict, tr, type Dict } from '@/lib/i18n';
import {
  restaurantApi, usePolling, isNetErr, errCode, failedOf, fmtClock, fmtDur, sinceMs, getCart, cartCount,
  type OrderView, type OrderItem, type ItemStatus, type SendFailure, type TableRow,
} from '@/lib/restaurant';
import {
  Screen, NavBar, LargeTitle, Group, Cell, AmountColumn, Pill, Button, Field, Chips, Stepper, Sheet, Loading, ErrorState,
  InlineError, EmptyState, type Tone,
} from '@/components/ui';

type R = Dict['restaurant'];

const ITEM_TONE: Record<ItemStatus, Tone> = {
  pending: 'au', new: 'mut', sent: 'br', cooking: 'warn', ready: 'ok', served: 'mut', voided: 'bad',
};
/** «Taomlar» ro'yxatida: tayyorlari tepada (ofitsant olib chiqishi kerak) */
const ACTIVE_ORDER: Partial<Record<ItemStatus, number>> = { ready: 0, cooking: 1, sent: 2, served: 3 };
const SENT_STATUSES: ItemStatus[] = ['sent', 'cooking', 'ready', 'served'];

function timingLine(i: OrderItem, r: R): string {
  switch (i.status) {
    case 'pending': return tr(r.tPending, { t: fmtClock(i.addedAt) });
    case 'new': return tr(r.tNew, { t: fmtClock(i.addedAt) });
    case 'sent': return tr(r.tSent, { t: fmtClock(i.sentAt), d: fmtDur(sinceMs(i.sentAt)) });
    case 'cooking': return tr(r.tCooking, { d: fmtDur(sinceMs(i.sentAt)) });
    case 'ready': return tr(r.tReady, { t: fmtClock(i.readyAt), d: fmtDur(sinceMs(i.readyAt)) });
    case 'served': return tr(r.tServed, { p: fmtDur(i.timings.prepMs), dl: fmtDur(i.timings.deliveryMs) });
    case 'voided': return tr(r.tVoided, { r: i.voidReason || r.noReason });
  }
}

const itemTitle = (i: OrderItem) => (i.qty === 1 ? i.displayName : `${i.displayName} × ${fmtQty(i.qty)}`);

/** Buyurtma (ofitsant): taomlar holati va vaqtlari, yuborish, yetkazildi, QR tasdiq, bekor qilish, pre-chek. To'lov — kassada. */
export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { c } = useTheme();
  const d = useDict();
  const r = d.restaurant;

  const [order, setOrder] = useState<OrderView | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusyState] = useState<string | null>(null);
  // Ref — bir kadrda ikki marta bosilsa ham ikkinchi so'rov ketmasin (state keyingi render'da yangilanadi)
  const busyRef = useRef<string | null>(null);
  const setBusy = (v: string | null) => { busyRef.current = v; setBusyState(v); };
  const gen = useRef(0);
  const inFlight = useRef(false);

  const load = useCallback(async (mode: 'initial' | 'refresh' | 'silent') => {
    if (!id) return;
    if (mode === 'silent' && inFlight.current) return;
    const g = ++gen.current;
    inFlight.current = true;
    if (mode === 'refresh') setRefreshing(true);
    try {
      const res = await restaurantApi.order(id);
      if (g !== gen.current) return;
      setOrder(res.order); setError(null);
    } catch (e) {
      if (g === gen.current) setError(errMsg(e));
    } finally {
      if (mode === 'refresh') setRefreshing(false);
      if (g === gen.current) { inFlight.current = false; setLoading(false); }
    }
  }, [id]);

  useEffect(() => { load('initial'); }, [load]);
  usePolling(() => { if (!busyRef.current) load('silent'); }, 5000);

  function showFailed(failed: SendFailure[]) {
    if (!failed.length) return;
    Alert.alert(r.sendFailedTitle, failed.map((f) => `• ${f.message || f.name}`).join('\n'));
  }

  /**
   * Buyurtma amali. Yozuvdan oldin javob kelmasa (sekin internet) — buyurtmani qayta o'qiymiz va xabar
   * beramiz: foydalanuvchi natijani ko'rib qayta bosadi (send/served/confirm/precheck takrori zararsiz).
   */
  async function run<T extends { order: OrderView }>(
    key: string,
    body: Parameters<typeof restaurantApi.op>[1],
    onOk?: (res: T) => void,
  ): Promise<'ok' | 'net' | 'error'> {
    if (!id || busyRef.current) return 'error';
    setBusy(key);
    gen.current++; // parallel polling javobi yangi holatni bosib ketmasin
    inFlight.current = false;
    try {
      const res = await restaurantApi.op<T>(id, body);
      setOrder(res.order); setError(null);
      onOk?.(res);
      return 'ok';
    } catch (e) {
      const code = errCode(e);
      if (isNetErr(e)) Alert.alert(d.common.error, r.netErrorCheck);
      else if (code === 'conflict') Alert.alert(d.common.error, r.conflict);
      else if (code === 'sendFailed') showFailed(failedOf(e));
      // Kimdir allaqachon bajargan (ikkinchi telefon, takroriy bosish) — faqat yangilaymiz
      else if (code !== 'nothingToSend' && code !== 'badTransition') Alert.alert(d.common.error, errMsg(e));
      load('silent');
      return isNetErr(e) ? 'net' : 'error';
    } finally {
      setBusy(null);
    }
  }

  /* ───── amallar ───── */
  const sendAll = () => run<{ order: OrderView; failed: SendFailure[] }>('send', { op: 'send' }, (res) => showFailed(res.failed ?? []));
  const serve = (itemIds: string[]) => run('served', { op: 'served', itemIds });
  const confirmQr = (itemIds?: string[]) =>
    run<{ order: OrderView; failed?: SendFailure[] }>('confirm', { op: 'confirm', itemIds, send: true }, (res) => showFailed(res.failed ?? []));
  const rejectQr = (itemIds: string[] | undefined, n: number) =>
    Alert.alert(r.qrReject, tr(r.qrRejectConfirm, { n }), [
      { text: d.common.cancel, style: 'cancel' },
      { text: r.qrReject, style: 'destructive', onPress: () => { void run('reject', { op: 'confirm', itemIds, reject: true }); } },
    ]);

  const [precheckOpen, setPrecheckOpen] = useState(false);
  const precheck = () =>
    Alert.alert(r.precheckBtn, r.precheckConfirm, [
      { text: d.common.cancel, style: 'cancel' },
      { text: r.precheckBtn, onPress: () => { void run('precheck', { op: 'precheck' }, () => setPrecheckOpen(true)); } },
    ]);

  /* ───── mehmonlar ───── */
  const [guestsOpen, setGuestsOpen] = useState(false);
  const [guests, setGuests] = useState(1);
  const saveGuests = async () => { if ((await run('info', { op: 'info', guests })) === 'ok') setGuestsOpen(false); };

  /* ───── saboy: qaysi stol mehmonlariga ───── */
  const [tableOpen, setTableOpen] = useState(false);
  const [tables, setTables] = useState<TableRow[] | null>(null);
  const [tablesErr, setTablesErr] = useState<string | null>(null);
  const [forTable, setForTable] = useState('');
  async function openForTable() {
    if (!order) return;
    setForTable(order.forTableId ?? '');
    setTablesErr(null);
    setTableOpen(true);
    try {
      setTables((await restaurantApi.tables(order.branchId)).tables);
    } catch (e) {
      setTablesErr(isNetErr(e) ? r.netError : errMsg(e));
    }
  }
  async function saveForTable() {
    if (!order) return;
    if (forTable === (order.forTableId ?? '')) { setTableOpen(false); return; }
    if ((await run('info', { op: 'info', forTableId: forTable || null })) === 'ok') setTableOpen(false);
  }

  /* ───── bekor qilish ───── */
  const [voidItem, setVoidItem] = useState<OrderItem | null>(null);
  const [voidQty, setVoidQty] = useState(1);
  const [reason, setReason] = useState('');
  const [voidTried, setVoidTried] = useState(false);
  const voidSent = !!voidItem && SENT_STATUSES.includes(voidItem.status);
  // Sabab faqat do'kon sozlamasida yoqilgan bo'lsa majburiy (server ham shu qoidani tekshiradi)
  const reasonRequired = voidSent && (order?.requireVoidReason ?? true);
  const reasonMissing = reasonRequired && !reason.trim();
  function openVoid(i: OrderItem) {
    setVoidItem(i); setVoidQty(i.qty); setReason(''); setVoidTried(false);
  }
  async function submitVoid() {
    if (!voidItem) return;
    setVoidTried(true);
    if (reasonMissing) return;
    const partial = voidQty < voidItem.qty;
    const res = await run('void', {
      op: 'void', itemId: voidItem.id, qty: partial ? voidQty : undefined, reason: reason.trim() || undefined,
    });
    // Javob kelmagan bo'lsa ham varaqni yopamiz: buyurtma qayta o'qildi — qisman bekor qilish eski miqdor bilan
    // takrorlanib ketmasin (foydalanuvchi yangilangan taomdan qayta ochadi)
    if (res !== 'error') setVoidItem(null);
  }

  /* ───── buyurtmani bekor qilish (yuborilgan taom va to'lov bo'lmasa) ───── */
  const cancelOrder = () =>
    Alert.alert(r.cancelOrder, r.cancelOrderConfirm, [
      { text: d.common.close, style: 'cancel' },
      {
        text: r.cancelOrder,
        style: 'destructive',
        onPress: () => {
          void run('cancel', { op: 'cancel' }, () => {
            Alert.alert(r.cancelledOk);
            if (router.canGoBack()) router.back();
          });
        },
      },
    ]);

  /* ───── taomga bosilganda ───── */
  function onItem(i: OrderItem) {
    const can = order?.can;
    if (!can || !order) return;
    if (i.status === 'pending') {
      if (!can.edit) return;
      Alert.alert(itemTitle(i), r.qrHint, [
        { text: d.common.close, style: 'cancel' },
        { text: r.qrReject, style: 'destructive', onPress: () => { void run('reject', { op: 'confirm', itemIds: [i.id], reject: true }); } },
        { text: r.qrConfirmOne, onPress: () => { void confirmQr([i.id]); } },
      ]);
      return;
    }
    if (i.status === 'voided' || i.paid) return;
    const sent = SENT_STATUSES.includes(i.status);
    const canVoid = sent ? can.voidSent : can.voidUnsent;
    const canServe = can.serve && (i.status === 'sent' || i.status === 'cooking' || i.status === 'ready');
    const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [{ text: d.common.close, style: 'cancel' }];
    if (canVoid) buttons.push({ text: r.voidItem, style: 'destructive', onPress: () => openVoid(i) });
    else if (sent && i.status !== 'served' && order.status === 'open') buttons.push({ text: r.voidItem, style: 'destructive', onPress: () => Alert.alert(r.voidTitle, r.voidNoPerm) });
    if (canServe) buttons.push({ text: r.served, onPress: () => { void serve([i.id]); } });
    if (buttons.length === 1) return;
    Alert.alert(itemTitle(i), timingLine(i, r), buttons);
  }

  /* ───── ko'rinish ───── */
  const groups = useMemo(() => {
    const items = order?.items ?? [];
    return {
      pending: items.filter((i) => i.status === 'pending'),
      unsent: items.filter((i) => i.status === 'new'),
      active: items
        .filter((i) => ACTIVE_ORDER[i.status] !== undefined)
        .sort((a, b) => (ACTIVE_ORDER[a.status]! - ACTIVE_ORDER[b.status]!) || String(a.sentAt).localeCompare(String(b.sentAt))),
      voided: items.filter((i) => i.status === 'voided'),
    };
  }, [order]);

  const title = order
    ? order.tableNumber !== null ? tr(r.tableN, { n: order.tableNumber }) : tr(r.takeawayNo, { no: order.orderNo })
    : r.title;
  const header = <NavBar backLabel={r.title} />;

  if (loading && !order) return <Screen header={header}><Loading /></Screen>;
  if (!order) return <Screen header={header}><ErrorState message={error} onRetry={() => { setLoading(true); load('initial'); }} /></Screen>;

  const can = order.can;
  const bill = order.bill;
  const ready = groups.active.filter((i) => i.status === 'ready');
  const inCart = cartCount(getCart(order.id));
  const isOpen = order.status === 'open';
  const hasSent = order.items.some((i) => SENT_STATUSES.includes(i.status));
  const statusTone: Tone = order.status === 'precheck' ? 'au' : order.status === 'open' ? 'br' : 'mut';
  const subtitle = [
    order.tableNumber !== null ? order.orderNo : null,
    order.forTableNumber !== null ? tr(r.forTableN, { n: order.forTableNumber }) : null,
    order.waiterName,
    tr(r.openedAt, { t: fmtClock(order.openedAt) }),
  ].filter(Boolean).join(' · ');

  const itemCell = (i: OrderItem, opts: { serveBtn?: boolean } = {}) => (
    <Cell
      key={i.id}
      title={itemTitle(i)}
      titleLines={2}
      subtitle={[timingLine(i, r), i.note ? `«${i.note}»` : null].filter(Boolean).join(' · ')}
      subtitleLines={3}
      right={<AmountColumn amount={fmtMoney(i.total)} color={i.status === 'voided' ? c.ink3 : undefined}><Pill label={r.itemStatuses[i.status]} tone={ITEM_TONE[i.status]} /></AmountColumn>}
      onPress={() => onItem(i)}
    >
      {opts.serveBtn ? (
        <Button title={r.served} icon="checkmark" size="sm" variant="tinted" loading={busy === 'served'} onPress={() => { void serve([i.id]); }} style={{ alignSelf: 'flex-start', marginTop: 8 }} />
      ) : null}
    </Cell>
  );

  const footer = isOpen && can && (can.edit || can.precheck) ? (
    <View style={s.footRow}>
      {can.precheck ? <Button title={r.bill} icon="receipt-outline" variant="tinted" loading={busy === 'precheck'} disabled={!!busy && busy !== 'precheck'} onPress={precheck} style={{ flex: 1, minHeight: 56 }} accessibilityLabel={r.precheckBtn} /> : null}
      {can.edit ? (
        <Button
          title={inCart ? tr(r.cartN, { n: inCart }) : r.addItems}
          icon={inCart ? 'cart' : 'add'}
          onPress={() => router.push(`/order-menu?orderId=${encodeURIComponent(order.id)}&branchId=${encodeURIComponent(order.branchId)}&title=${encodeURIComponent(title)}`)}
          style={{ flex: 1.4, minHeight: 56 }}
        />
      ) : null}
    </View>
  ) : order.status === 'precheck' ? (
    <Button title={r.precheckShow} icon="receipt-outline" size="lg" full onPress={() => setPrecheckOpen(true)} />
  ) : null;

  return (
    <Screen header={header} footer={footer} refreshing={refreshing} onRefresh={() => load('refresh')} gap={16}>
      <LargeTitle title={title} subtitle={subtitle} actions={<Pill label={r.statuses[order.status]} tone={statusTone} />} />
      {error ? <InlineError message={error} onRetry={() => load('silent')} /> : null}

      {order.status === 'precheck' ? (
        <Group>
          <Cell icon="lock-closed" iconColor={c.sq.a} title={r.precheck} subtitle={r.precheckLocked} subtitleLines={3} />
        </Group>
      ) : null}

      {order.type === 'dine_in' ? (
        <Group>
          <Cell
            icon="people"
            iconColor={c.sq.p}
            title={r.guestsEdit}
            value={order.guests ? String(order.guests) : '—'}
            valueStrong
            chevron={isOpen && !!can?.edit}
            onPress={isOpen && can?.edit ? () => { setGuests(order.guests ?? 2); setGuestsOpen(true); } : undefined}
          />
          {order.note ? <Cell icon="chatbubble-ellipses" iconColor={c.sq.g} title={d.common.note} subtitle={order.note} subtitleLines={3} /> : null}
        </Group>
      ) : order.type === 'takeaway' ? (
        <Group>
          <Cell
            icon="restaurant"
            iconColor={c.sq.p}
            title={r.forTable}
            value={order.forTableNumber !== null ? tr(r.tableN, { n: order.forTableNumber }) : r.noTable}
            valueStrong
            chevron={isOpen && !!can?.edit}
            onPress={isOpen && can?.edit ? () => { void openForTable(); } : undefined}
          />
          {order.note ? <Cell icon="chatbubble-ellipses" iconColor={c.sq.g} title={d.common.note} subtitle={order.note} subtitleLines={3} /> : null}
        </Group>
      ) : null}

      {groups.pending.length ? (
        <Group header={r.qrTitle} icon="qr-code-outline" footer={r.qrHint}>
          {[
            ...groups.pending.map((i) => itemCell(i)),
            ...(can?.edit ? [
              <View key="__qr" style={s.btnRow}>
                <Button title={r.qrReject} variant="destructive" loading={busy === 'reject'} disabled={!!busy} onPress={() => rejectQr(undefined, groups.pending.length)} style={{ flex: 1 }} />
                <Button title={r.qrConfirm} icon="checkmark" loading={busy === 'confirm'} disabled={!!busy} onPress={() => { void confirmQr(); }} style={{ flex: 1.4 }} />
              </View>,
            ] : []),
          ]}
        </Group>
      ) : null}

      {groups.unsent.length ? (
        <Group header={r.unsentTitle} icon="time-outline">
          {[
            ...groups.unsent.map((i) => itemCell(i)),
            ...(can?.send ? [
              <View key="__send" style={s.btnPad}>
                <Button title={tr(r.sendN, { n: groups.unsent.length })} icon="flame" full loading={busy === 'send'} disabled={!!busy} onPress={() => { void sendAll(); }} />
              </View>,
            ] : []),
          ]}
        </Group>
      ) : null}

      {ready.length > 1 && can?.serve ? (
        <Button title={tr(r.serveAll, { n: ready.length })} icon="checkmark-done" variant="tinted" full loading={busy === 'served'} disabled={!!busy} onPress={() => { void serve(ready.map((i) => i.id)); }} />
      ) : null}

      {groups.active.length ? (
        <Group header={r.itemsTitle} icon="restaurant-outline">
          {groups.active.map((i) => itemCell(i, { serveBtn: i.status === 'ready' && !!can?.serve }))}
        </Group>
      ) : null}

      {!groups.pending.length && !groups.unsent.length && !groups.active.length ? (
        <EmptyState icon="restaurant-outline" title={r.emptyOrder} message={isOpen && can?.edit ? r.emptyOrderMsg : undefined} />
      ) : null}

      {groups.voided.length ? (
        <Group header={r.voidedTitle} icon="close-circle-outline">
          {groups.voided.map((i) => itemCell(i))}
        </Group>
      ) : null}

      {bill.counts.items > 0 ? (
        <Group header={r.bill} icon="receipt-outline" footer={r.payAtCashier}>
          <Cell title={r.subtotal} value={fmtMoney(bill.subtotal, { suffix: true })} />
          {bill.dueServiceCharge > 0 ? <Cell title={tr(r.service, { pct: bill.servicePct })} value={fmtMoney(bill.dueServiceCharge, { suffix: true })} /> : null}
          {bill.duePackFee > 0 ? <Cell title={r.packFee} value={fmtMoney(bill.duePackFee, { suffix: true })} /> : null}
          {bill.paid > 0 ? <Cell title={r.paid} value={fmtMoney(bill.paid, { suffix: true })} valueColor={c.ok} /> : null}
          <Cell title={r.due} right={<Text style={[s.due, tabular, { color: c.ink }]}>{fmtMoney(bill.due, { suffix: true })}</Text>} />
        </Group>
      ) : null}

      {isOpen && can?.cancel ? (
        <View style={{ gap: 6 }}>
          <Button
            title={r.cancelOrder}
            icon="close-circle-outline"
            variant="destructive"
            full
            loading={busy === 'cancel'}
            disabled={!!busy || hasSent || bill.paid > 0}
            onPress={cancelOrder}
          />
          {hasSent ? <Text style={[s.hint, { color: c.ink3, textAlign: 'center' }]}>{r.cancelOrderHint}</Text> : null}
        </View>
      ) : null}

      {/* Mehmonlar soni */}
      <Sheet
        visible={guestsOpen}
        onClose={() => setGuestsOpen(false)}
        title={r.guestsEdit}
        subtitle={title}
        footer={<Button title={d.common.save} size="lg" full loading={busy === 'info'} onPress={() => { void saveGuests(); }} />}
      >
        <Chips options={[1, 2, 3, 4, 5, 6, 8].map((n) => ({ key: n, label: String(n) }))} value={guests} onChange={setGuests} />
        <Group>
          <Cell title={r.guests} right={<Stepper value={guests} onChange={setGuests} min={1} max={100} />} />
        </Group>
      </Sheet>

      {/* Saboy: qaysi stol mehmonlariga */}
      <Sheet
        visible={tableOpen}
        onClose={() => setTableOpen(false)}
        title={r.forTable}
        subtitle={title}
        footer={<Button title={d.common.save} size="lg" full loading={busy === 'info'} onPress={() => { void saveForTable(); }} />}
      >
        <Text style={[s.hint, { color: c.ink3 }]}>{r.forTableHint}</Text>
        {tablesErr ? <InlineError message={tablesErr} onRetry={() => { void openForTable(); }} /> : null}
        {tables ? (
          <Chips<string>
            options={[
              { key: '', label: r.noTable },
              ...tables.map((t) => ({ key: t.id, label: t.order ? tr(r.tableBusyN, { n: t.number }) : String(t.number) })),
            ]}
            value={forTable}
            onChange={setForTable}
          />
        ) : !tablesErr ? <Loading /> : null}
      </Sheet>

      {/* Bekor qilish */}
      <Sheet
        visible={!!voidItem}
        onClose={() => setVoidItem(null)}
        closeLabel={d.common.close}
        title={r.voidTitle}
        subtitle={voidItem ? itemTitle(voidItem) : undefined}
        footer={<Button title={r.voidConfirm} variant="destructive" size="lg" full loading={busy === 'void'} onPress={() => { void submitVoid(); }} />}
      >
        {voidSent ? <Text style={[s.hint, { color: c.warn }]}>{r.voidSentHint}</Text> : null}
        {voidItem && voidItem.qty > 1 && Number.isInteger(voidItem.qty) ? (
          <Group>
            <Cell title={r.voidQty} right={<Stepper value={voidQty} onChange={setVoidQty} min={1} max={voidItem.qty} />} />
          </Group>
        ) : null}
        <Chips options={r.voidReasons.map((x) => ({ key: x, label: x }))} value={r.voidReasons.includes(reason) ? reason : null} onChange={setReason} />
        <Field
          label={reasonRequired ? r.voidReason : r.voidReasonOptional}
          value={reason}
          onChangeText={setReason}
          placeholder={r.voidReasonPh}
          maxLength={200}
          error={voidTried && reasonMissing ? r.voidReasonRequired : null}
        />
      </Sheet>

      {/* Pre-chek — mijozga ko'rsatish uchun (fiskal chek emas) */}
      <Sheet visible={precheckOpen} onClose={() => setPrecheckOpen(false)} closeLabel={d.common.close} title={r.precheckTitle} subtitle={`${title} · ${order.orderNo}`}>
        <View style={[s.note, { backgroundColor: c.warnSoft }]}>
          <Text style={[s.noteT, { color: c.warn }]}>{r.precheckNote}</Text>
        </View>
        <Group>
          {order.items.filter((i) => i.status !== 'voided' && i.status !== 'pending').map((i) => (
            <Cell key={i.id} title={itemTitle(i)} titleLines={2} value={fmtMoney(i.total)} />
          ))}
        </Group>
        <Group>
          <Cell title={r.subtotal} value={fmtMoney(bill.subtotal, { suffix: true })} />
          {bill.dueServiceCharge > 0 ? <Cell title={tr(r.service, { pct: bill.servicePct })} value={fmtMoney(bill.dueServiceCharge, { suffix: true })} /> : null}
          {bill.duePackFee > 0 ? <Cell title={r.packFee} value={fmtMoney(bill.duePackFee, { suffix: true })} /> : null}
          {bill.paid > 0 ? <Cell title={r.paid} value={fmtMoney(bill.paid, { suffix: true })} valueColor={c.ok} /> : null}
          <Cell title={r.due} right={<Text style={[s.dueBig, tabular, { color: c.ink }]}>{fmtMoney(bill.due, { suffix: true })}</Text>} />
        </Group>
        <Text style={[s.hint, { color: c.ink3, textAlign: 'center' }]}>{r.payAtCashier}</Text>
      </Sheet>
    </Screen>
  );
}

const s = StyleSheet.create({
  footRow: { flexDirection: 'row', gap: 10 },
  btnRow: { flexDirection: 'row', gap: 10, padding: 12 },
  btnPad: { padding: 12 },
  due: { fontSize: 19, fontWeight: '800' },
  dueBig: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  hint: { fontSize: 14, fontWeight: '500', lineHeight: 20 },
  note: { borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center' },
  noteT: { fontSize: 15, fontWeight: '800' },
});
