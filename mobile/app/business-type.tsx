import { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, tiles } from '@/lib/theme';

interface BType { key: string; label: string; description: string }

export default function BusinessType() {
  const router = useRouter();
  const { me, refresh } = useAuth();
  const current = me?.org.businessType;
  const [types, setTypes] = useState<BType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    api<{ types: BType[] }>('/api/mobile/org')
      .then((r) => setTypes(r.types))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []));

  async function choose(key: string) {
    if (key === current || saving) return;
    setSaving(key);
    try {
      await api('/api/mobile/org', { method: 'PATCH', body: { businessType: key } });
      await refresh();
      router.back();
    } catch (e) {
      Alert.alert('Xatolik', e instanceof Error ? e.message : 'Xatolik');
    } finally { setSaving(null); }
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.bar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}><Ionicons name="chevron-back" size={26} color={colors.text} /></TouchableOpacity>
        <Text style={s.barTitle}>Biznes yo&apos;nalishi</Text>
        <View style={{ width: 26 }} />
      </View>
      <Text style={s.note}>Yo&apos;nalishga qarab ilovadagi atamalar (mahsulot, menyu, dori...) o&apos;zgaradi.</Text>

      {loading ? <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} /> : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4 }}>
          {types.map((tp) => {
            const active = tp.key === current;
            return (
              <TouchableOpacity key={tp.key} style={[s.row, active && s.rowActive]} activeOpacity={0.8} onPress={() => choose(tp.key)} disabled={!!saving}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.label, active && { color: colors.brand }]}>{tp.label}</Text>
                  <Text style={s.desc}>{tp.description}</Text>
                </View>
                {saving === tp.key ? <ActivityIndicator color={colors.brand} />
                  : active ? <Ionicons name="checkmark-circle" size={24} color={colors.brand} />
                  : <Ionicons name="ellipse-outline" size={22} color={colors.textFaint} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10 },
  barTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  note: { fontSize: 13, color: colors.textMuted, paddingHorizontal: 16, paddingBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 16, marginBottom: 10 },
  rowActive: { borderColor: colors.brand, backgroundColor: tiles.indigo.bg },
  label: { fontSize: 15.5, fontWeight: '700', color: colors.text },
  desc: { fontSize: 13, color: colors.textMuted, marginTop: 3 },
});
