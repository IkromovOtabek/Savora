import { View, Pressable, StyleSheet } from 'react-native';
import { Text } from '@/components/ui/Text';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '@/lib/theme';
import { useDict, tr } from '@/lib/i18n';
import { useOfflinePos } from '@/lib/offlinePos';

/**
 * Oflayn holat chizig'i: yuborilmagan sotuvlar yoki muammolar bo'lsa ko'rinadi,
 * bosilsa "Oflayn sotuvlar" ekrani ochiladi. Hammasi joyida bo'lsa — hech narsa chizmaydi.
 */
export function OfflineBanner() {
  const { pendingCount, problemCount, offline, syncing } = useOfflinePos();
  const { c } = useTheme();
  const d = useDict();
  const router = useRouter();
  const o = d.offline;

  if (pendingCount === 0 && problemCount === 0) return null;
  const bad = problemCount > 0;
  const color = bad ? c.bad : c.warn;
  const title = bad ? tr(o.problemBanner, { n: problemCount }) : tr(o.pendingBanner, { n: pendingCount });
  const sub = syncing ? o.syncing : offline ? o.offlineNow : bad && pendingCount > 0 ? tr(o.pendingBanner, { n: pendingCount }) : null;

  return (
    <Pressable
      onPress={() => router.push('/offline-sales')}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [s.box, { backgroundColor: bad ? c.badSoft : c.warnSoft }, pressed && { opacity: 0.6 }]}
    >
      <Ionicons name={bad ? 'alert-circle' : 'cloud-offline'} size={22} color={color} />
      <View style={{ flex: 1 }}>
        <Text style={[s.t, { color: c.ink }]}>{title}</Text>
        {sub ? <Text style={[s.sub, { color: c.ink3 }]}>{sub}</Text> : null}
      </View>
      <Text style={[s.link, { color }]}>{o.tapToOpen}</Text>
      <Ionicons name="chevron-forward" size={16} color={color} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14 },
  t: { fontSize: 15, fontWeight: '600' },
  sub: { fontSize: 13, marginTop: 2 },
  link: { fontSize: 14, fontWeight: '600' },
});
