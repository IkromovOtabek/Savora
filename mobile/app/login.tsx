import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    if (!username || !password) {
      Alert.alert('Maydonlar', 'Login va parolni kiriting.');
      return;
    }
    setBusy(true);
    try {
      await login(username.trim(), password);
      router.replace('/(tabs)');
    } catch (e) {
      Alert.alert('Kirish xatosi', e instanceof Error ? e.message : 'Xatolik');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.flex}>
        <View style={s.wrap}>
          <View style={s.logo}><Text style={s.logoText}>S</Text></View>
          <Text style={s.title}>Savora</Text>
          <Text style={s.subtitle}>Tizimga kirish</Text>

          <Text style={s.label}>Login</Text>
          <TextInput style={s.input} value={username} onChangeText={setUsername} placeholder="login"
            autoCapitalize="none" autoCorrect={false} placeholderTextColor={colors.textFaint} />

          <Text style={s.label}>Parol</Text>
          <TextInput style={s.input} value={password} onChangeText={setPassword} placeholder="parol"
            secureTextEntry placeholderTextColor={colors.textFaint} onSubmitEditing={onSubmit} />

          <TouchableOpacity style={[s.btn, busy && s.btnDisabled]} onPress={onSubmit} disabled={busy} activeOpacity={0.85}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Kirish</Text>}
          </TouchableOpacity>

          <Text style={s.foot}>Login va parolni do'kon egasi yoki platforma beradi.</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  wrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  logo: { width: 64, height: 64, borderRadius: 18, backgroundColor: colors.brand, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  logoText: { color: '#fff', fontSize: 32, fontWeight: '800' },
  title: { fontSize: 26, fontWeight: '800', color: colors.text, textAlign: 'center', marginTop: 14 },
  subtitle: { fontSize: 15, color: colors.textMuted, textAlign: 'center', marginBottom: 28 },
  label: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginBottom: 6, marginTop: 14 },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, color: colors.text },
  btn: { backgroundColor: colors.brand, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 26 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  foot: { fontSize: 12.5, color: colors.textFaint, textAlign: 'center', marginTop: 20 },
});
