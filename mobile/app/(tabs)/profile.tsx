import { Alert, View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useAuth, useCan } from '@/lib/auth';
import { useTheme, type ThemeMode } from '@/lib/theme';
import { useResource } from '@/lib/hooks';
import { fmtDate } from '@/lib/format';
import { Screen, LargeTitle, Group, Cell, Avatar, Pill, SegmentedControl, Card, type Tone } from '@/components/ui';

interface AiResp {
  report: null | {
    source: 'ai' | 'rules';
    createdAt: string;
    health: 'yaxshi' | "o'rta" | 'xavfli';
    summary: string;
    recommendations: { title: string; detail: string; priority: string }[];
  };
}
const HEALTH: Record<string, { label: string; tone: Tone }> = {
  yaxshi: { label: 'Yaxshi', tone: 'ok' },
  "o'rta": { label: "O'rta", tone: 'warn' },
  xavfli: { label: 'Xavfli', tone: 'bad' },
};

/** AI yordamchi — faqat keshdagi oxirgi hisobot (mobil yangi tahlil boshlamaydi) */
function AiCard() {
  const { c } = useTheme();
  const res = useResource<AiResp>('/api/mobile/ai');
  const r = res.data?.report;
  if (res.loading || res.error || !r) {
    if (res.loading || res.error) return null;
    return (
      <Group header="AI yordamchi" footer="Tahlil web'dagi «AI yordamchi» bo'limida bir marta ochilganda tayyorlanadi.">
        <Cell icon="sparkles" iconColor={c.sq.b} title="Bugun hali tahlil yo'q" />
      </Group>
    );
  }
  const h = HEALTH[r.health] ?? HEALTH["o'rta"];
  const top = r.recommendations[0];
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 13, color: c.ink3, paddingHorizontal: 16 }}>AI YORDAMCHI</Text>
      <Card style={{ padding: 16, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ flex: 1, fontSize: 17, fontWeight: '700', color: c.ink }}>Biznes holati</Text>
          <Pill label={h.label} tone={h.tone} />
          <Pill label={r.source === 'ai' ? 'AI' : 'Qoidalar'} tone="br" />
        </View>
        <Text style={{ fontSize: 14, lineHeight: 20, color: c.ink2 }}>{r.summary}</Text>
        {top ? (
          <View style={{ gap: 2, marginTop: 4 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: c.ink3 }}>ASOSIY TAVSIYA</Text>
            <Text style={{ fontSize: 15, fontWeight: '600', color: c.ink }}>{top.title}</Text>
            <Text style={{ fontSize: 14, lineHeight: 20, color: c.ink2 }} numberOfLines={4}>{top.detail}</Text>
          </View>
        ) : null}
        <Text style={{ fontSize: 12, color: c.ink3 }}>Yangilandi: {fmtDate(r.createdAt)}</Text>
      </Card>
    </View>
  );
}

export default function Profile() {
  const { me, logout } = useAuth();
  const { c, mode, setMode } = useTheme();
  const router = useRouter();
  const t = me?.terms;
  const f = me?.features ?? {};
  const can = useCan();
  const isAdmin = !!me?.user.isAdmin;
  const org = me?.org;

  function onLogout() {
    Alert.alert('Chiqish', 'Tizimdan chiqmoqchimisiz?', [
      { text: 'Bekor qilish', style: 'cancel' },
      { text: 'Chiqish', style: 'destructive', onPress: async () => { await logout(); router.replace('/login'); } },
    ]);
  }

  const sub = !org ? null
    : !org.active ? { label: 'Tugagan', tone: 'bad' as const }
    : org.isTrial ? { label: `Sinov · ${org.daysLeft} kun`, tone: 'warn' as const }
    : { label: `Faol · ${org.daysLeft} kun`, tone: 'ok' as const };

  return (
    <Screen>
      <LargeTitle title="Kabinet" />

      <Group>
        <Cell
          left={<Avatar name={me?.user.username} size={52} tone="b" />}
          title={me?.user.username ?? '—'}
          subtitle={`${isAdmin ? 'Biznes egasi' : 'Filial xodimi'} · ${org?.name ?? ''}`}
          style={{ minHeight: 72 }}
        />
      </Group>

      <Group header="Ma'lumot">
        <Cell icon="storefront" iconColor={c.sq.b} title="Do'kon" value={org?.name || '—'} />
        <Cell icon="pricetags" iconColor={c.sq.a} title="Yo'nalish" value={org?.businessTypeLabel || '—'} />
        <Cell icon="card" iconColor={c.sq.o} title="Obuna" right={sub ? <Pill label={sub.label} tone={sub.tone} /> : undefined} />
      </Group>

      {f.ai && can('ai.view') ? <AiCard /> : null}

      <Group header="Ko'rinish" footer="«Tizim» — telefon sozlamasiga qarab yorug' yoki qorong'i bo'ladi.">
        <View style={{ padding: 12 }}>
          <SegmentedControl<ThemeMode>
            options={[{ key: 'system', label: 'Tizim' }, { key: 'light', label: 'Yorug\'' }, { key: 'dark', label: 'Qorong\'i' }]}
            value={mode}
            onChange={setMode}
          />
        </View>
      </Group>

      <Group header="Amallar">
        {can('product.create') ? <Cell icon="add-circle" iconColor={c.sq.b} title={t?.addItem ?? 'Mahsulot qo\'shish'} chevron onPress={() => router.push('/product-new')} /> : null}
        <Cell icon="barcode" iconColor={c.sq.o} title="Shtrix kod skaner" chevron onPress={() => router.push('/scan')} />
        <Cell icon="receipt" iconColor={c.sq.b} title="Sotuvlar" chevron onPress={() => router.push('/(tabs)/sales')} />
        {f.tasks ? <Cell icon="checkmark-done" iconColor={c.sq.o} title="Topshiriqlar" chevron onPress={() => router.push('/tasks')} /> : null}
        {f.kirimChiqim && isAdmin ? <Cell icon="cash" iconColor={c.sq.o} title="Kirim-chiqim" chevron onPress={() => router.push('/kirim-chiqim')} /> : null}
        {f.users && isAdmin ? <Cell icon="business" iconColor={c.sq.b} title="Filiallar" chevron onPress={() => router.push('/branches')} /> : null}
        {f.transferred && can('transfer.create') ? <Cell icon="swap-horizontal" iconColor={c.sq.g} title="Filialga berish" chevron onPress={() => router.push('/transfer')} /> : null}
        {isAdmin ? <Cell icon="briefcase" iconColor={c.sq.a} title="Biznes yo'nalishi" value={org?.businessTypeLabel} chevron onPress={() => router.push('/business-type')} /> : null}
      </Group>

      <Group footer={`Savora Mobile v${Constants.expoConfig?.version ?? '1.0.0'}`}>
        <Cell icon="log-out" iconColor={c.sq.r} title="Chiqish" destructive onPress={onLogout} />
      </Group>
    </Screen>
  );
}
