import { useCallback, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/lib/api';
import { colors, tiles } from '@/lib/theme';

interface B { id: string; name: string; address: string | null; isMain: boolean }

export default function Branches() {
  const router = useRouter();
  const [items, setItems] = useState<B[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setItems((await api<{ items: B[] }>('/api/mobile/branches')).items); } catch { /* ignore */ } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function create() {
    if (!name.trim()) { Alert.alert('Nom', 'Filial nomini kiriting.'); return; }
    if (username.trim().length < 3) { Alert.alert('Login', 'Login kamida 3 belgi.'); return; }
    if (password.length < 6) { Alert.alert('Parol', 'Parol kamida 6 belgi.'); return; }
    setBusy(true);
    try {
      await api('/api/mobile/branches', { method: 'POST', body: { name: name.trim(), address: address.trim(), username: username.trim(), password } });
      Alert.alert('Qo\'shildi', `${name.trim()} filiali va logini yaratildi.`);
      setOpen(false); setName(''); setAddress(''); setUsername(''); setPassword('');
      await load();
    } catch (e) { Alert.alert('Xatolik', e instanceof Error ? e.message : 'Xatolik'); }
    finally { setBusy(false); }
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.bar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}><Ionicons name="chevron-back" size={26} color={colors.text} /></TouchableOpacity>
        <Text style={s.barTitle}>Filiallar</Text>
        <TouchableOpacity onPress={() => setOpen((o) => !o)} hitSlop={10}><Ionicons name={open ? 'close' : 'add'} size={26} color={colors.brand} /></TouchableOpacity>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
          {open && (
            <View style={s.form}>
              <Text style={s.formTitle}>Yangi filial</Text>
              <TextInput style={s.input} value={name} onChangeText={setName} placeholder="Filial nomi" placeholderTextColor={colors.textFaint} />
              <TextInput style={s.input} value={address} onChangeText={setAddress} placeholder="Manzil (ixtiyoriy)" placeholderTextColor={colors.textFaint} />
              <TextInput style={s.input} value={username} onChangeText={setUsername} placeholder="Login" autoCapitalize="none" placeholderTextColor={colors.textFaint} />
              <TextInput style={s.input} value={password} onChangeText={setPassword} placeholder="Parol (kamida 6)" secureTextEntry placeholderTextColor={colors.textFaint} />
              <TouchableOpacity style={[s.createBtn, busy && { opacity: 0.6 }]} onPress={create} disabled={busy} activeOpacity={0.85}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.createT}>Yaratish</Text>}
              </TouchableOpacity>
            </View>
          )}

          {loading ? <ActivityIndicator color={colors.brand} style={{ marginTop: 30 }} /> : items.map((b) => (
            <View key={b.id} style={s.row}>
              <View style={[s.icon, { backgroundColor: b.isMain ? tiles.indigo.bg : tiles.slate.bg }]}>
                <Ionicons name="business" size={18} color={b.isMain ? colors.brand : colors.textMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{b.name}{b.isMain ? ' · asosiy' : ''}</Text>
                {b.address ? <Text style={s.addr}>{b.address}</Text> : null}
              </View>
            </View>
          ))}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10 },
  barTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  form: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 14, marginBottom: 18, gap: 10 },
  formTitle: { fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: 2 },
  input: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15.5, color: colors.text },
  createBtn: { backgroundColor: colors.brand, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 2 },
  createT: { color: '#fff', fontSize: 15, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, marginBottom: 10 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  addr: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
});
