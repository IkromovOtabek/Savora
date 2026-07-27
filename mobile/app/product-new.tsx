import { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';

const digits = (v: string) => v.replace(/\D/g, '');
const grouped = (v: string) => digits(v).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

export default function ProductNew() {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code?: string }>();
  const { me } = useAuth();
  const t = me?.terms;

  const [name, setName] = useState('');
  const [codeVal, setCodeVal] = useState(code ?? '');
  const [buy, setBuy] = useState('');
  const [sell, setSell] = useState('');
  const [brand, setBrand] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSave() {
    if (!name.trim()) { Alert.alert('Nom', `${t?.item ?? 'Mahsulot'} nomini kiriting.`); return; }
    if (!digits(sell)) { Alert.alert('Narx', 'Sotuv narxini kiriting.'); return; }
    setBusy(true);
    try {
      await api('/api/mobile/products', {
        method: 'POST',
        body: {
          name: name.trim(),
          code: codeVal.trim(),
          purchasePrice: Number(digits(buy)) || 0,
          salePrice: Number(digits(sell)) || 0,
          brand: brand.trim(),
        },
      });
      Alert.alert('Saqlandi', `${t?.item ?? 'Mahsulot'} qo'shildi.`);
      router.back();
    } catch (e) {
      Alert.alert('Xatolik', e instanceof Error ? e.message : 'Saqlashda xatolik');
    } finally { setBusy(false); }
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.bar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}><Ionicons name="chevron-back" size={26} color={colors.text} /></TouchableOpacity>
        <Text style={s.barTitle}>{t?.addItem ?? 'Mahsulot qo\'shish'}</Text>
        <View style={{ width: 26 }} />
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
          <Field label={`${t?.item ?? 'Mahsulot'} nomi`} value={name} onChangeText={setName} placeholder="Nomi" autoFocus />
          <Field label={t?.codeLabel ?? 'Kod / shtrix'} value={codeVal} onChangeText={setCodeVal} placeholder="Bo'sh qoldirsangiz avtomatik" autoCapitalize="characters" />
          <View style={s.rowFields}>
            <View style={{ flex: 1 }}><Field label="Kelish narxi" value={grouped(buy)} onChangeText={(v) => setBuy(digits(v))} placeholder="0" keyboardType="numeric" /></View>
            <View style={{ flex: 1 }}><Field label="Sotuv narxi" value={grouped(sell)} onChangeText={(v) => setSell(digits(v))} placeholder="0" keyboardType="numeric" /></View>
          </View>
          <Field label="Brend (ixtiyoriy)" value={brand} onChangeText={setBrand} placeholder="Masalan: Apple" />

          <TouchableOpacity style={[s.save, busy && { opacity: 0.6 }]} onPress={onSave} disabled={busy} activeOpacity={0.85}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.saveT}>Saqlash</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, style, ...rest } = props;
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
  label: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginBottom: 6 },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.text },
  rowFields: { flexDirection: 'row', gap: 12 },
  save: { backgroundColor: colors.brand, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 12 },
  saveT: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
