import { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, ActivityIndicator, RefreshControl, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, tiles, fmtSum } from '@/lib/theme';

interface Product {
  id: string; name: string; imei: string; barcode: string | null;
  salePrice: number; purchasePrice: number; status: string; trackQuantity: boolean; available: number;
}
interface ProductsResp { page: number; total: number; hasMore: boolean; items: Product[] }

export default function Products() {
  const router = useRouter();
  const { me } = useAuth();
  const t = me?.terms;
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
      setTotal(res.total); setHasMore(res.hasMore); setPage(res.page);
      setItems((prev) => (append ? [...prev, ...res.items] : res.items));
    } catch { if (!append) setItems([]); }
    finally { setLoading(false); setLoadingMore(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); load(q, 1, false); }, [load])); // eslint-disable-line react-hooks/exhaustive-deps

  function onSearch(text: string) { setQ(text); setLoading(true); load(text, 1, false); }
  const onRefresh = useCallback(() => { setRefreshing(true); load(q, 1, false); }, [load, q]);
  function onEnd() { if (hasMore && !loadingMore) { setLoadingMore(true); load(q, page + 1, true); } }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <View>
          <Text style={s.title}>{t?.items ?? 'Ombor'}</Text>
          <Text style={s.count}>{fmtSum(total)} ta</Text>
        </View>
        <View style={s.actions}>
          <TouchableOpacity style={s.iconBtn} onPress={() => router.push('/scan')} activeOpacity={0.8}>
            <Ionicons name="barcode-outline" size={22} color={colors.brand} />
          </TouchableOpacity>
          <TouchableOpacity style={s.addBtn} onPress={() => router.push('/product-new')} activeOpacity={0.85}>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={s.addT}>Qo&apos;shish</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={s.searchWrap}>
        <Ionicons name="search" size={18} color={colors.textFaint} />
        <TextInput style={s.search} placeholder={`Nomi, ${t?.codeLabel ?? 'kod'}`} value={q} onChangeText={onSearch}
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
          ListEmptyComponent={<Text style={s.empty}>{q ? 'Topilmadi' : `${t?.item ?? 'Mahsulot'} yo'q`}</Text>}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.brand} style={{ marginVertical: 16 }} /> : null}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.row} activeOpacity={0.7} onPress={() => router.push(`/product/${item.id}`)}>
              <View style={s.rowMain}>
                <Text style={s.name} numberOfLines={1}>{item.name}</Text>
                <Text style={s.meta} numberOfLines={1}>
                  {item.imei && !item.imei.startsWith('SVR-') ? `${t?.codeLabel ?? 'Kod'}: ${item.imei}` : item.barcode ? `Shtrix: ${item.barcode}` : '—'}
                </Text>
              </View>
              <View style={s.rowSide}>
                <Text style={s.price}>{fmtSum(item.salePrice)}</Text>
                <View style={[s.badge, { backgroundColor: item.available > 0 ? tiles.green.bg : tiles.red.bg }]}>
                  <Text style={[s.badgeText, { color: item.available > 0 ? tiles.green.fg : tiles.red.fg }]}>
                    {item.available > 0 ? `${fmtSum(item.available)} dona` : 'Tugagan'}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textFaint} style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  title: { fontSize: 24, fontWeight: '800', color: colors.text },
  count: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { width: 42, height: 42, borderRadius: 12, backgroundColor: tiles.indigo.bg, alignItems: 'center', justifyContent: 'center' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.brand, borderRadius: 12, paddingHorizontal: 12, height: 42 },
  addT: { color: '#fff', fontSize: 14, fontWeight: '700' },
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
  badgeText: { fontSize: 11, fontWeight: '700' },
});
