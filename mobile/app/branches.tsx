import { useState } from 'react';
import { View, Alert } from 'react-native';
import { Text } from '@/components/ui/Text';
import { api, errMsg } from '@/lib/api';
import { useResource } from '@/lib/hooks';
import { useTheme } from '@/lib/theme';
import { isBarePhone, uzPhone9, uzPhoneE164 } from '@/lib/phone';
import { useDict, tr } from '@/lib/i18n';
import {
  Screen, NavBar, LargeTitle, Group, Cell, Field, PhoneField, Button, Pill, Loading, ErrorState, InlineError, EmptyState,
  SegmentedControl, Chips, FormCard,
} from '@/components/ui';

interface B { id: string; name: string; address: string | null; isMain: boolean }

/** /api/mobile/staff — xodimlar (bir filialga bir nechta login), web Jamoa sahifasi bilan bir xil qoidalar */
interface StaffItem { id: string; username: string; name: string; branchId: string | null; branchName: string | null; roleName: string | null; active: boolean }
interface StaffData {
  items: StaffItem[];
  branches: { id: string; name: string; isMain: boolean }[];
  roles: { id: string; name: string }[];
  limit: { used: number; max: number };
}

type Tab = 'branches' | 'staff';
type Res<T> = ReturnType<typeof useResource<T>>;

export default function Branches() {
  const d = useDict();
  const [tab, setTab] = useState<Tab>('branches');
  const [open, setOpen] = useState(false);
  const branchesRes = useResource<{ items: B[] }>('/api/mobile/branches');
  // Xodimlar faqat o'z tabida so'raladi
  const staffRes = useResource<StaffData>(tab === 'staff' ? '/api/mobile/staff' : null);
  const active = tab === 'staff' ? staffRes : branchesRes;

  return (
    <Screen
      keyboard
      header={<NavBar right={<Button title={open ? d.common.close : d.common.add} variant="plain" icon={open ? undefined : 'add'} onPress={() => setOpen((o) => !o)} />} />}
      refreshing={active.refreshing}
      onRefresh={active.refresh}
    >
      <LargeTitle
        title={d.branches.title}
        subtitle={tab === 'branches' && branchesRes.data ? tr(d.common.count, { n: branchesRes.data.items.length }) : undefined}
      />
      <SegmentedControl
        options={[{ key: 'branches', label: d.branches.tabBranches }, { key: 'staff', label: d.branches.tabStaff }]}
        value={tab}
        onChange={(k) => { setTab(k); setOpen(false); }}
      />
      {tab === 'branches'
        ? <BranchesTab res={branchesRes} open={open} setOpen={setOpen} />
        : <StaffTab res={staffRes} open={open} setOpen={setOpen} />}
    </Screen>
  );
}

function BranchesTab({ res, open, setOpen }: { res: Res<{ items: B[] }>; open: boolean; setOpen: (v: boolean) => void }) {
  const { c } = useTheme();
  const d = useDict();
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
    phone: !isBarePhone(phone) && !uzPhone9(phone) ? d.branches.errPhone : null,
  };

  async function create() {
    setTried(true);
    if (Object.values(err).some(Boolean)) return;
    setBusy(true);
    try {
      await api('/api/mobile/branches', {
        method: 'POST',
        body: { name: name.trim(), address: address.trim(), phone: uzPhoneE164(phone), username: username.trim(), password },
      });
      Alert.alert(d.branches.added, tr(d.branches.addedMsg, { name: name.trim() }));
      setOpen(false); setName(''); setAddress(''); setPhone(''); setUsername(''); setPassword(''); setTried(false);
      res.reloadSilently();
    } catch (e) { Alert.alert(d.common.error, errMsg(e)); }
    finally { setBusy(false); }
  }

  const items = res.data?.items ?? [];
  return (
    <>
      {open ? (
        <View style={{ gap: 12 }}>
          <Field label={d.branches.nameLabel} value={name} onChangeText={setName} placeholder={d.branches.namePlaceholder} error={tried ? err.name : null} />
          <Field label={d.branches.address} value={address} onChangeText={setAddress} placeholder={d.branches.addressPlaceholder} />
          <PhoneField label={d.branches.phone} value={phone} onChangeText={setPhone} error={tried ? err.phone : null} />
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
    </>
  );
}

function StaffTab({ res, open, setOpen }: { res: Res<StaffData>; open: boolean; setOpen: (v: boolean) => void }) {
  const { c } = useTheme();
  const d = useDict();
  const b = d.branches;
  const [fullName, setFullName] = useState('');
  const [branchId, setBranchId] = useState<string | null>(null);
  const [roleId, setRoleId] = useState<string>('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);

  const data = res.data;
  const branches = data?.branches ?? [];
  // Bitta filial bo'lsa — o'zi tanlangan
  const pickedBranch = branchId ?? (branches.length === 1 ? branches[0].id : null);
  const atLimit = !!data && data.limit.used >= data.limit.max;
  const err = {
    name: !fullName.trim() ? b.staffErrName : null,
    branch: !pickedBranch ? b.staffErrBranch : null,
    username: username.trim().length < 3 ? b.errLogin : null,
    password: password.length < 6 ? b.errPass : null,
  };

  async function create() {
    setTried(true);
    if (Object.values(err).some(Boolean) || atLimit) return;
    setBusy(true);
    try {
      const r = await api<{ username: string; fullName: string }>('/api/mobile/staff', {
        method: 'POST',
        body: { fullName: fullName.trim(), branchId: pickedBranch, roleId, username: username.trim(), password },
      });
      Alert.alert(b.added, tr(b.staffAdded, { name: r.fullName, login: r.username }));
      setOpen(false); setFullName(''); setUsername(''); setPassword(''); setRoleId(''); setTried(false);
      res.reloadSilently();
    } catch (e) { Alert.alert(d.common.error, errMsg(e)); }
    finally { setBusy(false); }
  }

  async function toggle(s: StaffItem) {
    const run = async () => {
      try {
        await api('/api/mobile/staff', { method: 'PATCH', body: { userId: s.id, active: !s.active } });
        res.reloadSilently();
      } catch (e) { Alert.alert(d.common.error, errMsg(e)); }
    };
    if (!s.active) { await run(); return; }
    Alert.alert(b.staffBlock, tr(b.staffBlockQ, { name: s.name }), [
      { text: d.common.cancel, style: 'cancel' },
      { text: b.staffBlock, style: 'destructive', onPress: () => { void run(); } },
    ]);
  }

  const branchLabel = (x: { name: string; isMain: boolean }) => (x.isMain ? `${x.name} · ${b.main}` : x.name);
  const items = data?.items ?? [];
  return (
    <>
      <Text style={{ color: c.ink3, fontSize: 13, lineHeight: 18, paddingHorizontal: 4 }}>{b.staffExplain}</Text>
      {open && data ? (
        <View style={{ gap: 12 }}>
          {atLimit ? <InlineError message={b.staffLimitReached} /> : null}
          <Field label={b.staffName} value={fullName} onChangeText={setFullName} placeholder={b.staffNamePlaceholder} error={tried ? err.name : null} />
          <FormCard title={b.staffBranch}>
            <Chips options={branches.map((x) => ({ key: x.id, label: branchLabel(x) }))} value={pickedBranch} onChange={setBranchId} />
          </FormCard>
          {tried && err.branch ? <InlineError message={err.branch} /> : null}
          <FormCard title={b.staffRole}>
            <Chips options={[{ key: '', label: b.staffNoRole }, ...(data.roles ?? []).map((r) => ({ key: r.id, label: r.name }))]} value={roleId} onChange={setRoleId} />
          </FormCard>
          <Field label={d.common.login} value={username} onChangeText={setUsername} placeholder={b.staffLoginPlaceholder} autoCapitalize="none" autoCorrect={false} error={tried ? err.username : null} />
          <Field label={d.common.password} value={password} onChangeText={setPassword} placeholder={b.passPlaceholder} secureTextEntry error={tried ? err.password : null} />
          <Button title={b.staffCreate} full loading={busy} disabled={atLimit} onPress={create} />
        </View>
      ) : null}

      {res.loading && !data ? <Loading />
        : !data ? <ErrorState message={res.error} onRetry={res.retry} />
        : items.length === 0 ? <EmptyState icon="people-outline" title={b.staffEmpty} actionTitle={b.staffCreate} onAction={() => setOpen(true)} />
        : (
          <>
            {res.error ? <InlineError message={res.error} onRetry={res.refresh} /> : null}
            <Group footer={tr(b.staffLimit, { used: data.limit.used, max: data.limit.max })}>
              {items.map((s) => (
                <Cell
                  key={s.id}
                  icon="person"
                  iconColor={s.active ? c.sq.g : c.sq.b}
                  title={s.name}
                  subtitle={[`@${s.username}`, s.branchName, s.roleName].filter(Boolean).join(' · ')}
                  right={<Pill label={s.active ? b.staffActive : b.staffOff} tone={s.active ? 'ok' : 'bad'} />}
                  onPress={() => {
                    Alert.alert(s.name, `@${s.username}`, [
                      { text: d.common.close, style: 'cancel' },
                      { text: s.active ? b.staffBlock : b.staffUnblock, style: s.active ? 'destructive' : 'default', onPress: () => { void toggle(s); } },
                    ]);
                  }}
                />
              ))}
            </Group>
          </>
        )}
    </>
  );
}
