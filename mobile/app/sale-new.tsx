import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, tiles, fmtSum } from '@/lib/theme';

interface P { id: string; name: string; salePrice: number; available: number }
const digits = (v: string) => v.replace(/\D/g, '');
const grouped = (v: string) => digits(v).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

type Pay = 'cash' | 'debt' | 'installment' | 'bank_credit';

export default function SaleNew() {
  const router = useRouter();
  const params = useLocalSearchParams<{ productId?: string; name?: string; price?: string }>();
  const { me } = useAuth();
  const f = me?.features ?? {};

  const [picked, setPicked] = useState<P | null>(
    params.productId && params.name ? { id: String(params.productId), name: String(params.name), salePrice: Number(params.price) || 0, available: 1 } : null
  );
  const [q, setQ] = useState('');
  const [list, setList] = useState<P[]>([]);
  const [searching, setSearching] = useState(false);

  const [pay, setPay] = useState<Pay>('cash');
  const [total, setTotal] = useState(picked ? String(picked.salePrice) : '');
  const [paid, setPaid] = useState('');
  const [months, setMonths] = useState('6');
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [busy, setBusy] = useState(false);

  const search = useCallback(async (text: string) => {
    setSearching(true);
    try { const r = await api<{ items: P[] }>(`/api/mobile/products?q=${encodeURIComponent(text)}`); setList(r.items); }
    catch { setList([]); } finally { setSearching(false); }
  }, []);
  useEffect(() => { if (!picked) search(''); }, [picked, search]);

  const payTypes: { key: Pay; label: string }[] = [
    { key: 'cash', label: 'Naqd' },
    { key: 'debt', label: 'Qarz' },
    ...((f.variant || f.nasiya) ? [{ key: 'installment' as Pay, label: 'Nasiya' }] : []),
    ...(f.creditKassa ? [{ key: 'bank_credit' as Pay, label: 'Bank' }] : []),
  ];

  async function submit() {
    if (!picked) { Alert.alert('Mahsulot', 'Mahsulot tanlang.'); return; }
    if (!digits(total)) { Alert.alert('Summa', 'Sotuv summasini kiriting.'); return; }
    if (pay === 'installment' && (!months || Number(months) < 1)) { Alert.alert('Nasiya', 'Oy sonini kiriting.'); return; }
    setBusy(true);
    try {
      const r = await api<{ id: string }>('/api/mobile/sales', {
        method: 'POST',
        body: {
          productId: picked.id, paymentType: pay,
          totalAmount: Number(digits(total)),
          paidAmount: pay === 'cash' ? Number(digits(total)) : Number(digits(paid)) || 0,
          installmentMonths: pay === 'installment' ? Number(months) : undefined,
          customerName: custName.trim(), customerPhone: custPhone.trim(),
        },
      });
      Alert.alert('Sotildi', 'Sotuv yakunlandi.');
      router.replace(`/sale/${r.id}`);
    } catch (e) { Alert.alert('Xatolik', e instanceof Error ? e.message : 'Sotuvda xatolik'); }
    finally { setBusy(false); }
  }

  const needCustomer = pay !== 'cash';

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.bar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}><Ionicons name="chevron-back" size={26} color={colors.text} /></TouchableOpacity>
        <Text style={s.barTitle}>Yangi sotuv</Text>
        <View style={{ width: 26 }} />
      </View>

      {!picked ? (
        <>
          <View style={s.searchWrap}>
            <Ionicons name="search" size={18} color={colors.textFaint} />
            <TextInput style={s.search} placeholder="Mahsulot qidirish" value={q} onChangeText={(v) => { setQ(v); search(v); }} autoCapitalize="none" placeholderTextColor={colors.textFaint} />
            <TouchableOpacity onPress={() => router.push('/scan')}><Ionicons name="barcode-outline" size={22} color={colors.brand} /></TouchableOpacity>
          </View>
          {searching ? <ActivityIndicator color={colors.brand} style={{ marginTop: 30 }} /> : (
            <FlatList
              data={list}
              keyExtractor={(i) => i.id}
              contentContainerStyle={{ padding: 16, paddingTop: 6 }}
              ListEmptyComponent={<Text style={s.empty}>Mahsulot topilmadi</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity style={s.pRow} activeOpacity={0.7} onPress={() => { setPicked(item); setTotal(String(item.salePrice)); }}>
                  <Text style={s.pName} numberOfLines={1}>{item.name}</Text>
                  <Text style={s.pPrice}>{fmtSum(item.salePrice)}</Text>
                </TouchableOpacity>
              )}
            />
          )}
        </>
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
            <TouchableOpacity style={s.pickedCard} onPress={() => setPicked(null)} activeOpacity={0.8}>
              <View style={{ flex: 1 }}><Text style={s.pickedName}>{picked.name}</Text><Text style={s.pickedChange}>O&apos;zgartirish</Text></View>
              <Ionicons name="swap-horizontal" size={20} color={colors.textMuted} />
            </TouchableOpacity>

            <Text style={s.label}>To&apos;lov turi</Text>
            <View style={s.seg}>
              {payTypes.map((pt) => (
                <TouchableOpacity key={pt.key} style={[s.segBtn, pay === pt.key && s.segActive]} onPress={() => setPay(pt.key)} activeOpacity={0.8}>
                  <Text style={[s.segT, pay === pt.key && s.segTActive]}>{pt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Field label="Sotuv summasi" value={grouped(total)} onChangeText={(v) => setTotal(digits(v))} keyboardType="numeric" placeholder="0" />
            {needCustomer && <Field label={pay === 'installment' ? 'Boshlang\'ich to\'lov' : 'To\'langan (ixtiyoriy)'} value={grouped(paid)} onChangeText={(v) => setPaid(digits(v))} keyboardType="numeric" placeholder="0" />}
            {pay === 'installment' && <Field label="Necha oyga" value={months} onChangeText={(v) => setMonths(digits(v))} keyboardType="numeric" placeholder="6" />}
            {needCustomer && <>
              <Field label="Mijoz ismi" value={custName} onChangeText={setCustName} placeholder="Ism" />
              <Field label="Telefon" value={custPhone} onChangeText={setCustPhone} placeholder="+998..." keyboardType="phone-pad" />
            </>}

            <TouchableOpacity style={[s.save, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy} activeOpacity={0.85}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.saveT}>Sotuvni yakunlash</Text>}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, ...rest } = props;
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput style={s.input} placeholderTextColor={colors.textFaint} autoCorrect={false} {...rest} />
    </View>
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
  pickedCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: tiles.indigo.bg, borderRadius: 14, padding: 14, marginBottom: 16 },
  pickedName: { fontSize: 15.5, fontWeight: '700', color: colors.brand },
  pickedChange: { fontSize: 12.5, color: colors.brand, marginTop: 2, opacity: 0.8 },
  label: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginBottom: 6 },
  seg: { flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  segBtn: { paddingVertical: 9, paddingHorizontal: 16, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  segActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  segT: { fontSize: 13.5, fontWeight: '600', color: colors.textMuted },
  segTActive: { color: '#fff' },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.text },
  save: { backgroundColor: colors.brand, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 10 },
  saveT: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
