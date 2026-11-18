import { Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { BrandMark } from '@/components/ui';
import { Catalog } from '@/components/market/Catalog';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { useMarketDict } from '@/lib/marketI18n';

/**
 * Ilova ochilganda (biznes sessiyasi yo'q) — Savora Market katalogi.
 * Do'kon egasi panelga «Biznes uchun kirish» havolasi orqali kiradi.
 */
export default function MarketHome() {
  const m = useMarketDict();
  const { c } = useTheme();
  const { me } = useAuth();
  const router = useRouter();

  const business = (
    <Pressable
      onPress={() => (me ? router.replace('/(tabs)') : router.push('/login'))}
      hitSlop={6}
      accessibilityRole="link"
      style={({ pressed }) => [s.biz, { backgroundColor: c.tintSoft }, pressed && { opacity: 0.6 }]}
    >
      <Ionicons name="briefcase-outline" size={16} color={c.tint} />
      <Text style={[s.bizT, { color: c.tint }]} numberOfLines={1}>{me ? m.businessPanel : m.forBusiness}</Text>
      <Ionicons name="chevron-forward" size={15} color={c.tint} />
    </Pressable>
  );

  return <Catalog title={m.brand} subtitle={m.tagline} left={<BrandMark size={40} />} extra={business} />;
}

const s = StyleSheet.create({
  biz: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 12, minHeight: 34 },
  bizT: { fontSize: 14, fontWeight: '700' },
});
