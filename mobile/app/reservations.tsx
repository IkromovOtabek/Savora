import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, Alert, Linking, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { errMsg } from '@/lib/api';
import { useCan } from '@/lib/auth';
import { useTheme, tabular } from '@/lib/theme';
import { fmtQty } from '@/lib/qty';
import { useDict, tr } from '@/lib/i18n';
import { usePolling } from '@/lib/restaurant';
import { reservationsApi, type Reservation, type ReservationsDay } from '@/lib/reservations';
import { addDays, canSeatNow, fmtDayShort, groupByHour, hasStarted, tashkentDay } from '@/lib/reservationTime';
import {
  Screen, NavBar, LargeTitle, SegmentedControl, Chips, Button, IconButton, Pill, Sheet, Field, Loading, ErrorState, InlineError,
  EmptyState,
} from '@/components/ui';

type DayKey = 'today' | 'tomorrow' | 'other';

/**
 * Bronlar — kun bo'yicha ro'yxat (soat guruhlari), «Keldi» (stol ochiladi → buyurtma ekrani), «Bekor qilish», «Kelmadi».
 * Yaratish/tahrirlash — reservation-new ekrani (faqat `reservation.manage`). Polling 30 s (fokusda).
 */
export default function Reservations() {
  const router = useRouter();
  const { c } = useTheme();
  const d = useDict();
  const r = d.reservations;
  const can = useCan();

  const [date, setDate] = useState(() => tashkentDay());
  const [branchId, setBranchId] = useState<string | null>(null);
  const [data, setData] = useState<ReservationsDay | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const busyRef = useRef(false);
  const gen = useRef(0);

  const load = useCallback(async (mode: 'initial' | 'refresh' | 'silent') => {
    const id = ++gen.current;
    if (mode === 'refresh') setRefreshing(true);
    try {
      const res = await reservationsApi.day(date, branchId);
      if (id !== gen.current) return;
      setData(res); setError(null);
    } catch (e) {
      if (id === gen.current) setError(errMsg(e));
    } finally {
      if (mode === 'refresh') setRefreshing(false);
      if (id === gen.current) setLoading(false);
    }
  }, [date, branchId]);

  useEffect(() => { setLoading(true); load('initial'); }, [load]);
  usePolling(() => load('silent'), 30_000);

  const today = data?.today ?? tashkentDay();
  const tomorrow = addDays(today, 1);
  const dayKey: DayKey = date === today ? 'today' : date === tomorrow ? 'tomorrow' : 'other';
  const canManage = !!data?.can.manage || can('reservation.manage');
  const groups = useMemo(() => groupByHour(data?.date === date ? data.items : []), [data, date]);

  /* ───── amallar ───── */
  async function act<T>(id: string, fn: () => Promise<T>, after?: (x: T) => void) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(id);
    try {
      const x = await fn();
      after?.(x);
      load('silent');
    } catch (e) {
      // Javob kelmasa (timeout) — errMsg «natija noma'lum» deydi; ro'yxat yangilanadi, takroriy «Keldi» xavfsiz
      Alert.alert(d.common.error, errMsg(e));
      load('silent');
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  function seat(x: Reservation) {
    act(x.id, () => reservationsApi.seat(x.id), (res) => {
      router.push(`/order/${res.orderId}`);
      if (res.skipped.length) {
        Alert.alert(r.seated, tr(r.seatedSkipped, { n: res.skipped.length, names: res.skipped.map((s) => s.name).join(', ') }));
      }
    });
  }

  function noShow(x: Reservation) {
    Alert.alert(r.noShow, tr(r.noShowConfirm, { name: x.customerName, time: x.time }), [
      { text: r.keep, style: 'cancel' },
      { text: r.noShow, style: 'destructive', onPress: () => act(x.id, () => reservationsApi.noShow(x.id)) },
    ]);
  }

  const [cancelFor, setCancelFor] = useState<Reservation | null>(null);
  const [reason, setReason] = useState('');
  function confirmCancel() {
    const x = cancelFor;
    if (!x) return;
    act(x.id, () => reservationsApi.cancel(x.id, reason.trim() || undefined), () => { setCancelFor(null); setReason(''); });
  }

  /* ───── ko'rinish ───── */
  const header = <NavBar />;
  const subtitle = data && data.date === date && data.items.length
    ? tr(r.counts, { n: data.counts.booked + data.counts.seated, g: data.counts.guests })
    : undefined;
  const title = <LargeTitle title={r.title} subtitle={subtitle} />;

  if (loading && !data) return <Screen header={header}>{title}<Loading /></Screen>;
  if (!data) return <Screen header={header}>{title}<ErrorState message={error} onRetry={() => { setLoading(true); load('initial'); }} /></Screen>;

  return (
    <Screen header={header} refreshing={refreshing} onRefresh={() => load('refresh')} gap={14}>
      {title}
      {error ? <InlineError message={error} onRetry={() => load('silent')} /> : null}

      {data.branches.length > 1 ? (
        <Chips options={data.branches.map((b) => ({ key: b.id, label: b.name }))} value={branchId ?? data.branchId} onChange={setBranchId} />
      ) : null}

      <View style={s.days}>
        <IconButton icon="chevron-back" label={r.prevDay} onPress={() => setDate(addDays(date, -1))} />
        <View style={{ flex: 1 }}>
          <SegmentedControl<DayKey>
            options={[
              { key: 'today', label: r.today },
              { key: 'tomorrow', label: r.tomorrow },
              ...(dayKey === 'other' ? [{ key: 'other' as const, label: fmtDayShort(date) }] : []),
            ]}
            value={dayKey}
            onChange={(k) => { if (k === 'today') setDate(today); else if (k === 'tomorrow') setDate(tomorrow); }}
          />
        </View>
        <IconButton icon="chevron-forward" label={r.nextDay} onPress={() => setDate(addDays(date, 1))} />
      </View>

      {canManage ? <Button title={r.newBtn} icon="add-circle" size="lg" full onPress={() => router.push(`/reservation-new?date=${date}${data.branches.length > 1 ? `&branchId=${data.branchId}` : ''}`)} /> : null}

      {groups.length === 0 ? (
        <EmptyState icon="calendar-outline" title={r.empty} message={canManage ? r.emptyHint : r.emptyHintNoManage} />
      ) : groups.map((g) => (
        <View key={g.hour} style={{ gap: 8 }}>
          <Text style={[s.hour, tabular, { color: c.ink2 }]} accessibilityRole="header">{g.hour}</Text>
          {g.items.map((x) => (
            <Card
              key={x.id}
              x={x}
              canManage={canManage}
              busy={busy === x.id}
              disabled={!!busy}
              onSeat={() => seat(x)}
              onEdit={() => router.push(`/reservation-new?id=${x.id}`)}
              onCancel={() => { setReason(''); setCancelFor(x); }}
              onNoShow={() => noShow(x)}
              onOpenOrder={() => x.orderId && router.push(`/order/${x.orderId}`)}
            />
          ))}
        </View>
      ))}

      <Sheet
        visible={!!cancelFor}
        onClose={() => setCancelFor(null)}
        title={r.cancelTitle}
        subtitle={cancelFor ? `${cancelFor.time} · ${tr(r.tableN, { n: cancelFor.tableNumber })} · ${cancelFor.customerName}` : undefined}
        closeLabel={r.keep}
        footer={<Button title={r.cancel} variant="destructive" size="lg" full loading={!!busy} onPress={confirmCancel} />}
      >
        <Chips options={r.cancelReasons.map((p) => ({ key: p, label: p }))} value={r.cancelReasons.includes(reason) ? reason : null} onChange={setReason} />
        <Field value={reason} onChangeText={setReason} placeholder={r.cancelNoReason} maxLength={200} />
      </Sheet>
    </Screen>
  );
}

function Card({ x, canManage, busy, disabled, onSeat, onEdit, onCancel, onNoShow, onOpenOrder }: {
  x: Reservation; canManage: boolean; busy: boolean; disabled: boolean;
  onSeat: () => void; onEdit: () => void; onCancel: () => void; onNoShow: () => void; onOpenOrder: () => void;
}) {
  const { c } = useTheme();
  const d = useDict();
  const r = d.reservations;
  const booked = x.status === 'booked';
  const edge = x.late ? c.warn : x.status === 'seated' ? c.ok : booked ? c.tint : c.fill3;
  const items = x.items.map((i) => `${i.name}${i.options.length ? ` (${i.options.join(', ')})` : ''} ×${fmtQty(i.qty)}`).join(', ');
  return (
    <Pressable
      onPress={booked && canManage ? onEdit : x.status === 'seated' ? onOpenOrder : undefined}
      disabled={!(booked && canManage) && x.status !== 'seated'}
      accessibilityRole="button"
      accessibilityLabel={[x.time, x.customerName, tr(r.tableN, { n: x.tableNumber }), tr(r.guestsN, { n: x.guests }), r.statuses[x.status]].join(', ')}
      style={({ pressed }) => [s.card, { backgroundColor: c.cell, borderLeftColor: edge, opacity: booked || x.status === 'seated' ? 1 : 0.7 }, pressed && { opacity: 0.7 }]}
    >
      <View style={s.top}>
        <View style={s.time}>
          <Text style={[s.timeT, tabular, { color: c.ink }]}>{x.time}</Text>
          <Text style={[s.small, tabular, { color: c.ink3 }]}>–{x.endTime}</Text>
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={s.nameRow}>
            <Text style={[s.name, { color: c.ink }]} numberOfLines={1}>{x.customerName}</Text>
            {x.late ? <Pill label={r.late} tone="warn" /> : !booked ? <Pill label={r.statuses[x.status]} tone={x.status === 'seated' ? 'ok' : 'mut'} /> : null}
          </View>
          <Text style={[s.meta, { color: c.ink2 }]}>
            <Text style={{ fontWeight: '800', color: c.ink }}>{tr(r.tableN, { n: x.tableNumber })}</Text>
            {` · ${tr(r.guestsN, { n: x.guests })}${x.hallName ? ` · ${x.hallName}` : ''}`}
          </Text>
          <Pressable onPress={() => Linking.openURL(`tel:${x.customerPhone.replace(/[^\d+]/g, '')}`)} hitSlop={6} accessibilityRole="link" accessibilityLabel={`${r.call}: ${x.customerPhone}`} style={s.phone}>
            <Ionicons name="call" size={14} color={c.tint} />
            <Text style={[s.phoneT, tabular, { color: c.tint }]}>{x.customerPhone}</Text>
          </Pressable>
          {items ? <Text style={[s.small, { color: c.ink2 }]} numberOfLines={3}>{`${tr(r.itemsN, { n: x.items.length })}: ${items}`}</Text> : null}
          {x.note ? <Text style={[s.note, { backgroundColor: c.fill2, color: c.ink2 }]}>{x.note}</Text> : null}
          {x.cancelReason ? <Text style={[s.small, { color: c.ink3 }]}>{x.cancelReason}</Text> : null}
        </View>
      </View>
      {booked ? (
        <View style={s.actions}>
          {canSeatNow(x.startAt) ? <Button title={r.seat} icon="checkmark-circle" size="md" loading={busy} disabled={disabled} onPress={onSeat} style={{ flex: 1.4 }} /> : null}
          {canManage && hasStarted(x.startAt) ? <Button title={r.noShow} variant="gray" size="md" disabled={disabled} onPress={onNoShow} style={{ flex: 1 }} /> : null}
          {canManage ? <Button title={r.cancel} variant="destructive" size="md" disabled={disabled} onPress={onCancel} style={{ flex: 1 }} /> : null}
        </View>
      ) : x.status === 'seated' && x.orderId ? (
        <View style={s.actions}>
          <Button title={r.openOrder} variant="tinted" size="md" onPress={onOpenOrder} style={{ flex: 1 }} />
        </View>
      ) : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  days: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hour: { fontSize: 15, fontWeight: '800', paddingHorizontal: 4, marginTop: 4 },
  card: { borderRadius: 18, padding: 14, gap: 12, borderLeftWidth: 4 },
  top: { flexDirection: 'row', gap: 12 },
  time: { width: 60, gap: 1 },
  timeT: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  small: { fontSize: 13, fontWeight: '500' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 17, fontWeight: '700', flexShrink: 1 },
  meta: { fontSize: 14, fontWeight: '600' },
  phone: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', minHeight: 26 },
  phoneT: { fontSize: 14, fontWeight: '700' },
  note: { fontSize: 13.5, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, overflow: 'hidden' },
  actions: { flexDirection: 'row', gap: 8 },
});
