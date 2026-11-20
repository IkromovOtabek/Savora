import { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, Linking, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { api } from '@/lib/api';
import { useResource } from '@/lib/hooks';
import { usePolling } from '@/lib/restaurant';
import { useTheme } from '@/lib/theme';
import { useDict, tr } from '@/lib/i18n';
import { getPushStatus } from '@/lib/push';
import { agoText, notifyIconOf, notifyRouteOf, notifyToneOf, type NotificationItem, type NotificationList } from '@/lib/notifyModel';
import {
  Screen, NavBar, LargeTitle, Group, Cell, Button, Loading, ErrorState, InlineError, CacheStamp, EmptyState,
  type IconName,
} from '@/components/ui';

/**
 * Bildirishnomalar ro'yxati (GET/POST /api/mobile/notifications — web qo'ng'iroqcha bilan bir xil manba).
 * Yangisi tepada, o'qilmaganlar ajralib turadi; bosilganda — o'qildi va tegishli ekran (stollar, ombor).
 * Ekran ochiq va ilova faol bo'lganda har 15 s yangilanadi. Push o'chiq bo'lsa — ruxsat berish eslatmasi.
 */
const PATH = '/api/mobile/notifications?limit=50';

export default function Notifications() {
  const { c } = useTheme();
  const d = useDict();
  const t = d.notify;
  const router = useRouter();
  const res = useResource<NotificationList>(PATH);
  const { setData, reloadSilently } = res;
  const [skew, setSkew] = useState(0);
  const [pushOff, setPushOff] = useState(false);

  usePolling(reloadSilently, 15_000);
  useEffect(() => {
    if (res.data?.serverTime) setSkew(Date.parse(res.data.serverTime) - Date.now());
  }, [res.data?.serverTime]);
  useEffect(() => {
    void getPushStatus().then((s) => setPushOff(s === 'denied'));
  }, []);

  const markRead = useCallback(async (body: { id: string } | { all: true }) => {
    // Darhol ekranda (optimistik), keyin server; xato bo'lsa keyingi yangilanishda tiklanadi
    setData((v) => {
      if (!v) return v;
      const items = v.items.map((i) => ('all' in body || i.id === body.id ? { ...i, read: true } : i));
      return { ...v, items, unread: items.filter((i) => !i.read).length };
    });
    try {
      const r = await api<{ unread: number }>('/api/mobile/notifications', { method: 'POST', body });
      setData((v) => (v ? { ...v, unread: r.unread } : v));
    } catch {
      reloadSilently();
    }
  }, [setData, reloadSilently]);

  function open(n: NotificationItem) {
    if (!n.read) void markRead({ id: n.id });
    const route = notifyRouteOf(n.url);
    if (route) router.push(route);
  }

  const data = res.data;
  const unread = data?.unread ?? 0;
  const now = Date.now() + skew;
  const toneColor = { call: c.sq.r, stock: c.sq.o, info: c.sq.b } as const;

  return (
    <Screen
      header={<NavBar right={unread > 0 ? <Button title={t.markAll} size="sm" variant="plain" onPress={() => void markRead({ all: true })} /> : undefined} />}
      refreshing={res.refreshing}
      onRefresh={res.refresh}
    >
      <LargeTitle title={t.title} subtitle={data ? (unread > 0 ? tr(t.unreadN, { n: unread }) : t.allRead) : undefined} />

      {pushOff ? (
        <Pressable onPress={() => void Linking.openSettings()} accessibilityRole="button" style={[s.hint, { backgroundColor: c.fill }]}>
          <Text style={{ color: c.ink2, fontSize: 14, lineHeight: 19 }}>{t.pushOff}</Text>
        </Pressable>
      ) : null}

      {res.loading && !data ? <Loading /> : !data ? <ErrorState message={res.error} onRetry={res.retry} /> : (
        <>
          <CacheStamp of={res} />
          {res.error ? <InlineError message={res.error} onRetry={res.refresh} /> : null}
          {data.items.length === 0 ? (
            <EmptyState icon="notifications-outline" title={t.empty} message={t.emptyHint} />
          ) : (
            <Group>
              {data.items.map((n) => {
                const meta = [agoText(t, n.createdAt, now), n.handled ? t.handled : null].filter(Boolean).join(' · ');
                return (
                  <Cell
                    key={n.id}
                    icon={notifyIconOf(n.kind) as IconName}
                    iconColor={toneColor[notifyToneOf(n.kind)]}
                    title={n.title}
                    titleLines={2}
                    subtitle={[n.body, meta].filter(Boolean).join('\n')}
                    subtitleLines={4}
                    right={n.read ? undefined : <View style={[s.dot, { backgroundColor: c.tint }]} accessibilityLabel={t.unread} />}
                    chevron={!!notifyRouteOf(n.url)}
                    onPress={() => open(n)}
                    style={n.read ? undefined : { backgroundColor: c.tintSoft }}
                    accessibilityLabel={`${n.read ? '' : `${t.unread}. `}${n.title}. ${n.body}. ${meta}`}
                  />
                );
              })}
            </Group>
          )}
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  hint: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
