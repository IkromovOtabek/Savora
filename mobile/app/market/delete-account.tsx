import { useState } from 'react';
import { View, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { Screen, NavBar, LargeTitle, Group, Field, Button } from '@/components/ui';
import { errMsg } from '@/lib/api';
import { useBuyer } from '@/lib/buyer';
import { useTheme } from '@/lib/theme';
import { useDict } from '@/lib/i18n';
import { useMarketDict } from '@/lib/marketI18n';

/** Xaridor hisobini o'chirish — App Store 5.1.1(v): ilovada ro'yxatdan o'tish bor, o'chirish ham shart. Parol bilan. */
export default function MarketDeleteAccount() {
  const router = useRouter();
  const { buyer, request, logout } = useBuyer();
  const { c } = useTheme();
  const d = useDict();
  const m = useMarketDict();
  const k = m.deleteAccount;
  const [password, setPassword] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/market'));

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
      await request<{ ok: boolean }>('/api/market/account/delete', { method: 'POST', body: { password } });
      await logout();
      Alert.alert(k.doneTitle, k.doneMsg);
      router.replace('/market');
    } catch (e) {
      Alert.alert(d.common.error, errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen keyboard header={<NavBar onBack={back} />}>
      <LargeTitle title={k.title} />
      <View style={{ gap: 10 }}>
        <Text style={{ fontSize: 16, lineHeight: 22, color: c.ink }}>{k.lead}</Text>
        <Text style={{ fontSize: 15, lineHeight: 21, color: c.ink3 }}>{k.effects}</Text>
      </View>
      {buyer ? (
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
      ) : null}
    </Screen>
  );
}
