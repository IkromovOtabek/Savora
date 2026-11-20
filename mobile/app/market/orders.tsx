import { useCallback, useRef, useState } from 'react';
import { View, Alert, StyleSheet } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import {
  Screen, NavBar, LargeTitle, Group, Cell, Avatar, Button, Loading, EmptyState, ErrorState, InlineError,
} from '@/components/ui';
import { ApiError, errMsg } from '@/lib/api';
import { useTheme, tabular } from '@/lib/theme';
import { useDict, tr } from '@/lib/i18n';
import { fmtMoney, fmtDateTime } from '@/lib/format';
import { formatUzPhoneInput } from '@/lib/phone';
import { useMarketDict } from '@/lib/marketI18n';
import { useBuyer } from '@/lib/buyer';
import type { OrderView } from '@/lib/market';
import { CartButton, OrderItems, StatusPill } from '@/components/market/parts';

/** Savora Market: xaridorning buyurtmalari (holati, tovarlar, bekor qilish) va hisobdan chiqish. */
export default function MarketOrders() {
  const m = useMarketDict();
  const d = useDict();
  const { c } = useTheme();
  const router = useRouter();
  const { buyer, ready, request, logout } = useBuyer();
  const force = useRef(false);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['market', 'orders', buyer?.id ?? ''],
    queryFn: () => {
      const f = force.current;
      force.current = false;
      return request<{ items: OrderView[] }>('/api/market/orders', { force: f });
    },
    enabled: !!buyer,
    meta: { persist: false },
  });
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    force.current = true;
    try { await q.refetch(); } finally { setRefreshing(false); }
  }, [q]);

  // Ekranga qaytganda (masalan, yangi buyurtmadan keyin) — jim yangilash
  const first = useRef(true);
  const refetch = q.refetch;
  useFocusEffect(useCallback(() => {
    if (first.current) { first.current = false; return; }
    void refetch();
  }, [refetch]));

  const back = () => (router.canGoBack() ? router.back() : router.replace('/market'));
  const header = <NavBar onBack={back} right={<CartButton />} />;

  if (!buyer) {
    return (
      <Screen header={header}>
        <LargeTitle title={m.orders.title} />
        {ready ? (
          <EmptyState
            icon="person-circle-outline"
            title={m.auth.loginTitle}
            message={m.auth.sub}
            actionTitle={m.auth.login}
            onAction={() => router.replace(`/market/login?next=${encodeURIComponent('/market/orders')}`)}
          />
        ) : <Loading />}
      </Screen>
    );
  }

  function onCancel(o: OrderView) {
    Alert.alert(m.orders.cancelConfirm, `${o.shopName} · ${tr(m.orders.orderNo, { no: o.orderNo })}`, [
      { text: m.orders.keep, style: 'cancel' },
      {
        text: m.orders.cancelYes,
        style: 'destructive',
        onPress: async () => {
          setCancelling(o.id);
          try {
            await request<{ ok: boolean; message: string }>(`/api/market/orders/${encodeURIComponent(o.id)}/cancel`, { method: 'POST' });
          } catch (e) {
            Alert.alert(d.common.error, errMsg(e));
          } finally {
            setCancelling(null);
            void refetch();
          }
        },
      },
    ]);
  }

  function onLogout() {
    Alert.alert(m.orders.logout, m.orders.logoutConfirm, [
      { text: d.common.cancel, style: 'cancel' },
      { text: m.orders.logout, style: 'destructive', onPress: () => { void logout(); } },
    ]);
  }

  const items = q.data?.items ?? [];
  const error = q.error && !(q.error instanceof ApiError && q.error.status === 401) ? errMsg(q.error) : null;

  return (
    <Screen header={header} refreshing={refreshing} onRefresh={refresh} gap={16}>
      <LargeTitle title={m.orders.title} />

      <Group>
        <Cell
          left={<Avatar name={buyer.name} size={48} tone="b" />}
          title={buyer.name}
          subtitle={formatUzPhoneInput(buyer.phone)}
          style={{ minHeight: 70 }}
        />
        <Cell icon="log-out" iconColor={c.sq.r} title={m.orders.logout} destructive onPress={onLogout} />
        <Cell icon="trash" iconColor={c.sq.r} title={m.orders.deleteAccount} destructive chevron onPress={() => router.push('/market/delete-account')} />
      </Group>

      {error && items.length > 0 ? <InlineError message={error} onRetry={refresh} /> : null}

      {q.isPending ? <Loading />
        : error && !items.length ? <ErrorState message={error} onRetry={refresh} />
        : !items.length ? (
          <EmptyState icon="receipt-outline" title={m.orders.emptyTitle} message={m.orders.empty} actionTitle={m.orders.toCatalog} onAction={back} />
        ) : items.map((o) => (
          <Group key={o.id} header={o.shopName} icon="storefront-outline" headerRight={<StatusPill status={o.status} labels={m.orders.status} />}>
            <View style={s.body}>
              <Text style={[s.meta, tabular, { color: c.ink3 }]}>
                {tr(m.orders.orderNo, { no: o.orderNo })} · {fmtDateTime(o.createdAt)}
              </Text>
              <OrderItems items={o.items} />
              <View style={s.row}>
                <Ionicons name={o.delivery === 'delivery' ? 'car-outline' : 'walk-outline'} size={18} color={c.ink3} />
                <Text style={[s.info, { color: c.ink2 }]}>
                  {o.delivery === 'delivery' ? m.orders.delivery : m.orders.pickup}{o.address ? ` · ${o.address}` : ''}
                </Text>
              </View>
              {o.note ? (
                <View style={s.row}>
                  <Ionicons name="chatbubble-ellipses-outline" size={18} color={c.ink3} />
                  <Text style={[s.info, { color: c.ink2 }]}>{o.note}</Text>
                </View>
              ) : null}
              {o.reason ? (
                <View style={[s.reason, { backgroundColor: c.badSoft }]}>
                  <Text style={[s.info, { color: c.bad }]}>{tr(m.orders.reason, { reason: o.reason })}</Text>
                </View>
              ) : null}
              <View style={s.totalRow}>
                <Text style={[s.totalL, { color: c.ink2 }]}>{m.cart.total}</Text>
                <Text style={[s.totalV, tabular, { color: c.ink }]}>{fmtMoney(o.total, { suffix: true })}</Text>
              </View>
              {o.status === 'new' ? (
                <Button
                  title={m.orders.cancel}
                  variant="destructive"
                  icon="close-circle-outline"
                  loading={cancelling === o.id}
                  onPress={() => onCancel(o)}
                />
              ) : null}
            </View>
          </Group>
        ))}

      <Text style={[s.pay, { color: c.ink3 }]}>{m.product.payNote}</Text>
    </Screen>
  );
}

const s = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  meta: { fontSize: 13.5, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  info: { flex: 1, fontSize: 14.5, fontWeight: '500', lineHeight: 20 },
  reason: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalL: { fontSize: 15, fontWeight: '600' },
  totalV: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  pay: { fontSize: 13.5, fontWeight: '500', textAlign: 'center', paddingHorizontal: 16 },
});
