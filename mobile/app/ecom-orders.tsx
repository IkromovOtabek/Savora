import { useCallback, useRef, useState } from 'react';
import { View, Pressable, Alert, Linking, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import {
  Screen, NavBar, LargeTitle, Group, Field, Button, SegmentedControl, Loading, EmptyState, ErrorState, InlineError, CacheStamp,
} from '@/components/ui';
import { api, errMsg } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useResource } from '@/lib/hooks';
import { useTheme, tabular } from '@/lib/theme';
import { useDict, tr } from '@/lib/i18n';
import { fmtMoney, fmtDateTime } from '@/lib/format';
import { formatUzPhoneInput } from '@/lib/phone';
import { useMarketDict } from '@/lib/marketI18n';
import type { OrderView } from '@/lib/market';
import { OrderItems, StatusPill } from '@/components/market/parts';

type Tab = 'active' | 'done';
type Action = 'accept' | 'reject' | 'complete';

/**
 * Onlayn buyurtmalar (Savora Market xaridorlaridan, faqat do'kon egasi): qabul qilish, rad etish (sabab bilan),
 * yakunlash — tovar ombordan ayriladi va naqd sotuv yoziladi. To'lov topshirishda.
 */
export default function EcomOrders() {
  const m = useMarketDict();
  const k = m.ecomOrders;
  const d = useDict();
  const { c } = useTheme();
  const { me } = useAuth();
  const isAdmin = !!me?.user.isAdmin;

  const [tab, setTab] = useState<Tab>('active');
  const res = useResource<{ items: OrderView[] }>(isAdmin ? `/api/mobile/ecom/orders?tab=${tab}` : null);
  const first = useRef(true);
  useFocusEffect(useCallback(() => { if (first.current) { first.current = false; return; } res.reloadSilently(); }, [res.reloadSilently]));

  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  async function act(o: OrderView, action: Action, why?: string) {
    if (busy) return;
    setBusy(`${o.id}:${action}`);
    try {
      const r = await api<{ ok: boolean; message: string; saleNos?: string[] }>(
        `/api/mobile/ecom/orders/${encodeURIComponent(o.id)}`,
        { method: 'POST', body: { action, ...(why ? { reason: why } : {}) } },
      );
      setRejecting(null);
      setReason('');
      const sales = r.saleNos?.length ? `\n${tr(k.sales, { list: r.saleNos.join(', ') })}` : '';
      Alert.alert(`№ ${o.orderNo}`, `${r.message}${sales}`);
    } catch (e) {
      Alert.alert(d.common.error, errMsg(e));
    } finally {
      setBusy(null);
      res.reloadSilently();
    }
  }

  function onComplete(o: OrderView) {
    Alert.alert(k.completeTitle, k.confirmComplete, [
      { text: k.cancel, style: 'cancel' },
      { text: k.complete, onPress: () => void act(o, 'complete') },
    ]);
  }

  function call(phone: string) {
    const digitsOnly = phone.replace(/[^\d+]/g, '');
    if (digitsOnly) void Linking.openURL(`tel:${digitsOnly}`).catch(() => { /* qo'ng'iroq qila olmaydigan qurilma */ });
  }

  const header = <NavBar />;
  if (!isAdmin) {
    return (
      <Screen header={header}>
        <LargeTitle title={k.title} />
        <EmptyState icon="lock-closed-outline" title={k.title} message={m.ecom.adminOnly} />
      </Screen>
    );
  }

  const items = res.data?.items ?? [];

  return (
    <Screen header={header} refreshing={res.refreshing} onRefresh={res.refresh} keyboard gap={16}>
      <LargeTitle title={k.title} subtitle={k.sub} />
      <SegmentedControl<Tab>
        options={[{ key: 'active', label: k.tabActive }, { key: 'done', label: k.tabDone }]}
        value={tab}
        onChange={(v) => { setTab(v); setRejecting(null); }}
      />
      <CacheStamp of={res} />
      {res.error && items.length > 0 ? <InlineError message={res.error} onRetry={res.refresh} /> : null}

      {res.loading && !items.length ? <Loading />
        : res.error && !items.length ? <ErrorState message={res.error} onRetry={res.retry} />
        : !items.length ? <EmptyState icon="receipt-outline" title={k.emptyTitle} message={tab === 'active' ? k.empty : k.emptyDone} />
        : items.map((o) => {
          const isBusy = (a: Action) => busy === `${o.id}:${a}`;
          const open = o.status === 'new' || o.status === 'accepted';
          return (
            <Group key={o.id} header={`№ ${o.orderNo}`} icon="receipt-outline" headerRight={<StatusPill status={o.status} labels={k.status} />}>
              <View style={s.body}>
                <Text style={[s.meta, tabular, { color: c.ink3 }]}>{fmtDateTime(o.createdAt)}</Text>

                {o.buyerName || o.buyerPhone ? (
                  <View style={s.row}>
                    <Ionicons name="person-outline" size={18} color={c.ink3} />
                    <Text style={[s.info, { color: c.ink }]} numberOfLines={1}>{o.buyerName || k.buyer}</Text>
                    {o.buyerPhone ? (
                      <Pressable
                        onPress={() => call(o.buyerPhone!)}
                        hitSlop={8}
                        accessibilityRole="link"
                        accessibilityLabel={`${k.call}: ${o.buyerPhone}`}
                        style={({ pressed }) => [s.phone, { backgroundColor: c.tintSoft }, pressed && { opacity: 0.6 }]}
                      >
                        <Ionicons name="call" size={14} color={c.tint} />
                        <Text style={[s.phoneT, tabular, { color: c.tint }]} numberOfLines={1}>{formatUzPhoneInput(o.buyerPhone)}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}

                <View style={s.row}>
                  <Ionicons name={o.delivery === 'delivery' ? 'car-outline' : 'walk-outline'} size={18} color={c.ink3} />
                  <Text style={[s.info, { color: c.ink2 }]}>{o.delivery === 'delivery' ? k.delivery : k.pickup}</Text>
                </View>
                {o.address ? (
                  <View style={s.row}>
                    <Ionicons name="location-outline" size={18} color={c.ink3} />
                    <Text style={[s.info, { color: c.ink2 }]}>{o.address}</Text>
                  </View>
                ) : null}
                {o.note ? (
                  <View style={s.row}>
                    <Ionicons name="chatbubble-ellipses-outline" size={18} color={c.ink3} />
                    <Text style={[s.info, { color: c.ink2 }]}>{o.note}</Text>
                  </View>
                ) : null}

                <OrderItems items={o.items} />
                <View style={s.totalRow}>
                  <Text style={[s.totalL, { color: c.ink2 }]}>{k.total}</Text>
                  <Text style={[s.totalV, tabular, { color: c.ink }]}>{fmtMoney(o.total, { suffix: true })}</Text>
                </View>

                {o.reason ? (
                  <View style={[s.reason, { backgroundColor: c.badSoft }]}>
                    <Text style={[s.info, { color: c.bad }]}>{tr(m.orders.reason, { reason: o.reason })}</Text>
                  </View>
                ) : null}

                {/* Rad etish sababi — Android'da Alert.prompt yo'q, shu sabab qator ichida */}
                {open && rejecting === o.id ? (
                  <View style={{ gap: 10 }}>
                    <Field label={k.rejectReason} value={reason} onChangeText={setReason} placeholder={k.rejectPh} maxLength={300} autoFocus />
                    <View style={s.actions}>
                      <Button title={k.cancel} variant="gray" style={{ flex: 1 }} onPress={() => { setRejecting(null); setReason(''); }} />
                      <Button title={k.confirm} variant="destructive" style={{ flex: 1 }} loading={isBusy('reject')} onPress={() => void act(o, 'reject', reason.trim())} />
                    </View>
                  </View>
                ) : open ? (
                  <View style={s.actions}>
                    {o.status === 'new' ? (
                      <Button title={k.accept} icon="checkmark" style={{ flex: 1 }} loading={isBusy('accept')} disabled={!!busy} onPress={() => void act(o, 'accept')} />
                    ) : (
                      <Button title={k.complete} icon="checkmark-done" style={{ flex: 1 }} loading={isBusy('complete')} disabled={!!busy} onPress={() => onComplete(o)} />
                    )}
                    <Button title={k.reject} variant="destructive" style={{ flex: 1 }} disabled={!!busy} onPress={() => { setRejecting(o.id); setReason(''); }} />
                  </View>
                ) : null}
              </View>
            </Group>
          );
        })}
    </Screen>
  );
}

const s = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  meta: { fontSize: 13.5, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  info: { flex: 1, fontSize: 14.5, fontWeight: '500', lineHeight: 20 },
  phone: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 10, minHeight: 32, flexShrink: 0 },
  phoneT: { fontSize: 14, fontWeight: '700' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalL: { fontSize: 15, fontWeight: '600' },
  totalV: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  reason: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  actions: { flexDirection: 'row', gap: 10 },
});
