import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/lib/api';
import { colors, fmtSum } from '@/lib/theme';

interface Product {
  id: string;
  name: string;
  imei: string;
  barcode: string | null;
  salePrice: number;
  purchasePrice: number;
  status: string;
  trackQuantity: boolean;
  available: number;
}
interface ProductsResp { page: number; total: number; hasMore: boolean; items: Product[] }

export default function Products() {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (search: string, pg: number, append: boolean) => {
    try {
      const res = await api<ProductsResp>(`/api/mobile/products?q=${encodeURIComponent(search)}&page=${pg}`);
      setTotal(res.total);
      setHasMore(res.hasMore);
      setPage(res.page);
      setItems((prev) => (append ? [...prev, ...res.items] : res.items));
    } catch {
      if (!append) setItems([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); load(q, 1, false); /* eslint-disable-next-line */ }, [load]));

  function onSearch(text: string) {
    setQ(text);
    setLoading(true);
    load(text, 1, false);
  }
  const onRefresh = useCallback(() => { setRefreshing(true); load(q, 1, false); }, [load, q]);
  function onEnd() {
    if (hasMore && !loadingMore) { setLoadingMore(true); load(q, page + 1, true); }
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <Text style={s.title}>Ombor</Text>
        <Text style={s.count}>{fmtSum(total)} ta mahsulot</Text>
      </View>
      <View style={s.searchWrap}>
        <Ionicons name="search" size={18} color={colors.textFaint} />
        <TextInput style={s.search} placeholder="Nomi, IMEI yoki barcode" value={q} onChangeText={onSearch}
          autoCapitalize="none" placeholderTextColor={colors.textFaint} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{ padding: 16, paddingTop: 6 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
          onEndReached={onEnd}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={<Text style={s.empty}>Mahsulot topilmadi</Text>}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.brand} style={{ marginVertical: 16 }} /> : null}
          renderItem={({ item }) => (
            <View style={s.row}>
              <View style={s.rowMain}>
                <Text style={s.name} numberOfLines={1}>{item.name}</Text>
                <Text style={s.meta} numberOfLines={1}>
                  {item.imei ? `IMEI: ${item.imei}` : item.barcode ? `Barcode: ${item.barcode}` : '—'}
                </Text>
              </View>
              <View style={s.rowSide}>
                <Text style={s.price}>{fmtSum(item.salePrice)} so'm</Text>
                <View style={[s.badge, item.available > 0 ? s.badgeOk : s.badgeOut]}>
                  <Text style={[s.badgeText, item.available > 0 ? s.badgeTextOk : s.badgeTextOut]}>
                    {item.available > 0 ? `${fmtSum(item.available)} dona` : 'Tugagan'}
                  </Text>
                </View>
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 18, paddingTop: 8 },
  title: { fontSize: 24, fontWeight: '800', color: colors.text },
  count: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, marginHorizontal: 16, marginTop: 12, marginBottom: 4 },
  search: { flex: 1, paddingVertical: 11, fontSize: 15, color: colors.text },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 40 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, marginBottom: 10 },
  rowMain: { flex: 1, paddingRight: 10 },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  rowSide: { alignItems: 'flex-end' },
  price: { fontSize: 15, fontWeight: '800', color: colors.text },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginTop: 6 },
  badgeOk: { backgroundColor: '#dcfce7' },
  badgeOut: { backgroundColor: '#fee2e2' },
  badgeText: { fontSize: 11, fontWeight: '700' },
  badgeTextOk: { color: '#15803d' },
  badgeTextOut: { color: '#b91c1c' },
});
