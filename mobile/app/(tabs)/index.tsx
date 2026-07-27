import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { colors, tiles, fmtSum } from '@/lib/theme';

interface Summary { inStock: number; todaySales: number; todayRevenue: number; debtTotal: number }
interface Sale { id: string; product: string; paymentType: string; totalAmount: number }

const PAY_LABEL: Record<string, string> = { cash: 'Naqd', debt: 'Qarz', installment: 'Nasiya', bank_credit: 'Kredit' };

export default function Dashboard() {
  const { me } = useAuth();
  const router = useRouter();
  const f = me?.features ?? {};
  const isAdmin = !!me?.user.isAdmin;
  const t = me?.terms;
  const [sum, setSum] = useState<Summary | null>(null);
  const [recent, setRecent] = useState<Sale[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([
        api<Summary>('/api/mobile/summary'),
        api<{ items: Sale[] }>('/api/mobile/sales?type=all'),
      ]);
      setSum(s); setRecent(r.items.slice(0, 4));
    } catch { /* xatoni jimgina o'tkazamiz — pull-to-refresh qayta uriladi */ }
    finally { setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = useCallback(() => { setRefreshing(true); load(); }, [load]);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}>
        <View style={s.head}>
          <View style={s.hleft}>
            <View style={s.badge}><Text style={s.badgeT}>{(me?.org.name ?? 'S').charAt(0).toUpperCase()}</Text></View>
            <View>
              <Text style={s.hi}>Salom, {me?.user.username}</Text>
              <Text style={s.org}>{me?.org.name}</Text>
            </View>
          </View>
          <Ionicons name="notifications-outline" size={22} color={colors.textMuted} />
        </View>

        {me && !me.org.active && (
          <View style={s.warn}>
            <Ionicons name="warning-outline" size={18} color="#b45309" />
            <Text style={s.warnText}>Obuna muddati tugagan. To'lovni amalga oshiring.</Text>
          </View>
        )}

        <View style={s.tilesRow}>
          <Tile bg={tiles.indigo.bg} fg={tiles.indigo.fg} label="Bugungi tushum" value={`${fmtSum(sum?.todayRevenue ?? 0)}`} />
          <Tile bg={tiles.green.bg} fg={tiles.green.fg} label="Bugungi sotuv" value={`${sum?.todaySales ?? 0} ta`} />
        </View>
        <View style={s.tilesRow}>
          <Tile bg={tiles.red.bg} fg={tiles.red.fg} label="Qarzdorlik" value={`${fmtSum(sum?.debtTotal ?? 0)}`} onPress={() => router.push('/(tabs)/sales')} />
          <Tile bg={tiles.amber.bg} fg={tiles.amber.fg} label="Omborda" value={`${sum?.inStock ?? 0} ta`} onPress={() => router.push('/(tabs)/products')} />
        </View>

        <TouchableOpacity style={s.sellCta} activeOpacity={0.9} onPress={() => router.push('/sale-new')}>
          <Ionicons name="cart" size={20} color="#fff" />
          <Text style={s.sellCtaT}>Yangi sotuv</Text>
        </TouchableOpacity>

        <View style={s.qaRow}>
          <QA icon="cube-outline" color={tiles.green} label={t?.items ?? 'Ombor'} onPress={() => router.push('/(tabs)/products')} />
          {(f.variant || f.nasiya) && <QA icon="time-outline" color={tiles.amber} label="Nasiya" onPress={() => router.push('/(tabs)/nasiya')} />}
          {f.transferred && <QA icon="swap-horizontal-outline" color={tiles.indigo} label="Berish" onPress={() => router.push('/transfer')} />}
          {f.kirimChiqim && isAdmin && <QA icon="cash-outline" color={tiles.green} label="Kirim-Chiqim" onPress={() => router.push('/kirim-chiqim')} />}
          {f.users && isAdmin && <QA icon="business-outline" color={tiles.slate} label="Filiallar" onPress={() => router.push('/branches')} />}
        </View>

        <Text style={s.section}>So'nggi sotuvlar</Text>
        <View style={s.card}>
          {recent.length === 0 ? (
            <Text style={s.empty}>Hozircha sotuv yo'q</Text>
          ) : recent.map((r, i) => (
            <TouchableOpacity key={r.id} style={[s.rrow, i < recent.length - 1 && s.rborder]} activeOpacity={0.7} onPress={() => router.push(`/sale/${r.id}`)}>
              <View style={{ flex: 1 }}>
                <Text style={s.rname} numberOfLines={1}>{r.product}</Text>
                <Text style={s.rsub}>{PAY_LABEL[r.paymentType] ?? r.paymentType}</Text>
              </View>
              <Text style={s.ramt}>{fmtSum(r.totalAmount)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Tile({ bg, fg, label, value, onPress }: { bg: string; fg: string; label: string; value: string; onPress?: () => void }) {
  const Body = (
    <View style={[s.tile, { backgroundColor: bg }]}>
      <Text style={[s.tileLabel, { color: fg }]}>{label}</Text>
      <Text style={[s.tileValue, { color: fg }]} numberOfLines={1}>{value}</Text>
    </View>
  );
  return onPress ? <TouchableOpacity style={{ flex: 1 }} activeOpacity={0.85} onPress={onPress}>{Body}</TouchableOpacity> : <View style={{ flex: 1 }}>{Body}</View>;
}

function QA({ icon, color, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; color: { bg: string; fg: string }; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.qa} activeOpacity={0.8} onPress={onPress}>
      <View style={[s.qaIcon, { backgroundColor: color.bg }]}><Ionicons name={icon} size={20} color={color.fg} /></View>
      <Text style={s.qaLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 32 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  hleft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: { width: 40, height: 40, borderRadius: 12, backgroundColor: tiles.indigo.bg, alignItems: 'center', justifyContent: 'center' },
  badgeT: { color: colors.brand, fontSize: 17, fontWeight: '800' },
  hi: { fontSize: 13, color: colors.textMuted },
  org: { fontSize: 17, fontWeight: '800', color: colors.text },
  warn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fef3c7', borderRadius: 12, padding: 12, marginBottom: 14 },
  warnText: { flex: 1, color: '#92400e', fontSize: 13, fontWeight: '600' },
  tilesRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  tile: { borderRadius: 16, padding: 14, minHeight: 74, justifyContent: 'center' },
  tileLabel: { fontSize: 12.5, fontWeight: '600', opacity: 0.9 },
  tileValue: { fontSize: 19, fontWeight: '800', marginTop: 4 },
  sellCta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.brand, borderRadius: 14, paddingVertical: 15, marginBottom: 16 },
  sellCtaT: { color: '#fff', fontSize: 16, fontWeight: '800' },
  qaRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', columnGap: 12, rowGap: 14, marginTop: 4, marginBottom: 22 },
  qa: { alignItems: 'center', gap: 6, width: '23%' },
  qaIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  qaLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  section: { fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: 10 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingHorizontal: 14 },
  empty: { color: colors.textMuted, textAlign: 'center', paddingVertical: 24 },
  rrow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13 },
  rborder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rname: { fontSize: 14.5, fontWeight: '600', color: colors.text },
  rsub: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  ramt: { fontSize: 14.5, fontWeight: '700', color: colors.text },
});
