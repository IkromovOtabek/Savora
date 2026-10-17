import { useState } from 'react';
import { View, Alert } from 'react-native';
import { api, errMsg } from '@/lib/api';
import { useResource } from '@/lib/hooks';
import { useTheme } from '@/lib/theme';
import { fmtDate } from '@/lib/format';
import { useDict, tr } from '@/lib/i18n';
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

/** Muhimlik rangi va lug'at kaliti (server 'yuqori' | "o'rta" | 'past' qaytaradi) */
const PRIORITY: Record<Task['priority'], { key: 'high' | 'mid' | 'low'; tone: Tone }> = {
  yuqori: { key: 'high', tone: 'bad' },
  "o'rta": { key: 'mid', tone: 'warn' },
  past: { key: 'low', tone: 'mut' },
};

export default function Tasks() {
  const { c } = useTheme();
  const d = useDict();
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
      Alert.alert(d.common.error, errMsg(e));
    } finally {
      setBusyId(null);
    }
  }

  const data = res.data;
  const list = data ? data.items.filter((t) => t.status === status) : [];
  const roleLabels: Record<string, string> = d.tasks.roles;

  return (
    <Screen header={<NavBar />} refreshing={res.refreshing} onRefresh={res.refresh}>
      <LargeTitle
        title={d.tasks.title}
        subtitle={data ? `${tr(d.tasks.open, { n: data.counts.todo + data.counts.doing })}${data.items.some((t) => t.overdue) ? tr(d.tasks.overdueCount, { n: data.items.filter((t) => t.overdue).length }) : ''}` : undefined}
      />
      <Chips<View_>
        options={[{ key: 'mine', label: d.tasks.mine }, { key: 'branch', label: d.tasks.branch }, { key: 'all', label: d.common.all }]}
        value={view}
        onChange={setView}
      />
      <SegmentedControl<Status>
        options={(['todo', 'doing', 'done'] as Status[]).map((s) => ({ key: s, label: `${d.tasks.status[s]}${data ? ` · ${data.counts[s]}` : ''}` }))}
        value={status}
        onChange={setStatus}
      />

      {res.loading && !data ? <Loading /> : !data ? <ErrorState message={res.error} onRetry={res.retry} /> : (
        <>
          {res.error ? <InlineError message={res.error} onRetry={res.refresh} /> : null}
          {list.length === 0 ? (
            <EmptyState icon="checkmark-done-outline" title={d.tasks.empty} message={status === 'done' ? d.tasks.emptyDone : d.tasks.emptyOther} />
          ) : (
            <Group>
              {list.map((t) => {
                const pr = PRIORITY[t.priority] ?? PRIORITY["o'rta"];
                const meta = [
                  t.dueDate ? tr(d.tasks.due, { v: fmtDate(t.dueDate) }) : null,
                  t.assignee,
                  t.branch,
                  t.role ? roleLabels[t.role] ?? null : null,
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
                      <Pill label={d.tasks.priority[pr.key]} tone={pr.tone} />
                      {t.overdue ? <Pill label={d.tasks.late} tone="bad" /> : null}
                      {t.source === 'ai' ? <Pill label="AI" tone="br" /> : null}
                      <View style={{ flex: 1 }} />
                      {t.status === 'todo' ? (
                        <Button title={d.tasks.start} size="sm" variant="gray" disabled={busyId === t.id} onPress={() => setTaskStatus(t, 'doing')} />
                      ) : null}
                      {t.status !== 'done' ? (
                        <Button title={d.tasks.done} icon="checkmark" size="sm" variant="tinted" loading={busyId === t.id} onPress={() => setTaskStatus(t, 'done')} />
                      ) : (
                        <Button title={d.tasks.reopen} size="sm" variant="gray" loading={busyId === t.id} onPress={() => setTaskStatus(t, 'todo')} />
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
