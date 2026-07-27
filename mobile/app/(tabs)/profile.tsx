import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { colors, tiles } from '@/lib/theme';

export default function Profile() {
  const { me, logout } = useAuth();
  const router = useRouter();
  const t = me?.terms;
  const f = me?.features ?? {};
  const isAdmin = !!me?.user.isAdmin;

  function onLogout() {
    Alert.alert('Chiqish', 'Tizimdan chiqmoqchimisiz?', [
      { text: 'Bekor qilish', style: 'cancel' },
      { text: 'Chiqish', style: 'destructive', onPress: async () => { await logout(); router.replace('/login'); } },
    ]);
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.avatar}><Text style={s.avatarText}>{(me?.user.username || '?').slice(0, 1).toUpperCase()}</Text></View>
        <Text style={s.name}>{me?.user.username}</Text>
        <Text style={s.role}>{isAdmin ? 'Biznes egasi' : 'Filial'} · {me?.org.name}</Text>

        <Text style={s.section}>Ma&apos;lumot</Text>
        <View style={s.card}>
          <Row icon="business-outline" label="Do'kon" value={me?.org.name || '—'} />
          <Divider />
          <Row icon="pricetags-outline" label="Yo'nalish" value={me?.org.businessTypeLabel || '—'} />
          <Divider />
          <Row
            icon={me?.org.active ? 'checkmark-circle-outline' : 'close-circle-outline'}
            label="Obuna"
            value={me?.org.active ? (me.org.isTrial ? `Sinov · ${me.org.daysLeft} kun` : `Faol · ${me.org.daysLeft} kun`) : 'Tugagan'}
            valueColor={me?.org.active ? tiles.green.fg : tiles.red.fg}
          />
        </View>

        <Text style={s.section}>Amallar</Text>
        <View style={s.card}>
          <NavRow icon="add-circle-outline" tint={tiles.indigo} label={`Yangi ${t?.item?.toLowerCase() ?? 'mahsulot'}`} onPress={() => router.push('/product-new')} />
          <Divider />
          <NavRow icon="barcode-outline" tint={tiles.green} label="Shtrix kod skaner" onPress={() => router.push('/scan')} />
          {f.kirimChiqim && isAdmin && <>
            <Divider />
            <NavRow icon="cash-outline" tint={tiles.green} label="Kirim-Chiqim" onPress={() => router.push('/kirim-chiqim')} />
          </>}
          {f.users && isAdmin && <>
            <Divider />
            <NavRow icon="business-outline" tint={tiles.indigo} label="Filiallar" onPress={() => router.push('/branches')} />
          </>}
          {f.transferred && <>
            <Divider />
            <NavRow icon="swap-horizontal-outline" tint={tiles.slate} label="Filialga berish" onPress={() => router.push('/transfer')} />
          </>}
          {isAdmin && <>
            <Divider />
            <NavRow icon="briefcase-outline" tint={tiles.amber} label="Biznes yo'nalishi" value={me?.org.businessTypeLabel} onPress={() => router.push('/business-type')} />
          </>}
        </View>

        <TouchableOpacity style={s.logoutBtn} onPress={onLogout} activeOpacity={0.85}>
          <Ionicons name="log-out-outline" size={20} color={tiles.red.fg} />
          <Text style={s.logoutText}>Chiqish</Text>
        </TouchableOpacity>

        <Text style={s.version}>Savora Mobile v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ icon, label, value, valueColor }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; valueColor?: string }) {
  return (
    <View style={s.row}>
      <Ionicons name={icon} size={20} color={colors.textMuted} />
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={[s.rowValue, valueColor ? { color: valueColor } : null]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function NavRow({ icon, tint, label, value, onPress }: { icon: keyof typeof Ionicons.glyphMap; tint: { bg: string; fg: string }; label: string; value?: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.row} activeOpacity={0.7} onPress={onPress}>
      <View style={[s.navIcon, { backgroundColor: tint.bg }]}><Ionicons name={icon} size={18} color={tint.fg} /></View>
      <Text style={[s.rowLabel, { flex: 1, color: colors.text, fontWeight: '600' }]}>{label}</Text>
      {value ? <Text style={s.navValue} numberOfLines={1}>{value}</Text> : null}
      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
    </TouchableOpacity>
  );
}
const Divider = () => <View style={s.divider} />;

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 18, alignItems: 'center' },
  avatar: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  avatarText: { color: '#fff', fontSize: 32, fontWeight: '800' },
  name: { fontSize: 21, fontWeight: '800', color: colors.text, marginTop: 12 },
  role: { fontSize: 14, color: colors.textMuted, marginTop: 2, marginBottom: 8 },
  section: { alignSelf: 'flex-start', fontSize: 13, fontWeight: '700', color: colors.textMuted, marginTop: 18, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
  card: { width: '100%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  rowLabel: { fontSize: 14, color: colors.textMuted },
  rowValue: { flex: 1, textAlign: 'right', fontSize: 14, fontWeight: '700', color: colors.text },
  navIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  navValue: { fontSize: 13, color: colors.textMuted, marginRight: 4, maxWidth: 130 },
  divider: { height: 1, backgroundColor: colors.border },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', backgroundColor: tiles.red.bg, borderRadius: 14, paddingVertical: 14, marginTop: 22 },
  logoutText: { color: tiles.red.fg, fontSize: 16, fontWeight: '700' },
  version: { fontSize: 12, color: colors.textFaint, marginTop: 24 },
});
