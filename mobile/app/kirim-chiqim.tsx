import { useCallback, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/lib/api';
import { colors, tiles, fmtSum, fmtDate } from '@/lib/theme';

interface Entry { id: string; type: 'income' | 'expense'; amount: number; description: string; createdAt: string }
interface Data { income: number; expense: number; balance: number; items: Entry[] }
const digits = (v: string) => v.replace(/\D/g, '');
const grouped = (v: string) => digits(v).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

export default function KirimChiqim() {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<'income' | 'expense'>('income');
  const [amount, setAmount] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setData(await api<Data>('/api/mobile/kirim-chiqim')); } catch { /* ignore */ } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function add() {
    if (!digits(amount)) { Alert.alert('Summa', 'Summani kiriting.'); return; }
    if (!desc.trim()) { Alert.alert('Izoh', 'Izoh kiriting.'); return; }
    setBusy(true);
    try {
      await api('/api/mobile/kirim-chiqim', { method: 'POST', body: { type, amount: Number(digits(amount)), description: desc.trim() } });
      setAmount(''); setDesc(''); await load();
    } catch (e) { Alert.alert('Xatolik', e instanceof Error ? e.message : 'Xatolik'); }
    finally { setBusy(false); }
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.bar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}><Ionicons name="chevron-back" size={26} color={colors.text} /></TouchableOpacity>
        <Text style={s.barTitle}>Kirim-Chiqim</Text>
        <View style={{ width: 26 }} />
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
          {loading ? <ActivityIndicator color={colors.brand} style={{ marginTop: 30 }} /> : data && (
            <>
              <View style={s.tiles}>
                <Tile bg={tiles.green.bg} fg={tiles.green.fg} label="Kirim" value={fmtSum(data.income)} />
                <Tile bg={tiles.red.bg} fg={tiles.red.fg} label="Chiqim" value={fmtSum(data.expense)} />
                <Tile bg={tiles.indigo.bg} fg={tiles.indigo.fg} label="Qoldiq" value={fmtSum(data.balance)} />
              </View>

              <View style={s.form}>
                <View style={s.seg}>
                  <TouchableOpacity style={[s.segBtn, type === 'income' && { backgroundColor: tiles.green.fg, borderColor: tiles.green.fg }]} onPress={() => setType('income')} activeOpacity={0.8}>
                    <Text style={[s.segT, type === 'income' && { color: '#fff' }]}>Kirim</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.segBtn, type === 'expense' && { backgroundColor: tiles.red.fg, borderColor: tiles.red.fg }]} onPress={() => setType('expense')} activeOpacity={0.8}>
                    <Text style={[s.segT, type === 'expense' && { color: '#fff' }]}>Chiqim</Text>
                  </TouchableOpacity>
                </View>
                <TextInput style={s.input} value={grouped(amount)} onChangeText={(v) => setAmount(digits(v))} placeholder="Summa" keyboardType="numeric" placeholderTextColor={colors.textFaint} />
                <TextInput style={s.input} value={desc} onChangeText={setDesc} placeholder="Izoh (masalan: ijara, elektr)" placeholderTextColor={colors.textFaint} />
                <TouchableOpacity style={[s.addBtn, busy && { opacity: 0.6 }]} onPress={add} disabled={busy} activeOpacity={0.85}>
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.addT}>Qo&apos;shish</Text>}
                </TouchableOpacity>
              </View>

              <Text style={s.section}>So&apos;nggi yozuvlar</Text>
              {data.items.length === 0 ? <Text style={s.empty}>Yozuv yo&apos;q</Text> : data.items.slice(0, 30).map((e) => (
                <View key={e.id} style={s.row}>
                  <View style={[s.dot, { backgroundColor: e.type === 'income' ? tiles.green.fg : tiles.red.fg }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.rDesc} numberOfLines={1}>{e.description}</Text>
                    <Text style={s.rDate}>{fmtDate(e.createdAt)}</Text>
                  </View>
                  <Text style={[s.rAmount, { color: e.type === 'income' ? tiles.green.fg : tiles.red.fg }]}>
                    {e.type === 'income' ? '+' : '−'}{fmtSum(e.amount)}
                  </Text>
                </View>
              ))}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Tile({ bg, fg, label, value }: { bg: string; fg: string; label: string; value: string }) {
  return (
    <View style={[s.tile, { backgroundColor: bg }]}>
      <Text style={[s.tileL, { color: fg }]}>{label}</Text>
      <Text style={[s.tileV, { color: fg }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10 },
  barTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, borderRadius: 14, padding: 12 },
  tileL: { fontSize: 11.5, fontWeight: '600' },
  tileV: { fontSize: 15, fontWeight: '800', marginTop: 4 },
  form: { marginTop: 18, gap: 10 },
  seg: { flexDirection: 'row', gap: 8 },
  segBtn: { flex: 1, paddingVertical: 11, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  segT: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.text },
  addBtn: { backgroundColor: colors.brand, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  addT: { color: '#fff', fontSize: 15, fontWeight: '700' },
  section: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: 24, marginBottom: 10 },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, marginBottom: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rDesc: { fontSize: 14.5, fontWeight: '600', color: colors.text },
  rDate: { fontSize: 12, color: colors.textFaint, marginTop: 2 },
  rAmount: { fontSize: 14.5, fontWeight: '800' },
});
