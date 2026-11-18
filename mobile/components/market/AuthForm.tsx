import { useRef, useState } from 'react';
import { View, Pressable, StyleSheet, type TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { Screen, NavBar, LargeTitle, Group, Field, PhoneField, Button, InlineError } from '@/components/ui';
import { errMsg } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useBuyer } from '@/lib/buyer';
import { useTheme } from '@/lib/theme';
import { useDict } from '@/lib/i18n';
import { uzPhone9, uzPhoneE164 } from '@/lib/phone';
import { useMarketDict } from '@/lib/marketI18n';
import { safeNext } from '@/lib/market';

/**
 * Xaridor kirishi / ro'yxatdan o'tishi (ism + telefon + parol). Muvaffaqiyatda — kelgan joyga
 * (`next` — masalan savat; bo'lmasa orqaga). Server xato matni (tilga mos) maydonlar ostida ko'rinadi.
 */
export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const m = useMarketDict();
  const a = m.auth;
  const d = useDict();
  const { c } = useTheme();
  const router = useRouter();
  const { me } = useAuth();
  const buyer = useBuyer();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const target = safeNext(next);
  const reg = mode === 'register';

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const phoneRef = useRef<TextInput>(null);
  const passRef = useRef<TextInput>(null);

  const errs = {
    name: reg && (name.trim().length < 2 || name.trim().length > 80) ? a.errName : null,
    phone: !uzPhone9(phone) ? a.errPhone : null,
    password: reg ? (password.length < 6 ? a.errPassword : null) : (!password ? a.errPassword : null),
  };
  const show = (e: string | null) => (tried ? e : null);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/market'));

  function done() {
    // Savatdan kelgan bo'lsa — savatga (oraliq kirish ekranlari yopiladi), aks holda orqaga
    if (target) router.dismissTo(target);
    else back();
  }

  async function submit() {
    setTried(true);
    if (errs.name || errs.phone || errs.password) return;
    setBusy(true);
    setError(null);
    try {
      if (reg) await buyer.register(name.trim(), uzPhoneE164(phone), password);
      else await buyer.login(uzPhoneE164(phone), password);
      done();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  const swap = () => {
    const q = target ? `?next=${encodeURIComponent(target)}` : '';
    router.replace(`${reg ? '/market/login' : '/market/register'}${q}`);
  };

  return (
    <Screen keyboard header={<NavBar onBack={back} />} gap={16}>
      <LargeTitle title={reg ? a.registerTitle : a.loginTitle} subtitle={a.sub} />

      <Group>
        <View style={{ padding: 16, gap: 14 }}>
          {reg ? (
            <Field
              label={a.name}
              value={name}
              onChangeText={setName}
              placeholder={a.namePh}
              autoCapitalize="words"
              textContentType="name"
              autoComplete="name"
              maxLength={80}
              returnKeyType="next"
              onSubmitEditing={() => phoneRef.current?.focus()}
              error={show(errs.name)}
            />
          ) : null}
          <PhoneField
            ref={phoneRef}
            label={a.phone}
            value={phone}
            onChangeText={setPhone}
            textContentType="telephoneNumber"
            autoComplete="tel"
            returnKeyType="next"
            onSubmitEditing={() => passRef.current?.focus()}
            error={show(errs.phone)}
          />
          <Field
            ref={passRef}
            label={a.password}
            value={password}
            onChangeText={setPassword}
            placeholder={a.passwordPh}
            secureTextEntry={!showPass}
            autoCapitalize="none"
            textContentType={reg ? 'newPassword' : 'password'}
            autoComplete={reg ? 'new-password' : 'password'}
            maxLength={100}
            returnKeyType="go"
            onSubmitEditing={submit}
            hint={reg ? a.passwordHint : undefined}
            error={show(errs.password)}
            right={
              <Pressable onPress={() => setShowPass((v) => !v)} hitSlop={12} accessibilityLabel={showPass ? d.login.hidePass : d.login.showPass}>
                <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={20} color={c.ink3} />
              </Pressable>
            }
          />
        </View>
      </Group>

      {error ? <InlineError message={error} /> : null}

      <Button title={reg ? a.register : a.login} size="lg" full loading={busy} onPress={submit} />

      <Pressable onPress={swap} hitSlop={8} accessibilityRole="link" style={({ pressed }) => [s.link, pressed && { opacity: 0.6 }]}>
        <Text style={[s.linkT, { color: c.tint }]}>{reg ? a.haveAccount : a.noAccount}</Text>
      </Pressable>

      {/* Do'kon egasi — biznes paneliga (alohida akkaunt) */}
      {!me ? (
        <Pressable onPress={() => router.push('/login')} hitSlop={8} accessibilityRole="link" style={({ pressed }) => [s.link, pressed && { opacity: 0.6 }]}>
          <Ionicons name="briefcase-outline" size={16} color={c.ink3} />
          <Text style={[s.linkT, { color: c.ink3, fontWeight: '500' }]}>{a.businessHint}</Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  link: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 4 },
  linkT: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
});
