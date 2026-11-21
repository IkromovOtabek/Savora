import { useRef, useState } from 'react';
import { View, Pressable, StyleSheet, type TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { Screen, NavBar, LargeTitle, Group, Field, Button, InlineError } from '@/components/ui';
import { ApiError, errMsg } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useBuyer } from '@/lib/buyer';
import { useTheme } from '@/lib/theme';
import { useDict } from '@/lib/i18n';
import { loginIdKind } from '@/lib/phone';
import { useMarketDict } from '@/lib/marketI18n';
import { safeNext } from '@/lib/market';

/**
 * Yagona kirish: «Telefon raqam yoki login» + parol. Telefon — xaridor akkaunti (topilmasa raqamli biznes logini
 * sifatida ham sinanadi), harfli login — biznes paneli. Xaridor — kelgan joyga (`next`, masalan savat),
 * biznes — o'z paneliga. Server xato matni (tilga mos) forma ostida ko'rinadi.
 */
export function LoginForm() {
  const m = useMarketDict();
  const a = m.auth;
  const d = useDict();
  const { c } = useTheme();
  const router = useRouter();
  const auth = useAuth();
  const buyer = useBuyer();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const target = safeNext(next);

  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passRef = useRef<TextInput>(null);

  const id = loginIdKind(loginId);
  const errs = {
    loginId: !id ? a.errLoginId : null,
    password: !password ? a.errPassword : null,
  };
  const show = (e: string | null) => (tried ? e : null);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/market'));

  function buyerDone() {
    // Savatdan kelgan bo'lsa — savatga (oraliq kirish ekranlari yopiladi), aks holda orqaga
    if (target) router.dismissTo(target);
    else back();
  }

  async function businessLogin(username: string) {
    await auth.login(username, password);
    router.replace('/(tabs)');
  }

  async function submit() {
    setTried(true);
    if (!id || errs.password) return;
    setBusy(true);
    setError(null);
    try {
      if (id.kind === 'login') {
        await businessLogin(id.login);
      } else {
        try {
          await buyer.login(id.phone, password);
          buyerDone();
        } catch (e) {
          // Xaridor topilmadi — raqamdan iborat biznes logini bo'lishi mumkin; u ham bo'lmasa — xaridor xatosi
          if (!(e instanceof ApiError && e.status === 401)) throw e;
          try { await businessLogin(id.login); } catch { throw e; }
        }
      }
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  const toRegister = () => router.replace(`/market/register${target ? `?next=${encodeURIComponent(target)}` : ''}`);

  return (
    <Screen keyboard header={<NavBar onBack={back} />} gap={16}>
      <LargeTitle title={a.loginTitle} subtitle={a.loginSub} />

      <Group>
        <View style={{ padding: 16, gap: 14 }}>
          <Field
            label={a.loginId}
            value={loginId}
            onChangeText={setLoginId}
            placeholder={a.loginIdPh}
            autoCapitalize="none"
            textContentType="username"
            autoComplete="username"
            maxLength={40}
            returnKeyType="next"
            onSubmitEditing={() => passRef.current?.focus()}
            error={show(errs.loginId)}
          />
          <Field
            ref={passRef}
            label={a.password}
            value={password}
            onChangeText={setPassword}
            placeholder={a.passwordPh}
            secureTextEntry={!showPass}
            autoCapitalize="none"
            textContentType="password"
            autoComplete="password"
            maxLength={128}
            returnKeyType="go"
            onSubmitEditing={submit}
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

      <Button title={a.login} size="lg" full loading={busy} onPress={submit} />

      <Pressable onPress={toRegister} hitSlop={8} accessibilityRole="link" style={({ pressed }) => [s.link, pressed && { opacity: 0.6 }]}>
        <Text style={[s.linkT, { color: c.tint }]}>{a.noAccount}</Text>
      </Pressable>
    </Screen>
  );
}

const s = StyleSheet.create({
  link: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 4 },
  linkT: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
});
