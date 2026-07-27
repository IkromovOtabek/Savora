import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/lib/api';
import { colors, tiles, fmtSum } from '@/lib/theme';

interface P { id: string; name: string; salePrice: number }
interface B { id: string; name: string; isMain: boolean }

export default function Transfer() {
  const router = useRouter();
  const params = useLocalSearchParams<{ productId?: string; name?: string }>();
  const [picked, setPicked] = useState<P | null>(
    params.productId && params.name ? { id: String(params.productId), name: String(params.name), salePrice: 0 } : null
  );
  const [q, setQ] = useState('');
  const [list, setList] = useState<P[]>([]);
  const [branches, setBranches] = useState<B[]>([]);
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const search = useCallback(async (text: string) => {
    try { const r = await api<{ items: P[] }>(`/api/mobile/products?q=${encodeURIComponent(text)}`); setList(r.items); } catch { setList([]); }
  }, []);
  useEffect(() => { if (!picked) search(''); }, [picked, search]);
  useEffect(() => { api<{ items: B[] }>('/api/mobile/branches').then((r) => setBranches(r.items)).catch(() => {}); }, []);

  async function submit() {
    if (!picked || !target) { Alert.alert('Tanlov', 'Mahsulot va filialni tanlang.'); return; }
    setBusy(true);
    try {
      await api('/api/mobile/transfer', { method: 'POST', body: { productId: picked.id, toBranchId: target } });
      const b = branches.find((x) => x.id === target);
      Alert.alert('Berildi', `${b?.name ?? 'Filial'}ga berildi.`);
      router.back();
    } catch (e) { Alert.alert('Xatolik', e instanceof Error ? e.message : 'Xatolik'); }
    finally { setBusy(false); }
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.bar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}><Ionicons name="chevron-back" size={26} color={colors.text} /></TouchableOpacity>
        <Text style={s.barTitle}>Filialga berish</Text>
        <View style={{ width: 26 }} />
      </View>

      {!picked ? (
        <>
          <View style={s.searchWrap}>
            <Ionicons name="search" size={18} color={colors.textFaint} />
            <TextInput style={s.search} placeholder="Mahsulot qidirish" value={q} onChangeText={(v) => { setQ(v); search(v); }} autoCapitalize="none" placeholderTextColor={colors.textFaint} />
          </View>
          <FlatList
            data={list} keyExtractor={(i) => i.id}
            contentContainerStyle={{ padding: 16, paddingTop: 6 }}
            ListEmptyComponent={<Text style={s.empty}>Mahsulot topilmadi</Text>}
            renderItem={({ item }) => (
              <TouchableOpacity style={s.pRow} activeOpacity={0.7} onPress={() => setPicked(item)}>
                <Text style={s.pName} numberOfLines={1}>{item.name}</Text>
                <Text style={s.pPrice}>{fmtSum(item.salePrice)}</Text>
              </TouchableOpacity>
            )}
          />
        </>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <TouchableOpacity style={s.pickedCard} onPress={() => setPicked(null)} activeOpacity={0.8}>
            <View style={{ flex: 1 }}><Text style={s.pickedName}>{picked.name}</Text><Text style={s.pickedChange}>O&apos;zgartirish</Text></View>
            <Ionicons name="swap-horizontal" size={20} color={colors.textMuted} />
          </TouchableOpacity>

          <Text style={s.label}>Qaysi filialga?</Text>
          {branches.map((b) => (
            <TouchableOpacity key={b.id} style={[s.bRow, target === b.id && s.bActive]} onPress={() => setTarget(b.id)} activeOpacity={0.8}>
              <Ionicons name="business-outline" size={20} color={target === b.id ? colors.brand : colors.textMuted} />
              <Text style={[s.bName, target === b.id && { color: colors.brand }]}>{b.name}{b.isMain ? ' (asosiy)' : ''}</Text>
              {target === b.id ? <Ionicons name="checkmark-circle" size={22} color={colors.brand} /> : <Ionicons name="ellipse-outline" size={20} color={colors.textFaint} />}
            </TouchableOpacity>
          ))}

          <TouchableOpacity style={[s.save, (busy || !target) && { opacity: 0.6 }]} onPress={submit} disabled={busy || !target} activeOpacity={0.85}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.saveT}>Berish</Text>}
          </TouchableOpacity>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10 },
  barTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, marginHorizontal: 16, marginTop: 8 },
  search: { flex: 1, paddingVertical: 11, fontSize: 15, color: colors.text },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 30 },
  pRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, marginBottom: 8 },
  pName: { flex: 1, fontSize: 14.5, fontWeight: '600', color: colors.text, paddingRight: 10 },
  pPrice: { fontSize: 14.5, fontWeight: '800', color: colors.text },
  pickedCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: tiles.indigo.bg, borderRadius: 14, padding: 14, marginBottom: 18 },
  pickedName: { fontSize: 15.5, fontWeight: '700', color: colors.brand },
  pickedChange: { fontSize: 12.5, color: colors.brand, marginTop: 2, opacity: 0.8 },
  label: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginBottom: 8 },
  bRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, marginBottom: 10 },
  bActive: { borderColor: colors.brand, backgroundColor: tiles.indigo.bg },
  bName: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  save: { backgroundColor: colors.brand, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 12 },
  saveT: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
