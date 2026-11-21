import { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui';
import { useTheme, tabular } from '@/lib/theme';
import { fmtMoney, fmtCompact, fmtDayMonth } from '@/lib/format';
import { tr, useDict } from '@/lib/i18n';

interface Reason { category: string; amount: number }

/** Server `/api/mobile/kirim-chiqim/profit` javobi (web lib/monitoring.ts → ProfitReport) */
export interface ProfitData {
  month: string;
  /** Sotuv tushumi, bank ulushisiz (bank ulushi pul olingan kuni foydaga kiradi) */
  revenue: number;
  cost: number;
  bankReceived: number;
  gross: number;
  otherIncome: number;
  expense: number;
  net: number;
  byCategory: { type: 'income' | 'expense'; category: string; total: number }[];
  byBranch: { id: string | null; name: string; gross: number; income: number; expense: number; net: number; top: Reason | null }[];
  daily: { day: string; gross: number; income: number; expense: number; net: number; top: Reason | null }[];
}

/** "YYYY-MM" → keyingi/oldingi oy */
export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function currentMonth(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** "YYYY-MM-DD" — mahalliy sana (UTC siljishisiz) */
const dayDate = (k: string) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const signed = (n: number) => (n > 0 ? `+${fmtMoney(n)}` : fmtMoney(n));

/**
 * Oylik foyda hisobi: 1) foyda zinapoyasi, 2) foyda qayerga ketdi, 3) filiallar foyda/zarari, 4) kunlik grafik.
 * Faqat foydaga kiruvchi toifalar hisobga olinadi (web «Toifalar» sozlamasi).
 */
export function ProfitReport({ data, month, onMonth }: { data: ProfitData | null; month: string; onMonth: (m: string) => void }) {
  const { c } = useTheme();
  const k = useDict().kirimChiqim;
  const [y, m] = month.split('-').map(Number);
  const isCurrent = month >= currentMonth();
  const empty = data && !data.revenue && !data.expense && !data.otherIncome;

  return (
    <View style={{ gap: 12 }}>
      <View style={s.monthRow}>
        <Pressable onPress={() => onMonth(shiftMonth(month, -1))} hitSlop={10} accessibilityRole="button" accessibilityLabel={k.prevMonth} style={({ pressed }) => [s.monthBtn, { backgroundColor: c.fill }, pressed && { opacity: 0.5 }]}>
          <Ionicons name="chevron-back" size={18} color={c.ink} />
        </Pressable>
        <Text style={[s.monthT, { color: c.ink }]}>{`${k.monthNames[m - 1]} ${y}`}</Text>
        {isCurrent ? <View style={s.monthBtn} /> : (
          <Pressable onPress={() => onMonth(shiftMonth(month, 1))} hitSlop={10} accessibilityRole="button" accessibilityLabel={k.nextMonth} style={({ pressed }) => [s.monthBtn, { backgroundColor: c.fill }, pressed && { opacity: 0.5 }]}>
            <Ionicons name="chevron-forward" size={18} color={c.ink} />
          </Pressable>
        )}
      </View>

      {!data ? null : empty ? (
        <Card style={s.card}><Text style={[s.muted, { color: c.ink3 }]}>{k.noActivity}</Text></Card>
      ) : (
        <>
          <Ladder data={data} />
          <WhereWent data={data} />
          {activeBranches(data).length > 1 ? <Branches data={data} /> : null}
          <Daily data={data} />
        </>
      )}
    </View>
  );
}

/* ───────── 1. Foyda zinapoyasi ───────── */

function Ladder({ data }: { data: ProfitData }) {
  const { c } = useTheme();
  const k = useDict().kirimChiqim;
  const row = (label: string, value: string, color: string, top?: boolean) => (
    <View style={[s.row, top && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.sep, paddingTop: 8 }]}>
      <Text style={[s.rowL, { color: c.ink2 }]}>{label}</Text>
      <Text style={[s.rowV, tabular, { color }]}>{value}</Text>
    </View>
  );
  const loss = data.net < 0;
  return (
    <Card style={s.card}>
      <Text style={[s.title, { color: c.ink }]}>{k.profitTitle}</Text>
      {row(k.pSales, fmtMoney(data.revenue), c.ink)}
      {row(k.pCost, fmtMoney(data.cost), c.bad)}
      {data.bankReceived ? row(k.pBank, fmtMoney(data.bankReceived), c.ok) : null}
      {row(k.pGross, fmtMoney(data.gross), data.gross >= 0 ? c.ink : c.bad, true)}
      {data.otherIncome ? row(k.pOtherIncome, fmtMoney(data.otherIncome), c.ok) : null}
      {row(k.pExpenses, fmtMoney(data.expense), c.bad)}
      <View style={[s.row, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.sep, paddingTop: 10 }]}>
        <Text style={[s.netL, { color: c.ink }]}>{loss ? k.pLoss : k.pNet}</Text>
        <Text style={[s.netV, tabular, { color: loss ? c.bad : c.ok }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {fmtMoney(data.net, { suffix: true })}
        </Text>
      </View>
    </Card>
  );
}

/* ───────── 2. Foyda qayerga ketdi ───────── */

function WhereWent({ data }: { data: ProfitData }) {
  const { c } = useTheme();
  const k = useDict().kirimChiqim;
  // Xarajatlar — qizil/sariq/binafsha/havorang; yashil faqat «Sizga qoldi» uchun (sq.o — yashil)
  const palette = [c.sq.r, c.sq.a, c.sq.p, c.sq.t];
  const all = data.byCategory.filter((x) => x.type === 'expense');
  const shown = all.slice(0, 4).map((x, i) => ({ label: x.category, amount: x.total, color: palette[i] }));
  const others = all.slice(4).reduce((a, x) => a + x.total, 0);
  if (others > 0) shown.push({ label: k.whereOthers, amount: others, color: c.sq.g });

  const base = data.gross + data.otherIncome;
  const left = Math.max(0, base - data.expense);
  const denom = Math.max(base, data.expense, 1);
  const parts = [...shown, ...(left > 0 ? [{ label: k.whereLeft, amount: left, color: c.ok }] : [])];
  const pct = (n: number) => `${Math.round((n / denom) * 100)}%`;

  return (
    <Card style={s.card}>
      <Text style={[s.title, { color: c.ink }]}>{k.whereTitle}</Text>
      <Text style={[s.muted, { color: c.ink3 }]}>{tr(k.whereBase, { sum: fmtMoney(base, { suffix: true }) })}</Text>
      {all.length === 0 ? (
        <Text style={[s.muted, { color: c.ink3 }]}>{k.whereEmpty}</Text>
      ) : (
        <>
          <View style={[s.stack, { backgroundColor: c.fill }]}>
            {parts.map((p) => <View key={p.label} style={{ flex: p.amount, backgroundColor: p.color }} />)}
          </View>
          {parts.map((p) => (
            <View key={p.label} style={s.row}>
              <View style={s.legend}>
                <View style={[s.dot, { backgroundColor: p.color }]} />
                <Text style={[s.rowL, { color: p.label === k.whereLeft ? c.ink : c.ink2 }]} numberOfLines={1}>{p.label}</Text>
              </View>
              <Text style={[s.rowV, tabular, { color: p.label === k.whereLeft ? c.ok : c.bad }]}>
                {`${pct(p.amount)} · ${fmtCompact(p.amount)}`}
              </Text>
            </View>
          ))}
          {data.expense > base ? (
            <Text style={[s.reason, { color: c.bad }]}>{tr(k.whereOver, { sum: fmtMoney(data.expense - base, { suffix: true }) })}</Text>
          ) : null}
        </>
      )}
    </Card>
  );
}

/* ───────── 3. Filiallar: foyda yoki zarar ───────── */

/** Oyda sotuvi ham, yozuvi ham bo'lmagan filial (masalan, ombor) — ro'yxatni to'ldirmasin */
const activeBranches = (data: ProfitData) => data.byBranch.filter((b) => b.gross || b.income || b.expense);

function Branches({ data }: { data: ProfitData }) {
  const { c } = useTheme();
  const k = useDict().kirimChiqim;
  return (
    <Card style={s.card}>
      <Text style={[s.title, { color: c.ink }]}>{k.branchesTitle}</Text>
      {activeBranches(data).map((b, i) => {
        const loss = b.net < 0;
        const meta = tr(b.income ? k.branchMetaIncome : k.branchMeta, {
          gross: fmtCompact(b.gross), income: fmtCompact(b.income), expense: fmtCompact(b.expense),
        });
        return (
          <View key={b.id ?? 'common'} style={[{ gap: 2 }, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.sep, paddingTop: 10 }]}>
            <View style={s.row}>
              <Text style={[s.branchN, { color: c.ink }]} numberOfLines={1}>{b.id ? b.name : k.branchCommon}</Text>
              <Text style={[s.branchV, tabular, { color: loss ? c.bad : c.ok }]}>{signed(b.net)}</Text>
            </View>
            <Text style={[s.muted, { color: c.ink3 }]}>{meta}</Text>
            {b.top ? (
              <Text style={[s.reason, { color: loss ? c.bad : c.ink3 }]}>
                {tr(loss ? k.lossReason : k.topReason, { category: b.top.category, sum: fmtCompact(b.top.amount) })}
              </Text>
            ) : null}
          </View>
        );
      })}
    </Card>
  );
}

/* ───────── 4. Kunlik grafik ───────── */

const CHART_H = 110;

function Daily({ data }: { data: ProfitData }) {
  const { c } = useTheme();
  const d = useDict();
  const k = d.kirimChiqim;
  const [picked, setPicked] = useState<string | null>(null);

  const posMax = Math.max(0, ...data.daily.map((x) => x.net));
  const negMax = Math.max(0, ...data.daily.map((x) => -x.net));
  const span = posMax + negMax || 1;
  // Musbat va manfiy qism balandligi — eng katta qiymatlarga mutanosib
  const upH = Math.round((CHART_H * posMax) / span);
  const downH = CHART_H - upH;

  const sel = picked ? data.daily.find((x) => x.day === picked) ?? null : null;
  const worst = data.daily.filter((x) => x.net < 0).sort((a, b) => a.net - b.net).slice(0, 2);

  const dayLine = (x: ProfitData['daily'][number]) => (
    <View key={x.day} style={{ gap: 2 }}>
      <View style={s.row}>
        <Text style={[s.rowL, { color: c.ink }]}>{fmtDayMonth(dayDate(x.day))}</Text>
        <Text style={[s.rowV, tabular, { color: x.net < 0 ? c.bad : c.ok }]}>{signed(x.net)}</Text>
      </View>
      <Text style={[s.muted, { color: c.ink3 }]}>
        {[tr(k.dayDetail, { gross: fmtCompact(x.gross), expense: fmtCompact(x.expense) }), x.top?.category].filter(Boolean).join(' · ')}
      </Text>
    </View>
  );

  return (
    <Card style={s.card}>
      <Text style={[s.title, { color: c.ink }]}>{k.dailyTitle}</Text>
      <Text style={[s.muted, { color: c.ink3 }]}>{k.dailySub}</Text>
      <View style={[s.chart, { height: CHART_H }]}>
        {data.daily.map((x) => {
          const on = x.day === picked;
          const h = Math.max(x.net ? 3 : 1, Math.round((CHART_H * Math.abs(x.net)) / span));
          const color = x.net < 0 ? c.bad : x.net > 0 ? c.ok : c.sep;
          return (
            <Pressable
              key={x.day}
              onPress={() => setPicked(on ? null : x.day)}
              accessibilityRole="button"
              accessibilityLabel={`${fmtDayMonth(dayDate(x.day))}: ${fmtMoney(x.net, { suffix: true })}`}
              style={[s.barCol, on && { backgroundColor: c.fill }]}
            >
              <View style={{ height: upH, justifyContent: 'flex-end' }}>
                {x.net > 0 ? <View style={[s.bar, { height: Math.min(h, upH), backgroundColor: color }]} /> : null}
              </View>
              <View style={{ height: downH }}>
                {x.net < 0 ? <View style={[s.bar, { height: Math.min(h, downH), backgroundColor: color }]} /> : null}
                {x.net === 0 && upH === 0 ? <View style={[s.bar, { height: 1, backgroundColor: color }]} /> : null}
              </View>
            </Pressable>
          );
        })}
        <View pointerEvents="none" style={[s.axis, { top: upH, backgroundColor: c.sep }]} />
      </View>
      <View style={s.row}>
        <Text style={[s.axisL, { color: c.ink3 }]}>{data.daily[0] ? fmtDayMonth(dayDate(data.daily[0].day)) : ''}</Text>
        <Text style={[s.axisL, { color: c.ink3 }]}>{data.daily.length ? fmtDayMonth(dayDate(data.daily[data.daily.length - 1].day)) : ''}</Text>
      </View>
      {sel ? dayLine(sel) : worst.length ? (
        <View style={{ gap: 8 }}>
          <Text style={[s.sub, { color: c.ink2 }]}>{k.worstDays}</Text>
          {worst.map(dayLine)}
        </View>
      ) : null}
    </Card>
  );
}

const s = StyleSheet.create({
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  monthT: { fontSize: 20, fontWeight: '700' },
  card: { padding: 16, gap: 8 },
  title: { fontSize: 17, fontWeight: '700' },
  sub: { fontSize: 14, fontWeight: '600' },
  muted: { fontSize: 13, fontWeight: '500' },
  reason: { fontSize: 13, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  rowL: { fontSize: 15, flexShrink: 1 },
  rowV: { fontSize: 15, fontWeight: '600' },
  netL: { fontSize: 17, fontWeight: '700' },
  netV: { fontSize: 20, fontWeight: '800', flexShrink: 1 },
  stack: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', marginVertical: 4 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  branchN: { fontSize: 16, fontWeight: '700', flexShrink: 1 },
  branchV: { fontSize: 16, fontWeight: '700' },
  chart: { flexDirection: 'row', gap: 2, marginTop: 6 },
  barCol: { flex: 1, borderRadius: 3 },
  bar: { borderRadius: 2, marginHorizontal: 0.5 },
  axis: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth },
  axisL: { fontSize: 12, fontWeight: '500' },
});
