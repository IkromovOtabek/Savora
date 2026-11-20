import { View, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { useResource } from '@/lib/hooks';
import { usePolling } from '@/lib/restaurant';
import { useTheme } from '@/lib/theme';
import { useDict, tr } from '@/lib/i18n';
import { badgeText, type NotificationList } from '@/lib/notifyModel';

/**
 * Bosh sahifa sarlavhasidagi qo'ng'iroqcha: o'qilmaganlar soni (faqat son — `limit=0`), bosilganda ro'yxat ekrani.
 * Ekran fokusda va ilova faol bo'lganda har 15 s yangilanadi; ro'yxatdan qaytganda — darhol (usePolling).
 * Ko'rinishi IconButton bilan bir xil (46 pt doira).
 */
export function NotifyBellButton() {
  const { c } = useTheme();
  const d = useDict();
  const router = useRouter();
  const res = useResource<NotificationList>('/api/mobile/notifications?limit=0');
  usePolling(res.reloadSilently, 15_000);
  const unread = res.data?.unread ?? 0;
  const badge = badgeText(unread);
  return (
    <Pressable
      onPress={() => router.push('/notifications')}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={unread > 0 ? tr(d.notify.bellUnread, { n: unread }) : d.notify.bell}
      style={({ pressed }) => [s.btn, { backgroundColor: c.fill }, pressed && { opacity: 0.5 }]}
    >
      <Ionicons name={unread > 0 ? 'notifications' : 'notifications-outline'} size={24} color={c.tint} />
      {badge ? (
        <View style={[s.badge, { backgroundColor: c.bad, borderColor: c.bg }]} pointerEvents="none">
          <Text style={s.badgeT} numberOfLines={1}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  btn: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute', top: -2, right: -4, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2,
  },
  badgeT: { color: '#fff', fontSize: 11, fontWeight: '700', lineHeight: 14 },
});
