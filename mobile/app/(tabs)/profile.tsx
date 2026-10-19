import { Alert, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useAuth, useCan } from '@/lib/auth';
import { useTheme, type ThemeMode } from '@/lib/theme';
import { useResource } from '@/lib/hooks';
import { fmtDate } from '@/lib/format';
import { useI18n, tr, type Locale, LOCALES, LOCALE_SHORT } from '@/lib/i18n';
import { Screen, TopBar, Group, Cell, Avatar, Pill, SegmentedControl, Card, type Tone } from '@/components/ui';

interface AiResp {
  report: null | {
    source: 'ai' | 'rules';
    createdAt: string;
    health: 'yaxshi' | "o'rta" | 'xavfli';
    summary: string;
    recommendations: { title: string; detail: string; priority: string }[];
  };
}
const HEALTH_TONE: Record<string, Tone> = { yaxshi: 'ok', "o'rta": 'warn', xavfli: 'bad' };

/** AI yordamchi — faqat keshdagi oxirgi hisobot (mobil yangi tahlil boshlamaydi) */
function AiCard() {
  const { c } = useTheme();
  const { d } = useI18n();
  const res = useResource<AiResp>('/api/mobile/ai');
  const r = res.data?.report;
  if (res.loading || res.error || !r) {
    if (res.loading || res.error) return null;
    return (
      <Group header={d.profile.aiHeader} icon="sparkles-outline" footer={d.profile.aiFooter}>
        <Cell icon="sparkles" iconColor={c.sq.b} title={d.profile.aiNone} />
      </Group>
    );
  }
  const healthLabel = { yaxshi: d.profile.healthGood, "o'rta": d.profile.healthMid, xavfli: d.profile.healthBad }[r.health] ?? d.profile.healthMid;
  const h = { label: healthLabel, tone: HEALTH_TONE[r.health] ?? 'warn' };
  const top = r.recommendations[0];
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 13, color: c.ink3, paddingHorizontal: 16 }}>{d.profile.aiUpper}</Text>
      <Card style={{ padding: 16, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ flex: 1, fontSize: 17, fontWeight: '700', color: c.ink }}>{d.profile.bizHealth}</Text>
          <Pill label={h.label} tone={h.tone} />
          <Pill label={r.source === 'ai' ? 'AI' : d.profile.rules} tone="br" />
        </View>
        <Text style={{ fontSize: 14, lineHeight: 20, color: c.ink2 }}>{r.summary}</Text>
        {top ? (
          <View style={{ gap: 2, marginTop: 4 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: c.ink3 }}>{d.profile.mainRec}</Text>
            <Text style={{ fontSize: 15, fontWeight: '600', color: c.ink }}>{top.title}</Text>
            <Text style={{ fontSize: 14, lineHeight: 20, color: c.ink2 }} numberOfLines={4}>{top.detail}</Text>
          </View>
        ) : null}
        <Text style={{ fontSize: 12, color: c.ink3 }}>{tr(d.profile.updated, { v: fmtDate(r.createdAt) })}</Text>
      </Card>
    </View>
  );
}

export default function Profile() {
  const { me, logout } = useAuth();
  const { c, mode, setMode } = useTheme();
  const { d, locale, setLocale } = useI18n();
  const router = useRouter();
  const t = me?.terms;
  const f = me?.features ?? {};
  const can = useCan();
  const isAdmin = !!me?.user.isAdmin;
  const org = me?.org;

  function onLogout() {
    Alert.alert(d.profile.logout, d.profile.logoutMsg, [
      { text: d.common.cancel, style: 'cancel' },
      { text: d.profile.logout, style: 'destructive', onPress: async () => { await logout(); router.replace('/login'); } },
    ]);
  }

  const sub = !org ? null
    : !org.active ? { label: d.profile.expired, tone: 'bad' as const }
    : org.isTrial ? { label: tr(d.profile.trial, { n: org.daysLeft }), tone: 'warn' as const }
    : { label: tr(d.profile.active, { n: org.daysLeft }), tone: 'ok' as const };

  return (
    <Screen bar={<TopBar title={d.profile.title} profile={false} />}>

      <Group>
        <Cell
          left={<Avatar name={me?.user.username} size={52} tone="b" />}
          title={me?.user.username ?? '—'}
          subtitle={`${isAdmin ? d.profile.owner : d.profile.staff} · ${org?.name ?? ''}`}
          style={{ minHeight: 72 }}
        />
      </Group>

      <Group header={d.common.info} icon="information-circle-outline">
        <Cell icon="storefront" iconColor={c.sq.b} title={d.profile.shop} value={org?.name || '—'} />
        <Cell icon="pricetags" iconColor={c.sq.a} title={d.profile.direction} value={org?.businessTypeLabel || '—'} />
        <Cell icon="card" iconColor={c.sq.o} title={d.profile.subscription} right={sub ? <Pill label={sub.label} tone={sub.tone} /> : undefined} />
      </Group>

      {f.ai && can('ai.view') ? <AiCard /> : null}

      <Group header={d.profile.appearance} icon="color-palette-outline" footer={d.profile.appearanceFooter}>
        <View style={{ padding: 12 }}>
          <SegmentedControl<ThemeMode>
            options={[{ key: 'system', label: d.profile.system }, { key: 'light', label: d.profile.light }, { key: 'dark', label: d.profile.dark }, { key: 'black', label: d.profile.black }]}
            value={mode}
            onChange={setMode}
          />
        </View>
      </Group>

      <Group header={d.profile.language} icon="language-outline" footer={d.profile.languageFooter}>
        <View style={{ padding: 12 }}>
          <SegmentedControl<Locale>
            options={LOCALES.map((l) => ({ key: l, label: LOCALE_SHORT[l] }))}
            value={locale}
            onChange={setLocale}
          />
        </View>
      </Group>

      {/* Amallar — web menyusi kabi bo'limlarga guruhlangan (BILLZ) */}
      <Group header={d.profile.secProducts} icon="cube-outline">
        {can('product.create') ? <Cell icon="add-circle" iconColor={c.sq.b} title={t?.addItem ?? d.terms.addItem} chevron onPress={() => router.push('/product-new')} /> : null}
        <Cell icon="barcode" iconColor={c.sq.o} title={d.common.barcodeScanner} chevron onPress={() => router.push('/scan')} />
        {f.transferred && can('transfer.create') ? <Cell icon="swap-horizontal" iconColor={c.sq.g} title={d.profile.transfer} chevron onPress={() => router.push('/transfer')} /> : null}
      </Group>

      <Group header={d.profile.secSales} icon="cart-outline">
        <Cell icon="receipt" iconColor={c.sq.b} title={d.profile.sales} chevron onPress={() => router.push('/(tabs)/sales')} />
        {f.kassa && can('kassa.view') ? <Cell icon="time" iconColor={c.sq.o} title={d.profile.shifts} chevron onPress={() => router.push('/shifts')} /> : null}
      </Group>

      {f.kirimChiqim && isAdmin ? (
        <Group header={d.profile.secFinance} icon="wallet-outline">
          <Cell icon="cash" iconColor={c.sq.o} title={d.profile.kirimChiqim} chevron onPress={() => router.push('/kirim-chiqim')} />
        </Group>
      ) : null}

      {f.tasks || isAdmin ? (
        <Group header={d.profile.secManage} icon="settings-outline">
          {f.tasks ? <Cell icon="checkmark-done" iconColor={c.sq.o} title={d.profile.tasks} chevron onPress={() => router.push('/tasks')} /> : null}
          {f.users && isAdmin ? <Cell icon="business" iconColor={c.sq.b} title={d.profile.branches} chevron onPress={() => router.push('/branches')} /> : null}
          {isAdmin ? <Cell icon="briefcase" iconColor={c.sq.a} title={d.profile.businessType} value={org?.businessTypeLabel} chevron onPress={() => router.push('/business-type')} /> : null}
        </Group>
      ) : null}

      <Group footer={`Savora Mobile v${Constants.expoConfig?.version ?? '1.0.0'}`}>
        <Cell icon="log-out" iconColor={c.sq.r} title={d.profile.logout} destructive onPress={onLogout} />
        {/* App Store 5.1.1(v): ilovada hisob ochish bor — o'chirish ham bo'lishi shart (faqat do'kon egasi) */}
        {isAdmin ? <Cell icon="trash" iconColor={c.sq.r} title={d.profile.deleteAccount} destructive chevron onPress={() => router.push('/delete-account')} /> : null}
      </Group>
    </Screen>
  );
}
