import { useCallback, useRef, useState } from 'react';
import { View, Alert, Linking } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { api, errMsg } from '@/lib/api';
import { useResource } from '@/lib/hooks';
import { useTheme } from '@/lib/theme';
import { fmtMoney, fmtCompact, fmtDate, fmtPhoneLocal, startOfToday } from '@/lib/format';
import { useDict, tr } from '@/lib/i18n';
import {
  Screen, NavBar, LargeTitle, Group, Cell, StatCard, SegmentedControl, Chips, Pill, Button, IconButton,
  Loading, ErrorState, InlineError, EmptyState, type Tone,
} from '@/components/ui';

type Kind = 'given' | 'taken';
interface Entry {
  id: string;
  type: Kind;
  personName: string;
  personPhone: string;
  amount: number;
  dueDate: string;
  note: string | null;
  status: 'open' | 'returned';
  returnedAt: string | null;
}
interface Data { givenSum: number; takenSum: number; balance: number; overdue: number; items: Entry[] }

const DAY = 24 * 60 * 60 * 1000;

/** Daftar — shaxsiy qarz oldi-berdi (web /app/daftar bilan bir xil ma'lumot) */
export default function Daftar() {
  const { c } = useTheme();
  const d = useDict();
  const k = d.daftar;
  const router = useRouter();
  const res = useResource<Data>('/api/mobile/daftar');
  const [tab, setTab] = useState<'open' | 'returned'>('open');
  const [kind, setKind] = useState<'all' | Kind>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  // Yangi yozuv ekranidan qaytganda ro'yxat yangilanadi (birinchi ochilishda — yo'q)
  const first = useRef(true);
  const { reloadSilently } = res;
  useFocusEffect(useCallback(() => {
    if (first.current) { first.current = false; return; }
    reloadSilently();
  }, [reloadSilently]));

  /** Qaytarish kunigacha qolgan kun (manfiy — kechikkan) */
  const daysLeft = (iso: string) => {
    const x = new Date(iso); x.setHours(0, 0, 0, 0);
    return Math.round((x.getTime() - startOfToday()) / DAY);
  };
  function dueInfo(e: Entry): { label: string; tone: Tone } {
    const n = daysLeft(e.dueDate);
    if (n < 0) return { label: tr(k.late, { n: -n }), tone: 'bad' };
    if (n === 0) return { label: k.today, tone: 'warn' };
    if (n <= 3) return { label: tr(k.left, { n }), tone: 'warn' };
    return { label: tr(k.dueOn, { date: fmtDate(e.dueDate) }), tone: 'mut' };
  }

  async function setStatus(e: Entry, status: Entry['status']) {
    setBusyId(e.id);
    try {
      await api(`/api/mobile/daftar/${e.id}`, { method: 'PATCH', body: { status } });
      res.reloadSilently();
    } catch (err) { Alert.alert(d.common.error, errMsg(err)); }
    finally { setBusyId(null); }
  }

  function remove(e: Entry) {
    Alert.alert(k.remove, tr(k.removeConfirm, { name: e.personName }), [
      { text: d.common.cancel, style: 'cancel' },
      {
        text: k.remove, style: 'destructive',
        onPress: async () => {
          setBusyId(e.id);
          try {
            await api(`/api/mobile/daftar/${e.id}`, { method: 'DELETE' });
            res.setData((prev) => (prev ? { ...prev, items: prev.items.filter((x) => x.id !== e.id) } : prev));
            res.reloadSilently();
          } catch (err) { Alert.alert(d.common.error, errMsg(err)); }
          finally { setBusyId(null); }
        },
      },
    ]);
  }

  const data = res.data;
  const list = data ? data.items.filter((e) => e.status === tab && (kind === 'all' || e.type === kind)) : [];
  const counts = data ? { open: data.items.filter((e) => e.status === 'open').length, returned: data.items.filter((e) => e.status === 'returned').length } : null;

  return (
    <Screen
      header={<NavBar right={<IconButton icon="add" label={k.add} onPress={() => router.push('/daftar-new')} />} />}
      refreshing={res.refreshing}
      onRefresh={res.refresh}
    >
      <LargeTitle title={k.title} subtitle={`${k.subtitle}${data && data.overdue > 0 ? tr(k.overdueCount, { n: data.overdue }) : ''}`} />
      {res.loading && !data ? <Loading /> : !data ? <ErrorState message={res.error} onRetry={res.retry} /> : (
        <>
          {res.error ? <InlineError message={res.error} onRetry={res.refresh} /> : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <StatCard label={k.given} value={fmtCompact(data.givenSum)} color={c.ok} />
            <StatCard label={k.taken} value={fmtCompact(data.takenSum)} color={c.bad} />
            <StatCard label={k.balance} value={fmtCompact(data.balance)} color={data.balance >= 0 ? c.tint : c.bad} />
          </View>

          <SegmentedControl<'open' | 'returned'>
            options={[
              { key: 'open', label: `${k.open}${counts ? ` · ${counts.open}` : ''}` },
              { key: 'returned', label: `${k.returned}${counts ? ` · ${counts.returned}` : ''}` },
            ]}
            value={tab}
            onChange={setTab}
          />
          <Chips<'all' | Kind>
            options={[{ key: 'all', label: d.common.all }, { key: 'given', label: k.given }, { key: 'taken', label: k.taken }]}
            value={kind}
            onChange={setKind}
          />

          {list.length === 0 ? (
            tab === 'open'
              ? <EmptyState icon="book-outline" title={k.empty} message={k.emptyHint} actionTitle={k.add} onAction={() => router.push('/daftar-new')} />
              : <EmptyState icon="book-outline" title={k.emptyReturned} />
          ) : (
            <Group>
              {list.map((e) => {
                const due = dueInfo(e);
                const given = e.type === 'given';
                return (
                  <Cell
                    key={e.id}
                    icon={given ? 'arrow-up' : 'arrow-down'}
                    iconColor={given ? c.sq.o : c.sq.r}
                    title={e.personName}
                    subtitle={[`+998 ${fmtPhoneLocal(e.personPhone)}`, e.note].filter(Boolean).join(' · ')}
                    subtitleLines={2}
                    value={`${given ? '+' : '−'}${fmtMoney(e.amount)}`}
                    valueColor={given ? c.ok : c.bad}
                    valueStrong
                  >
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 8 }}>
                      {e.status === 'open'
                        ? <Pill label={due.label} tone={due.tone} />
                        : <Pill label={tr(k.returnedOn, { date: fmtDate(e.returnedAt) })} tone="ok" />}
                      <View style={{ flex: 1 }} />
                      <Button title={k.call} icon="call" size="sm" variant="gray" onPress={() => Linking.openURL(`tel:+${e.personPhone}`)} />
                      {e.status === 'open' ? (
                        <Button title={k.markReturned} icon="checkmark" size="sm" variant="tinted" loading={busyId === e.id} onPress={() => setStatus(e, 'returned')} />
                      ) : (
                        <Button title={k.reopen} size="sm" variant="gray" loading={busyId === e.id} onPress={() => setStatus(e, 'open')} />
                      )}
                      <Button title="" icon="trash" size="sm" variant="destructive" accessibilityLabel={k.remove} disabled={busyId === e.id} onPress={() => remove(e)} />
                    </View>
                  </Cell>
                );
              })}
            </Group>
          )}
        </>
      )}
    </Screen>
  );
}
