import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';

export default function Profile() {
  const { me, logout } = useAuth();
  const router = useRouter();

  function onLogout() {
    Alert.alert('Chiqish', 'Tizimdan chiqmoqchimisiz?', [
      { text: 'Bekor qilish', style: 'cancel' },
      { text: 'Chiqish', style: 'destructive', onPress: async () => { await logout(); router.replace('/login'); } },
    ]);
  }

  const roleLabel = me?.user.isAdmin ? 'Administrator' : 'Filial';

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.avatar}><Text style={s.avatarText}>{(me?.user.username || '?').slice(0, 1).toUpperCase()}</Text></View>
        <Text style={s.name}>{me?.user.username}</Text>
        <Text style={s.role}>{roleLabel} · {me?.org.name}</Text>

        <View style={s.card}>
          <Row icon="business-outline" label="Do'kon" value={me?.org.name || '—'} />
          <Divider />
          <Row icon="link-outline" label="Manzil" value={me?.org.slug || '—'} />
          <Divider />
          <Row
            icon={me?.org.active ? 'checkmark-circle-outline' : 'close-circle-outline'}
            label="Obuna holati"
            value={me?.org.active ? (me.org.isTrial ? `Sinov · ${me.org.daysLeft} kun` : `Faol · ${me.org.daysLeft} kun`) : 'Tugagan'}
            valueColor={me?.org.active ? '#16a34a' : '#dc2626'}
          />
        </View>

        <TouchableOpacity style={s.logoutBtn} onPress={onLogout} activeOpacity={0.85}>
          <Ionicons name="log-out-outline" size={20} color="#dc2626" />
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
const Divider = () => <View style={s.divider} />;

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 18, alignItems: 'center' },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  avatarText: { color: '#fff', fontSize: 34, fontWeight: '800' },
  name: { fontSize: 22, fontWeight: '800', color: colors.text, marginTop: 12 },
  role: { fontSize: 14, color: colors.textMuted, marginTop: 2, marginBottom: 22 },
  card: { width: '100%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  rowLabel: { fontSize: 14, color: colors.textMuted },
  rowValue: { flex: 1, textAlign: 'right', fontSize: 14, fontWeight: '700', color: colors.text },
  divider: { height: 1, backgroundColor: colors.border },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', backgroundColor: '#fee2e2', borderRadius: 14, paddingVertical: 14, marginTop: 22 },
  logoutText: { color: '#dc2626', fontSize: 16, fontWeight: '700' },
  version: { fontSize: 12, color: colors.textFaint, marginTop: 24 },
});
