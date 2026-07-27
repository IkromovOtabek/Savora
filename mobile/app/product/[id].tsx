import { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, tiles, fmtSum, fmtDate } from '@/lib/theme';

interface Detail {
  id: string; name: string; brand: string | null; deviceModel: string | null;
  imei: string; barcode: string | null; color: string | null;
  purchasePrice: number; salePrice: number; profit: number; status: string;
  trackQuantity: boolean; quantity: number; soldQuantity: number; available: number;
  branch: string | null; notes: string | null; createdAt: string;
  history: { action: string; detail: string | null; by: string | null; at: string }[];
}

const STATUS: Record<string, { t: string; c: { bg: string; fg: string } }> = {
  in_stock: { t: 'Sotuvda', c: tiles.green },
  sold: { t: 'Sotilgan', c: tiles.red },
  reserved: { t: 'Band', c: tiles.amber },
  defective: { t: 'Nuqsonli', c: tiles.slate },
  transferred: { t: 'O\'tkazilgan', c: tiles.slate },
};
const ACTION: Record<string, string> = { created: 'Qo\'shildi', sold: 'Sotildi', transferred: 'O\'tkazildi', returned: 'Qaytarildi', edited: 'Tahrirlandi', restocked: 'To\'ldirildi' };

export default function ProductDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { me } = useAuth();
  const terms = me?.terms;
  const [p, setP] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setErr(null); setP(await api<Detail>(`/api/mobile/products/${id}`)); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Xatolik'); }
    finally { setLoading(false); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const st = p ? (STATUS[p.status] ?? { t: p.status, c: tiles.slate }) : null;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.bar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}><Ionicons name="chevron-back" size={26} color={colors.text} /></TouchableOpacity>
        <Text style={s.barTitle} numberOfLines={1}>{terms?.item ?? 'Mahsulot'}</Text>
        <View style={{ width: 26 }} />
      </View>

      {loading ? <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} /> : err ? (
        <Text style={s.err}>{err}</Text>
      ) : p ? (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
          <View style={s.head}>
            <Text style={s.name}>{p.name}</Text>
            {st && <View style={[s.badge, { backgroundColor: st.c.bg }]}><Text style={[s.badgeT, { color: st.c.fg }]}>{st.t}</Text></View>}
          </View>
          {(p.brand || p.deviceModel || p.color) && (
            <Text style={s.subline}>{[p.brand, p.deviceModel, p.color].filter(Boolean).join(' · ')}</Text>
          )}

          <View style={s.priceRow}>
            <Price label="Sotuv narxi" value={fmtSum(p.salePrice)} big />
            <Price label="Kelish narxi" value={fmtSum(p.purchasePrice)} />
            <Price label="Foyda" value={fmtSum(p.profit)} color={tiles.green.fg} />
          </View>

          <View style={s.card}>
            <Row label={terms?.codeLabel ?? 'Kod'} value={p.imei} mono />
            {p.barcode ? <Row label="Shtrix kod" value={p.barcode} mono /> : null}
            {p.branch ? <Row label="Filial" value={p.branch} /> : null}
            {p.trackQuantity ? <Row label="Qoldiq" value={`${p.available} / ${p.quantity}`} /> : null}
            <Row label="Qo'shilgan" value={fmtDate(p.createdAt)} last />
            {p.notes ? <Row label="Izoh" value={p.notes} last /> : null}
          </View>

          {p.history.length > 0 && (
            <>
              <Text style={s.section}>Tarix</Text>
              <View style={s.card}>
                {p.history.map((h, i) => (
                  <View key={i} style={[s.hrow, i < p.history.length - 1 && s.hborder]}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.hact}>{ACTION[h.action] ?? h.action}</Text>
                      {h.detail ? <Text style={s.hdetail}>{h.detail}</Text> : null}
                    </View>
                    <Text style={s.hdate}>{fmtDate(h.at)}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {p.status === 'in_stock' && (
            <View style={s.actions}>
              <TouchableOpacity style={s.sellBtn} activeOpacity={0.85} onPress={() => router.push(`/sale-new?productId=${p.id}&name=${encodeURIComponent(p.name)}&price=${p.salePrice}`)}>
                <Ionicons name="cart-outline" size={18} color="#fff" />
                <Text style={s.sellT}>Sotish</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.transferBtn} activeOpacity={0.85} onPress={() => router.push(`/transfer?productId=${p.id}&name=${encodeURIComponent(p.name)}`)}>
                <Ionicons name="swap-horizontal" size={18} color={colors.brand} />
                <Text style={s.transferT}>Berish</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

function Price({ label, value, big, color }: { label: string; value: string; big?: boolean; color?: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={s.priceL}>{label}</Text>
      <Text style={[s.priceV, big && { fontSize: 18 }, color && { color }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}
function Row({ label, value, mono, last }: { label: string; value: string; mono?: boolean; last?: boolean }) {
  return (
    <View style={[s.row, !last && s.rborder]}>
      <Text style={s.rlabel}>{label}</Text>
      <Text style={[s.rvalue, mono && { fontFamily: 'monospace' }]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10 },
  barTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  err: { color: '#dc2626', textAlign: 'center', marginTop: 40 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  name: { flex: 1, fontSize: 20, fontWeight: '800', color: colors.text },
  subline: { fontSize: 13.5, color: colors.textMuted, marginTop: 4 },
  priceRow: { flexDirection: 'row', gap: 10, marginTop: 18, marginBottom: 8 },
  priceL: { fontSize: 12, color: colors.textMuted },
  priceV: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: 3 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingHorizontal: 14, marginTop: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, gap: 12 },
  rborder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rlabel: { fontSize: 13.5, color: colors.textMuted },
  rvalue: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text, textAlign: 'right' },
  section: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: 22, marginBottom: 10 },
  hrow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 10 },
  hborder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  hact: { fontSize: 14, fontWeight: '600', color: colors.text },
  hdetail: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  hdate: { fontSize: 12.5, color: colors.textFaint },
  badge: { paddingVertical: 3, paddingHorizontal: 10, borderRadius: 20 },
  badgeT: { fontSize: 12, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 24 },
  sellBtn: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand, borderRadius: 12, paddingVertical: 14 },
  sellT: { color: '#fff', fontSize: 15, fontWeight: '700' },
  transferBtn: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: tiles.indigo.bg, borderRadius: 12, paddingVertical: 14 },
  transferT: { color: colors.brand, fontSize: 15, fontWeight: '700' },
});
