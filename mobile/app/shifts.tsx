import { useState } from 'react';
import { View, Alert } from 'react-native';
import { api, errMsg } from '@/lib/api';
import { useResource } from '@/lib/hooks';
import { useTheme } from '@/lib/theme';
import { fmtMoney, fmtDateTime, digits, grouped } from '@/lib/format';
import { useDict, tr } from '@/lib/i18n';
import {
  Screen, NavBar, LargeTitle, Group, Cell, Field, Button, Loading, ErrorState, InlineError, EmptyState,
} from '@/components/ui';

interface OpenShift {
  id: string; shiftNo: string; branch: string; openedAt: string; openedBy: string; openingCash: number;
  cashIn: number; refunds: number; withdrawals: number; deposits: number; current: number;
}
interface ClosedShift {
  id: string; shiftNo: string; branch: string; closedAt: string; closedBy?: string;
  expectedCash: number; countedCash: number; difference: number;
}
interface Data { canShift: boolean; freeBranches: { id: string; name: string }[]; open: OpenShift[]; closed: ClosedShift[] }

type Kind = 'deposit' | 'withdraw' | 'close';

/** Kassa smenalari — web /app/shifts bilan bir xil: ochish, kassa operatsiyalari, yopish */
export default function Shifts() {
  const { c } = useTheme();
  const d = useDict();
  const k = d.shifts;
  const res = useResource<Data>('/api/mobile/shifts');
  const [branchId, setBranchId] = useState<string | null>(null);
  const [opening, setOpening] = useState('');
  const [active, setActive] = useState<{ id: string; kind: Kind } | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  // Qaysi tugma kutyapti: 'open' yoki smena id'si
  const [busy, setBusy] = useState<string | null>(null);
  const [tried, setTried] = useState(false);

  async function send(key: string, body: Record<string, unknown>) {
    if (busy) return;
    setBusy(key);
    try {
      const r = await api<{ message: string }>('/api/mobile/shifts', { method: 'POST', body });
      setActive(null); setAmount(''); setNote(''); setOpening(''); setTried(false);
      res.reloadSilently();
      if (r?.message) Alert.alert(r.message);
    } catch (e) { Alert.alert(d.common.error, errMsg(e)); }
    finally { setBusy(null); }
  }

  function toggle(id: string, kind: Kind) {
    setActive((cur) => (cur?.id === id && cur.kind === kind ? null : { id, kind }));
    setAmount(''); setNote(''); setTried(false);
  }

  const data = res.data;
  const free = data?.freeBranches ?? [];
  const selBranch = branchId && free.some((b) => b.id === branchId) ? branchId : free[0]?.id ?? null;
  const amountN = Number(digits(amount)) || 0;

  function submitOp(s: OpenShift) {
    setTried(true);
    if (!active) return;
    if (active.kind === 'close') {
      if (!amount) return;
      send(s.id, { op: 'close', shiftId: s.id, countedCash: amountN, note: note.trim() || undefined });
    } else {
      if (!amountN) return;
      send(s.id, { op: 'cash', shiftId: s.id, type: active.kind === 'deposit' ? 'income' : 'expense', amount: amountN, note: note.trim() || undefined });
    }
  }

  const diffLabel = (n: number) => (n === 0 ? k.diffOk : tr(n < 0 ? k.shortage : k.surplus, { v: fmtMoney(Math.abs(n)) }));

  return (
    <Screen keyboard header={<NavBar />} refreshing={res.refreshing} onRefresh={res.refresh}>
      <LargeTitle title={k.title} />
      {res.loading && !data ? <Loading /> : !data ? <ErrorState message={res.error} onRetry={res.retry} /> : (
        <>
          {res.error ? <InlineError message={res.error} onRetry={res.refresh} /> : null}

          {data.open.length === 0 ? <EmptyState icon="time-outline" title={k.none} message={k.noneHint} /> : null}

          {data.open.map((s) => {
            const op = active?.id === s.id ? active.kind : null;
            return (
              <View key={s.id} style={{ gap: 10 }}>
                <Group header={`${s.shiftNo} · ${s.branch}`} footer={tr(k.since, { t: fmtDateTime(s.openedAt) }) + ` · ${s.openedBy}`}>
                  <Cell title={k.opening} value={fmtMoney(s.openingCash)} />
                  <Cell title={k.cashIn} value={`+${fmtMoney(s.cashIn)}`} valueColor={c.ok} />
                  {s.refunds ? <Cell title={k.refunds} value={`−${fmtMoney(s.refunds)}`} valueColor={c.bad} /> : null}
                  {s.deposits ? <Cell title={k.deposits} value={`+${fmtMoney(s.deposits)}`} valueColor={c.ok} /> : null}
                  {s.withdrawals ? <Cell title={k.withdrawals} value={`−${fmtMoney(s.withdrawals)}`} valueColor={c.bad} /> : null}
                  <Cell title={k.current} value={fmtMoney(s.current, { suffix: true })} valueStrong />
                </Group>

                {data.canShift ? (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Button title={k.deposit} icon="add" size="sm" variant={op === 'deposit' ? 'filled' : 'tinted'} style={{ flex: 1 }} onPress={() => toggle(s.id, 'deposit')} />
                    <Button title={k.withdraw} icon="remove" size="sm" variant={op === 'withdraw' ? 'filled' : 'tinted'} style={{ flex: 1 }} onPress={() => toggle(s.id, 'withdraw')} />
                    <Button title={k.close} icon="lock-closed" size="sm" variant={op === 'close' ? 'destructive' : 'gray'} style={{ flex: 1 }} onPress={() => toggle(s.id, 'close')} />
                  </View>
                ) : null}

                {op ? (
                  <View style={{ gap: 12 }}>
                    <Field
                      label={op === 'close' ? k.counted : k.amount}
                      value={grouped(amount)}
                      onChangeText={(v) => setAmount(digits(v))}
                      placeholder="0"
                      keyboardType="numeric"
                      suffix={d.format.currency}
                      hint={op === 'close' ? tr(k.countedHint, { v: fmtMoney(s.current) }) : undefined}
                      error={tried && (op === 'close' ? !amount : !amountN) ? k.amountErr : null}
                      autoFocus
                    />
                    <Field label={k.note} value={note} onChangeText={setNote} maxLength={300} />
                    <Button
                      title={op === 'close' ? k.closeBtn : k.save}
                      variant={op === 'close' ? 'destructive' : 'filled'}
                      full
                      loading={busy === s.id}
                      onPress={() => submitOp(s)}
                    />
                  </View>
                ) : null}
              </View>
            );
          })}

          {!data.canShift ? (
            <Group footer={k.noPerm}><Cell icon="lock-closed" iconColor={c.sq.r} title={k.openTitle} disabled /></Group>
          ) : free.length === 0 ? (
            data.open.length > 0 ? <Group footer={k.allOpen}><Cell icon="checkmark-circle" iconColor={c.sq.g} title={k.openTitle} disabled /></Group> : null
          ) : (
            <View style={{ gap: 12 }}>
              <Group header={k.openTitle}>
                {free.map((b) => (
                  <Cell key={b.id} icon="business" iconColor={c.sq.b} title={b.name} checked={b.id === selBranch} onPress={() => setBranchId(b.id)} />
                ))}
              </Group>
              <Field
                label={k.openingCash}
                value={grouped(opening)}
                onChangeText={(v) => setOpening(digits(v))}
                placeholder="0"
                keyboardType="numeric"
                suffix={d.format.currency}
                hint={k.openingHint}
              />
              <Button
                title={k.openBtn}
                icon="lock-open"
                full
                loading={busy === 'open'}
                onPress={() => selBranch && send('open', { op: 'open', branchId: selBranch, openingCash: Number(digits(opening)) || 0 })}
              />
            </View>
          )}

          <Group header={k.history}>
            {data.closed.length === 0 ? <Cell title={k.emptyHistory} disabled /> : data.closed.map((s) => (
              <Cell
                key={s.id}
                icon="receipt-outline"
                iconColor={c.sq.a}
                title={`${s.shiftNo} · ${s.branch}`}
                subtitle={[fmtDateTime(s.closedAt), s.closedBy].filter(Boolean).join(' · ')}
                value={diffLabel(s.difference)}
                valueColor={s.difference < 0 ? c.bad : s.difference > 0 ? c.ok : undefined}
              />
            ))}
          </Group>
        </>
      )}
    </Screen>
  );
}
