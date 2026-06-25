import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { colors, fmtSum } from '@/lib/theme';

interface Summary {
  inStock: number;
  todaySales: number;
  todayRevenue: number;
  debtTotal: number;
}

export default function Dashboard() {
  const { me } = useAuth();
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setErr(null);
      const res = await api<Summary>('/api/mobile/summary');
      setData(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Xatolik');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(() => { setRefreshing(true); load(); }, [load]);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        <Text style={s.hello}>Assalomu alaykum 👋</Text>
        <Text style={s.org}>{me?.org.name}</Text>

        {me && !me.org.active && (
          <View style={s.warn}>
            <Ionicons name="warning-outline" size={18} color="#b45309" />
            <Text style={s.warnText}>Obuna muddati tugagan. Iltimos to'lovni amalga oshiring.</Text>
          </View>
        )}
        {me && me.org.active && me.org.daysLeft <= 3 && (
          <View style={s.warn}>
            <Ionicons name="time-outline" size={18} color="#b45309" />
            <Text style={s.warnText}>Obunaga {me.org.daysLeft} kun qoldi.</Text>
          </View>
        )}

        {loading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
        ) : err ? (
          <Text style={s.err}>{err}</Text>
        ) : data ? (
          <View style={s.grid}>
            <Stat icon="cube" label="Omborda mahsulot" value={`${fmtSum(data.inStock)} dona`} tint={colors.brand} />
            <Stat icon="cart" label="Bugungi sotuvlar" value={`${fmtSum(data.todaySales)} ta`} tint="#0ea5e9" />
            <Stat icon="cash" label="Bugungi tushum" value={`${fmtSum(data.todayRevenue)} so'm`} tint="#16a34a" />
            <Stat icon="alert-circle" label="Jami qarzdorlik" value={`${fmtSum(data.debtTotal)} so'm`} tint="#dc2626" />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ icon, label, value, tint }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; tint: string }) {
  return (
    <View style={s.card}>
      <View style={[s.iconWrap, { backgroundColor: tint + '1a' }]}>
        <Ionicons name={icon} size={22} color={tint} />
      </View>
      <Text style={s.cardValue}>{value}</Text>
      <Text style={s.cardLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 18, paddingBottom: 40 },
  hello: { fontSize: 16, color: colors.textMuted, marginTop: 6 },
  org: { fontSize: 24, fontWeight: '800', color: colors.text, marginTop: 2, marginBottom: 16 },
  warn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fef3c7', borderRadius: 12, padding: 12, marginBottom: 16 },
  warnText: { flex: 1, color: '#92400e', fontSize: 13, fontWeight: '600' },
  err: { color: '#dc2626', marginTop: 24, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { width: '47%', flexGrow: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 16 },
  iconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  cardValue: { fontSize: 19, fontWeight: '800', color: colors.text },
  cardLabel: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
});
