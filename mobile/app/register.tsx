import { useState } from 'react';
import { View, Text, Pressable, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { API_URL, errMsg } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useResource } from '@/lib/hooks';
import { useTheme } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';
import { Screen, NavBar, LargeTitle, Group, Cell, Field, Button, Switch } from '@/components/ui';

interface BType { key: string; label: string; description: string }

const LOGIN_RE = /^[a-z0-9_]{3,40}$/;

/**
 * Ilova ichida do'kon ochish (BILLZ kabi ro'yxatdan o'tish): faqat bepul tarif —
 * pullik tarif ilovada ko'rsatilmaydi (App Store qoidasi). Muvaffaqiyatda darhol kiradi.
 */
export default function Register() {
  const router = useRouter();
  const { register } = useAuth();
  const { c } = useTheme();
  const { d, locale } = useI18n();
  const k = d.signup;
  const types = useResource<{ types: BType[] }>(`/api/mobile/auth/register?lang=${locale}`);

  const [name, setName] = useState('');
  const [biz, setBiz] = useState('general');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [agree, setAgree] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  const errs = {
    name: name.trim().length < 2 ? k.errName : null,
    username: !LOGIN_RE.test(username) ? k.errLogin : null,
    password: password.length < 6 ? k.errPass : null,
    confirm: confirm !== password ? k.errMatch : null,
  };
  const show = (e: string | null) => (tried ? e : null);

  async function submit() {
    setTried(true);
    if (Object.values(errs).some(Boolean)) return;
    if (!agree) { Alert.alert(k.failTitle, k.errAgree); return; }
    setBusy(true);
    try {
      await register({ name: name.trim(), businessType: biz, username, password, acceptTerms: true });
      router.replace('/(tabs)');
    } catch (e) {
      Alert.alert(k.failTitle, errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen keyboard header={<NavBar />}>
      <LargeTitle title={k.title} />
      <Text style={{ fontSize: 15, color: c.ink3, marginTop: -6 }}>{k.lead}</Text>

      <Group header={k.storeSection}>
        <View style={{ padding: 12 }}>
          <Field label={k.storeName} value={name} onChangeText={setName} placeholder={k.storeNamePh} maxLength={60} error={show(errs.name)} />
        </View>
      </Group>

      <Group header={k.bizSection} footer={k.bizFooter}>
        {!types.data ? (
          <View style={{ padding: 16 }}><ActivityIndicator color={c.tint} /></View>
        ) : types.data.types.map((t) => (
          <Cell key={t.key} title={t.label} subtitle={t.description} checked={biz === t.key} onPress={() => setBiz(t.key)} />
        ))}
      </Group>

      <Group header={k.credsSection}>
        <View style={{ padding: 12, gap: 12 }}>
          <Field
            label={k.login}
            value={username}
            onChangeText={(v) => setUsername(v.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            placeholder={k.loginPh}
            hint={k.loginHint}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username-new"
            textContentType="username"
            maxLength={40}
            error={show(errs.username)}
          />
          <Field label={k.password} value={password} onChangeText={setPassword} placeholder={k.passwordPh} secureTextEntry textContentType="newPassword" autoComplete="password-new" error={show(errs.password)} />
          <Field label={k.confirm} value={confirm} onChangeText={setConfirm} secureTextEntry textContentType="newPassword" error={show(errs.confirm)} />
        </View>
      </Group>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4 }}>
        <Switch value={agree} onValueChange={setAgree} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ fontSize: 15, color: c.ink }}>{k.agree}</Text>
          <View style={{ flexDirection: 'row', gap: 14 }}>
            <Pressable onPress={() => Linking.openURL(`${API_URL}/terms`)} hitSlop={6}><Text style={{ color: c.tint, fontSize: 14 }}>{k.offer}</Text></Pressable>
            <Pressable onPress={() => Linking.openURL(`${API_URL}/privacy`)} hitSlop={6}><Text style={{ color: c.tint, fontSize: 14 }}>{k.privacy}</Text></Pressable>
          </View>
        </View>
      </View>

      <Button title={k.submit} size="lg" full loading={busy} onPress={submit} />
      <Pressable onPress={() => router.back()} hitSlop={8} style={{ alignSelf: 'center', paddingVertical: 4 }}>
        <Text style={{ color: c.tint, fontSize: 15, fontWeight: '600' }}>{k.haveAccount}</Text>
      </Pressable>
    </Screen>
  );
}
