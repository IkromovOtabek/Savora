import { useState } from 'react';
import { View, Alert } from 'react-native';
import { api, errMsg } from '@/lib/api';
import { useResource } from '@/lib/hooks';
import { useTheme } from '@/lib/theme';
import { fmtPhoneLocal, phoneLocal, phoneE164 } from '@/lib/format';
import {
  Screen, NavBar, LargeTitle, Group, Cell, Field, Button, Pill, Loading, ErrorState, InlineError, EmptyState,
} from '@/components/ui';

interface B { id: string; name: string; address: string | null; isMain: boolean }

export default function Branches() {
  const { c } = useTheme();
  const res = useResource<{ items: B[] }>('/api/mobile/branches');
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);

  const err = {
    name: !name.trim() ? 'Filial nomini kiriting' : null,
    username: username.trim().length < 3 ? 'Login kamida 3 belgi' : null,
    password: password.length < 6 ? 'Parol kamida 6 belgi' : null,
    phone: phone && phoneLocal(phone).length !== 9 ? 'Telefon 9 ta raqam' : null,
  };

  async function create() {
    setTried(true);
    if (Object.values(err).some(Boolean)) return;
    setBusy(true);
    try {
      await api('/api/mobile/branches', {
        method: 'POST',
        body: { name: name.trim(), address: address.trim(), phone: phone ? phoneE164(phone) : '', username: username.trim(), password },
      });
      Alert.alert('Qo\'shildi', `${name.trim()} filiali va logini yaratildi.`);
      setOpen(false); setName(''); setAddress(''); setPhone(''); setUsername(''); setPassword(''); setTried(false);
      res.reloadSilently();
    } catch (e) { Alert.alert('Xatolik', errMsg(e)); }
    finally { setBusy(false); }
  }

  const items = res.data?.items ?? [];
  return (
    <Screen
      keyboard
      header={<NavBar right={<Button title={open ? 'Yopish' : 'Qo\'shish'} variant="plain" icon={open ? undefined : 'add'} onPress={() => setOpen((o) => !o)} />} />}
      refreshing={res.refreshing}
      onRefresh={res.refresh}
    >
      <LargeTitle title="Filiallar" subtitle={res.data ? `${items.length} ta` : undefined} />

      {open ? (
        <View style={{ gap: 12 }}>
          <Field label="Filial nomi" value={name} onChangeText={setName} placeholder="Masalan: Chilonzor" error={tried ? err.name : null} />
          <Field label="Manzil (ixtiyoriy)" value={address} onChangeText={setAddress} placeholder="Ko'cha, uy" />
          <Field label="Telefon (ixtiyoriy)" prefix="+998" value={fmtPhoneLocal(phone)} onChangeText={(v) => setPhone(phoneLocal(v))} placeholder="90 123 45 67" keyboardType="phone-pad" maxLength={12} error={tried ? err.phone : null} />
          <Field label="Login" value={username} onChangeText={setUsername} placeholder="filial login" autoCapitalize="none" error={tried ? err.username : null} />
          <Field label="Parol" value={password} onChangeText={setPassword} placeholder="kamida 6 belgi" secureTextEntry error={tried ? err.password : null} />
          <Button title="Filial yaratish" full loading={busy} onPress={create} />
        </View>
      ) : null}

      {res.loading && !res.data ? <Loading />
        : !res.data ? <ErrorState message={res.error} onRetry={res.retry} />
        : items.length === 0 ? <EmptyState icon="business-outline" title="Filial yo'q" actionTitle="Filial qo'shish" onAction={() => setOpen(true)} />
        : (
          <>
            {res.error ? <InlineError message={res.error} onRetry={res.refresh} /> : null}
            <Group>
              {items.map((b) => (
                <Cell
                  key={b.id}
                  icon="business"
                  iconColor={b.isMain ? c.sq.b : c.sq.g}
                  title={b.name}
                  subtitle={b.address ?? undefined}
                  right={b.isMain ? <Pill label="Asosiy" tone="br" /> : undefined}
                />
              ))}
            </Group>
          </>
        )}
    </Screen>
  );
}
