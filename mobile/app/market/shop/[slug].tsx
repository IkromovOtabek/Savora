import { View, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { Screen, NavBar, IconButton, EmptyState } from '@/components/ui';
import { Catalog } from '@/components/market/Catalog';
import { api, ApiError } from '@/lib/api';
import { useTheme } from '@/lib/theme';
import { useDict, tr } from '@/lib/i18n';
import { fmtMoney } from '@/lib/format';
import { useMarketDict } from '@/lib/marketI18n';

interface ShopInfo { slug: string; name: string; note?: string; count: number }

/** Savora Market: do'kon sahifasi — nomi, xarid shartlari va faqat shu do'kon tovarlari. */
export default function MarketShop() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const m = useMarketDict();
  const d = useDict();
  const { c } = useTheme();
  const router = useRouter();
  const shopSlug = String(slug ?? '');

  const q = useQuery({
    queryKey: ['market', 'shop', shopSlug],
    queryFn: () => api<{ shop: ShopInfo }>(`/api/market/shops/${encodeURIComponent(shopSlug)}`, { token: null }),
    enabled: !!shopSlug,
    meta: { persist: false },
  });
  const back = () => (router.canGoBack() ? router.back() : router.replace('/market'));

  if (q.error instanceof ApiError && q.error.status === 404) {
    return (
      <Screen header={<NavBar onBack={back} />}>
        <EmptyState icon="storefront-outline" title={d.common.notFound} message={m.shop.notFound} actionTitle={m.cart.toCatalog} onAction={back} />
      </Screen>
    );
  }

  const shop = q.data?.shop;
  const terms = shop?.note ? (
    <View style={[s.terms, { backgroundColor: c.cell }]}>
      <Ionicons name="information-circle-outline" size={22} color={c.tint} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[s.termsH, { color: c.ink }]}>{m.shop.terms}</Text>
        <Text style={[s.termsT, { color: c.ink2 }]}>{shop.note}</Text>
      </View>
    </View>
  ) : null;

  return (
    <Catalog
      shop={shopSlug}
      title={shop?.name ?? ' '}
      subtitle={shop ? tr(m.shop.count, { n: fmtMoney(shop.count) }) : undefined}
      left={<IconButton icon="chevron-back" label={d.common.back} onPress={back} />}
      listHeader={terms}
    />
  );
}

const s = StyleSheet.create({
  terms: { flexDirection: 'row', gap: 10, borderRadius: 18, padding: 14 },
  termsH: { fontSize: 15, fontWeight: '700' },
  termsT: { fontSize: 14.5, lineHeight: 20 },
});
