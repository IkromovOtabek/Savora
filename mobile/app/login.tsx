import { useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert, Pressable, type TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { errMsg } from '@/lib/api';
import { useTheme } from '@/lib/theme';
import { Field, Button } from '@/components/ui';

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const passRef = useRef<TextInput>(null);

  async function onSubmit() {
    if (!username.trim() || !password) {
      Alert.alert('Maydonlar', 'Login va parolni kiriting.');
      return;
    }
    setBusy(true);
    try {
      await login(username.trim(), password);
      router.replace('/(tabs)');
    } catch (e) {
      Alert.alert('Kirib bo\'lmadi', errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[s.scroll, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={s.wrap}>
            <View style={[s.logo, { backgroundColor: c.tint }]}><Text style={s.logoText}>S</Text></View>
            <Text style={[s.title, { color: c.ink }]}>Savora</Text>
            <Text style={[s.subtitle, { color: c.ink3 }]}>Hisobingizga kiring</Text>

            <View style={{ gap: 14 }}>
              <Field
                label="Login"
                value={username}
                onChangeText={setUsername}
                placeholder="login"
                autoCapitalize="none"
                textContentType="username"
                autoComplete="username"
                returnKeyType="next"
                onSubmitEditing={() => passRef.current?.focus()}
              />
              <Field
                ref={passRef}
                label="Parol"
                value={password}
                onChangeText={setPassword}
                placeholder="parol"
                secureTextEntry={!showPass}
                textContentType="password"
                autoComplete="password"
                returnKeyType="go"
                onSubmitEditing={onSubmit}
                right={
                  <Pressable onPress={() => setShowPass((v) => !v)} hitSlop={12} accessibilityLabel={showPass ? 'Parolni yashirish' : 'Parolni ko\'rsatish'}>
                    <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={20} color={c.ink3} />
                  </Pressable>
                }
              />
              <Button title="Kirish" size="lg" full loading={busy} onPress={onSubmit} style={{ marginTop: 8 }} />
            </View>

            <Text style={[s.foot, { color: c.ink3 }]}>Login va parolni do&apos;kon egasi yoki platforma beradi.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24 },
  wrap: { width: '100%', maxWidth: 420, alignSelf: 'center' },
  logo: { width: 72, height: 72, borderRadius: 18, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  logoText: { color: '#fff', fontSize: 34, fontWeight: '700' },
  title: { fontSize: 32, fontWeight: '700', letterSpacing: -0.8, textAlign: 'center', marginTop: 16 },
  subtitle: { fontSize: 15, textAlign: 'center', marginTop: 4, marginBottom: 28 },
  foot: { fontSize: 13, textAlign: 'center', marginTop: 22, lineHeight: 18 },
});
