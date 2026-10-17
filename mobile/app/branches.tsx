import { useState } from 'react';
import { View, Alert } from 'react-native';
import { api, errMsg } from '@/lib/api';
import { useResource } from '@/lib/hooks';
import { useTheme } from '@/lib/theme';
import { fmtPhoneLocal, phoneLocal, phoneE164 } from '@/lib/format';
import { useDict, tr } from '@/lib/i18n';
import {
  Screen, NavBar, LargeTitle, Group, Cell, Field, Button, Pill, Loading, ErrorState, InlineError, EmptyState,
} from '@/components/ui';

interface B { id: string; name: string; address: string | null; isMain: boolean }

export default function Branches() {
  const { c } = useTheme();
  const d = useDict();
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
    name: !name.trim() ? d.branches.errName : null,
    username: username.trim().length < 3 ? d.branches.errLogin : null,
    password: password.length < 6 ? d.branches.errPass : null,
    phone: phone && phoneLocal(phone).length !== 9 ? d.branches.errPhone : null,
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
      Alert.alert(d.branches.added, tr(d.branches.addedMsg, { name: name.trim() }));
      setOpen(false); setName(''); setAddress(''); setPhone(''); setUsername(''); setPassword(''); setTried(false);
      res.reloadSilently();
    } catch (e) { Alert.alert(d.common.error, errMsg(e)); }
    finally { setBusy(false); }
  }

  const items = res.data?.items ?? [];
  return (
    <Screen
      keyboard
      header={<NavBar right={<Button title={open ? d.common.close : d.common.add} variant="plain" icon={open ? undefined : 'add'} onPress={() => setOpen((o) => !o)} />} />}
      refreshing={res.refreshing}
      onRefresh={res.refresh}
    >
      <LargeTitle title={d.branches.title} subtitle={res.data ? tr(d.common.count, { n: items.length }) : undefined} />

      {open ? (
        <View style={{ gap: 12 }}>
          <Field label={d.branches.nameLabel} value={name} onChangeText={setName} placeholder={d.branches.namePlaceholder} error={tried ? err.name : null} />
          <Field label={d.branches.address} value={address} onChangeText={setAddress} placeholder={d.branches.addressPlaceholder} />
          <Field label={d.branches.phone} prefix="+998" value={fmtPhoneLocal(phone)} onChangeText={(v) => setPhone(phoneLocal(v))} placeholder={d.common.phonePlaceholder} keyboardType="phone-pad" maxLength={12} error={tried ? err.phone : null} />
          <Field label={d.common.login} value={username} onChangeText={setUsername} placeholder={d.branches.loginPlaceholder} autoCapitalize="none" error={tried ? err.username : null} />
          <Field label={d.common.password} value={password} onChangeText={setPassword} placeholder={d.branches.passPlaceholder} secureTextEntry error={tried ? err.password : null} />
          <Button title={d.branches.create} full loading={busy} onPress={create} />
        </View>
      ) : null}

      {res.loading && !res.data ? <Loading />
        : !res.data ? <ErrorState message={res.error} onRetry={res.retry} />
        : items.length === 0 ? <EmptyState icon="business-outline" title={d.branches.empty} actionTitle={d.branches.addBranch} onAction={() => setOpen(true)} />
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
                  right={b.isMain ? <Pill label={d.branches.main} tone="br" /> : undefined}
                />
              ))}
            </Group>
          </>
        )}
    </Screen>
  );
}
