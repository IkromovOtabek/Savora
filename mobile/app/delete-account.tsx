import { useState } from 'react';
import { View, Alert } from 'react-native';
import { Text } from '@/components/ui/Text';
import { useRouter } from 'expo-router';
import { api, errMsg } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { useDict } from '@/lib/i18n';
import { Screen, NavBar, LargeTitle, Group, Field, Button } from '@/components/ui';

/** Hisobni (do'konni) o'chirish — App Store 5.1.1(v). Faqat do'kon egasi, parol bilan tasdiqlanadi. */
export default function DeleteAccount() {
  const router = useRouter();
  const { me, logout } = useAuth();
  const { c } = useTheme();
  const d = useDict();
  const k = d.deleteAccount;
  const [password, setPassword] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const isAdmin = !!me?.user.isAdmin;

  function confirm() {
    setTried(true);
    if (!password) return;
    Alert.alert(k.confirmTitle, k.confirmMsg, [
      { text: d.common.cancel, style: 'cancel' },
      { text: k.confirmYes, style: 'destructive', onPress: () => void run() },
    ]);
  }

  async function run() {
    setBusy(true);
    try {
      await api('/api/mobile/account/delete', { method: 'POST', body: { password } });
      await logout();
      Alert.alert(k.doneTitle, k.doneMsg);
      router.replace('/login');
    } catch (e) {
      Alert.alert(d.common.error, errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen keyboard header={<NavBar backLabel={d.profile.title} />}>
      <LargeTitle title={k.title} />
      <View style={{ gap: 10 }}>
        <Text style={{ fontSize: 16, lineHeight: 22, color: c.ink }}>{k.lead}</Text>
        <Text style={{ fontSize: 15, lineHeight: 21, color: c.ink3 }}>{k.effects}</Text>
      </View>
      {!isAdmin ? (
        <Text style={{ fontSize: 15, color: c.bad }}>{k.ownerOnly}</Text>
      ) : (
        <>
          <Group>
            <View style={{ padding: 12 }}>
              <Field
                label={k.password}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                textContentType="password"
                autoComplete="password"
                error={tried && !password ? k.errPass : null}
              />
            </View>
          </Group>
          <Button title={k.submit} variant="destructive" size="lg" full loading={busy} onPress={confirm} />
        </>
      )}
    </Screen>
  );
}
