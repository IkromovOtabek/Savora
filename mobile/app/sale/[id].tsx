import { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, TextInput, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/lib/api';
import { colors, tiles, fmtSum, fmtDate } from '@/lib/theme';

interface Month { month: number; amount: number; paidAmount: number; paid: boolean; state: string; dueDate: string }
interface Plan { total: number; down: number; monthly: number; months: number; monthsPaid: number; remaining: number; overdueCount: number; schedule: Month[] }
interface Sale {
  id: string; saleNo: string; product: string; customer: string | null; phone: string | null;
  paymentType: string; totalAmount: number; paidAmount: number; remainingAmount: number;
  installmentMonths: number | null; dueDate: string | null; status: string; plan: Plan | null;
}

const PAY_LABEL: Record<string, string> = { cash: 'Naqd', debt: 'Qarz', installment: 'Nasiya', bank_credit: 'Bank krediti' };
const STATE: Record<string, { label: string; c: { bg: string; fg: string } }> = {
  paid: { label: 'To\'landi', c: tiles.green },
  partial: { label: 'Qisman', c: { bg: '#eff6ff', fg: '#2563eb' } },
  upcoming: { label: 'Muddat kelmagan', c: tiles.amber },
  overdue: { label: 'To\'lanmagan', c: tiles.red },
};
const digits = (v: string) => v.replace(/\D/g, '');
const grouped = (v: string) => digits(v).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

export default function SaleDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [s, setS] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [paying, setPaying] = useState(false);

  const load = useCallback(async () => {
    try { setS(await api<Sale>(`/api/mobile/sales/${id}`)); } catch { /* ignore */ } finally { setLoading(false); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function pay(sum?: number) {
    const val = sum ?? Number(digits(amount));
    if (!val || val <= 0) { Alert.alert('Summa', 'To\'lov summasini kiriting.'); return; }
    setPaying(true);
    try {
      await api(`/api/mobile/sales/${id}`, { method: 'POST', body: { amount: val, note: 'Mobil to\'lov' } });
      setAmount('');
      await load();
    } catch (e) { Alert.alert('Xatolik', e instanceof Error ? e.message : 'To\'lovda xatolik'); }
    finally { setPaying(false); }
  }

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <View style={st.bar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}><Ionicons name="chevron-back" size={26} color={colors.text} /></TouchableOpacity>
        <Text style={st.barTitle} numberOfLines={1}>{s?.saleNo ?? 'Sotuv'}</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading || !s ? <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} /> : (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }}>
            <Text style={st.product}>{s.product}</Text>
            <Text style={st.sub}>{PAY_LABEL[s.paymentType] ?? s.paymentType}{s.customer ? ` · ${s.customer}` : ''}</Text>

            <View style={st.tiles}>
              <Tile bg={tiles.indigo.bg} fg={tiles.indigo.fg} label="Jami" value={fmtSum(s.totalAmount)} />
              <Tile bg={tiles.green.bg} fg={tiles.green.fg} label="To'langan" value={fmtSum(s.paidAmount)} />
              <Tile bg={tiles.red.bg} fg={tiles.red.fg} label="Qoldiq" value={fmtSum(s.remainingAmount)} />
            </View>

            {s.plan && (
              <>
                <Text style={st.section}>Oylik jadval · {s.plan.monthsPaid}/{s.plan.months} to&apos;landi</Text>
                <View style={st.months}>
                  {s.plan.schedule.map((m) => {
                    const meta = STATE[m.state] ?? STATE.upcoming;
                    return (
                      <View key={m.month} style={[st.month, { borderColor: meta.c.fg + '55' }]}>
                        <Text style={st.mLabel}>{m.month}-oy</Text>
                        <Text style={st.mAmount}>{fmtSum(m.amount)}</Text>
                        {m.state === 'partial' ? <Text style={st.mPartial}>{fmtSum(m.paidAmount)} / {fmtSum(m.amount)}</Text> : <Text style={st.mDue}>{fmtDate(m.dueDate)}</Text>}
                        <View style={[st.mBadge, { backgroundColor: meta.c.bg }]}><Text style={[st.mBadgeT, { color: meta.c.fg }]}>{meta.label}</Text></View>
                      </View>
                    );
                  })}
                </View>
              </>
            )}

            {s.remainingAmount > 0 && s.status !== 'cancelled' && (
              <View style={st.payCard}>
                <Text style={st.section}>To&apos;lov qo&apos;shish</Text>
                {s.plan && s.plan.monthly > 0 && (
                  <TouchableOpacity style={st.monthPayBtn} onPress={() => pay(Math.min(s.plan!.monthly, s.remainingAmount))} disabled={paying} activeOpacity={0.85}>
                    <Text style={st.monthPayT}>Bir oy — {fmtSum(Math.min(s.plan.monthly, s.remainingAmount))} so&apos;m</Text>
                  </TouchableOpacity>
                )}
                <View style={st.payRow}>
                  <TextInput style={st.input} value={grouped(amount)} onChangeText={(v) => setAmount(digits(v))} placeholder={`Qoldiq: ${fmtSum(s.remainingAmount)}`} keyboardType="numeric" placeholderTextColor={colors.textFaint} />
                  <TouchableOpacity style={[st.payBtn, paying && { opacity: 0.6 }]} onPress={() => pay()} disabled={paying} activeOpacity={0.85}>
                    {paying ? <ActivityIndicator color="#fff" /> : <Text style={st.payBtnT}>To&apos;lash</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

function Tile({ bg, fg, label, value }: { bg: string; fg: string; label: string; value: string }) {
  return (
    <View style={[st.tile, { backgroundColor: bg }]}>
      <Text style={[st.tileL, { color: fg }]}>{label}</Text>
      <Text style={[st.tileV, { color: fg }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10 },
  barTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  product: { fontSize: 19, fontWeight: '800', color: colors.text },
  sub: { fontSize: 13.5, color: colors.textMuted, marginTop: 3 },
  tiles: { flexDirection: 'row', gap: 8, marginTop: 16 },
  tile: { flex: 1, borderRadius: 14, padding: 12 },
  tileL: { fontSize: 11.5, fontWeight: '600' },
  tileV: { fontSize: 15, fontWeight: '800', marginTop: 4 },
  section: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: 22, marginBottom: 10 },
  months: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  month: { width: '47%', flexGrow: 1, backgroundColor: colors.surface, borderWidth: 1, borderRadius: 12, padding: 12 },
  mLabel: { fontSize: 11.5, color: colors.textFaint, fontWeight: '700', textTransform: 'uppercase' },
  mAmount: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: 3 },
  mDue: { fontSize: 11.5, color: colors.textMuted, marginTop: 2 },
  mPartial: { fontSize: 11.5, color: '#2563eb', marginTop: 2, fontWeight: '600' },
  mBadge: { alignSelf: 'flex-start', marginTop: 8, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  mBadgeT: { fontSize: 10.5, fontWeight: '700' },
  payCard: { marginTop: 8 },
  monthPayBtn: { backgroundColor: tiles.indigo.bg, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginBottom: 10 },
  monthPayT: { color: colors.brand, fontSize: 14.5, fontWeight: '700' },
  payRow: { flexDirection: 'row', gap: 10 },
  input: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text },
  payBtn: { backgroundColor: colors.brand, borderRadius: 12, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center' },
  payBtnT: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
