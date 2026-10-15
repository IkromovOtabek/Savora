import { useState } from 'react';
import { View, Alert } from 'react-native';
import { api, errMsg } from '@/lib/api';
import { useResource } from '@/lib/hooks';
import { useTheme } from '@/lib/theme';
import { fmtDate } from '@/lib/format';
import {
  Screen, NavBar, LargeTitle, Group, Cell, SegmentedControl, Chips, Pill, Button, Loading, ErrorState, InlineError, EmptyState,
  type Tone,
} from '@/components/ui';

type Status = 'todo' | 'doing' | 'done';
type View_ = 'mine' | 'branch' | 'all';

interface Task {
  id: string;
  title: string;
  detail: string | null;
  status: Status;
  priority: 'yuqori' | "o'rta" | 'past';
  role: string | null;
  source: 'ai' | 'manual';
  dueDate: string | null;
  overdue: boolean;
  assignee: string | null;
  mine: boolean;
  branch: string | null;
}
interface Data { items: Task[]; counts: Record<Status, number>; canManage: boolean }

const STATUS_LABEL: Record<Status, string> = { todo: 'Bajarish kerak', doing: 'Jarayonda', done: 'Bajarildi' };
const PRIORITY: Record<Task['priority'], { label: string; tone: Tone }> = {
  yuqori: { label: 'Yuqori', tone: 'bad' },
  "o'rta": { label: "O'rta", tone: 'warn' },
  past: { label: 'Past', tone: 'mut' },
};
const ROLE: Record<string, string> = { owner: 'Egasi', director: 'Filial rahbari', seller: 'Sotuvchi', cashier: 'Kassir' };

export default function Tasks() {
  const { c } = useTheme();
  const [view, setView] = useState<View_>('all');
  const [status, setStatus] = useState<Status>('todo');
  const [busyId, setBusyId] = useState<string | null>(null);
  const res = useResource<Data>(`/api/mobile/tasks?f=${view}`);

  async function setTaskStatus(t: Task, next: Status) {
    setBusyId(t.id);
    try {
      await api(`/api/mobile/tasks/${t.id}`, { method: 'PATCH', body: { status: next } });
      res.setData((d) => {
        if (!d) return d;
        const items = d.items.map((x) => (x.id === t.id ? { ...x, status: next, overdue: next === 'done' ? false : x.overdue } : x));
        const counts = { todo: 0, doing: 0, done: 0 } as Record<Status, number>;
        for (const x of items) counts[x.status] += 1;
        return { ...d, items, counts };
      });
    } catch (e) {
      Alert.alert('Xatolik', errMsg(e));
    } finally {
      setBusyId(null);
    }
  }

  const d = res.data;
  const list = d ? d.items.filter((t) => t.status === status) : [];

  return (
    <Screen header={<NavBar />} refreshing={res.refreshing} onRefresh={res.refresh}>
      <LargeTitle
        title="Topshiriqlar"
        subtitle={d ? `${d.counts.todo + d.counts.doing} ta ochiq${d.items.some((t) => t.overdue) ? ` · ${d.items.filter((t) => t.overdue).length} ta kechikkan` : ''}` : undefined}
      />
      <Chips<View_>
        options={[{ key: 'mine', label: 'Mening' }, { key: 'branch', label: 'Filial' }, { key: 'all', label: 'Hammasi' }]}
        value={view}
        onChange={setView}
      />
      <SegmentedControl<Status>
        options={(['todo', 'doing', 'done'] as Status[]).map((s) => ({ key: s, label: `${STATUS_LABEL[s]}${d ? ` · ${d.counts[s]}` : ''}` }))}
        value={status}
        onChange={setStatus}
      />

      {res.loading && !d ? <Loading /> : !d ? <ErrorState message={res.error} onRetry={res.retry} /> : (
        <>
          {res.error ? <InlineError message={res.error} onRetry={res.refresh} /> : null}
          {list.length === 0 ? (
            <EmptyState icon="checkmark-done-outline" title="Topshiriq yo'q" message={status === 'done' ? 'Bajarilgan topshiriqlar shu yerda ko\'rinadi.' : 'Bu holatda topshiriq yo\'q.'} />
          ) : (
            <Group>
              {list.map((t) => {
                const pr = PRIORITY[t.priority] ?? PRIORITY["o'rta"];
                const meta = [
                  t.dueDate ? `Muddat: ${fmtDate(t.dueDate)}` : null,
                  t.assignee,
                  t.branch,
                  t.role ? ROLE[t.role] ?? null : null,
                ].filter(Boolean).join(' · ');
                return (
                  <Cell
                    key={t.id}
                    icon={t.status === 'done' ? 'checkmark-circle' : t.overdue ? 'alert-circle' : t.source === 'ai' ? 'sparkles' : 'ellipse-outline'}
                    iconColor={t.status === 'done' ? c.sq.o : t.overdue ? c.sq.r : c.sq.b}
                    title={t.title}
                    titleLines={2}
                    subtitle={[t.detail, meta].filter(Boolean).join('\n') || undefined}
                    subtitleLines={4}
                  >
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 8 }}>
                      <Pill label={pr.label} tone={pr.tone} />
                      {t.overdue ? <Pill label="Kechikdi" tone="bad" /> : null}
                      {t.source === 'ai' ? <Pill label="AI" tone="br" /> : null}
                      <View style={{ flex: 1 }} />
                      {t.status === 'todo' ? (
                        <Button title="Boshlash" size="sm" variant="gray" disabled={busyId === t.id} onPress={() => setTaskStatus(t, 'doing')} />
                      ) : null}
                      {t.status !== 'done' ? (
                        <Button title="Bajarildi" icon="checkmark" size="sm" variant="tinted" loading={busyId === t.id} onPress={() => setTaskStatus(t, 'done')} />
                      ) : (
                        <Button title="Qayta ochish" size="sm" variant="gray" loading={busyId === t.id} onPress={() => setTaskStatus(t, 'todo')} />
                      )}
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
