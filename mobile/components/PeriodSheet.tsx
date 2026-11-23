import { useEffect, useMemo, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { Sheet, Chips } from '@/components/ui';
import { useTheme, tabular } from '@/lib/theme';
import { useDict, tr } from '@/lib/i18n';
import {
  PRESET_PERIODS, type HomePeriod, type PresetPeriod, isDayKey, fromDayKey, toDayKey, normalizeDay, monthGrid, sameMonth,
} from '@/lib/homePeriod';

/** Dushanbadan boshlanadigan ustun tartibi (getDay indekslari) */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/**
 * Tushum davrini tanlash varag'i: tez tugmalar (Bugun · Kecha · Hafta · Oy · Yil · Hammasi) + kalendar.
 * Kelajakdagi kunlar tanlanmaydi. Tanlov darhol qo'llanadi va varaq yopiladi.
 */
export function PeriodSheet({ visible, value, onChange, onClose, presets = PRESET_PERIODS, title }: {
  visible: boolean; value: HomePeriod; onChange: (p: HomePeriod) => void; onClose: () => void;
  /** Tez tugmalar (kunlik ekranda — faqat Bugun · Kecha) */
  presets?: readonly PresetPeriod[];
  title?: string;
}) {
  const { c } = useTheme();
  const d = useDict();
  const f = d.format;
  const today = useMemo(() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const selected = isDayKey(value) ? fromDayKey(value) : value === 'today' ? today : value === 'yesterday' ? new Date(today.getTime() - 86_400_000) : null;
  const [month, setMonth] = useState(() => selected ?? today);
  // Har ochilishda — tanlangan kun (yoki bugun) oyi
  useEffect(() => { if (visible) setMonth(selected ?? today); }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const cells = useMemo(() => monthGrid(month), [month]);
  const canNext = !sameMonth(month, today) && month < today;
  const shift = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));
  const pick = (p: HomePeriod) => { onChange(p); onClose(); };
  const preset = (presets as readonly string[]).includes(value) ? (value as PresetPeriod) : null;

  return (
    <Sheet visible={visible} onClose={onClose} title={title ?? d.home.pickPeriod} closeLabel={d.common.close}>
      <Chips
        options={presets.map((p) => ({ key: p, label: d.home.periods[p] }))}
        value={preset}
        onChange={(p) => pick(p)}
      />

      <View style={[s.cal, { backgroundColor: c.cell }]}>
        <View style={s.head}>
          <Pressable onPress={() => shift(-1)} hitSlop={10} accessibilityRole="button" accessibilityLabel={d.home.prevMonth} style={({ pressed }) => [s.nav, { backgroundColor: c.fill }, pressed && { opacity: 0.5 }]}>
            <Ionicons name="chevron-back" size={20} color={c.ink} />
          </Pressable>
          <Text style={[s.month, { color: c.ink }]} accessibilityRole="header">{`${f.monthsNom[month.getMonth()]} ${month.getFullYear()}`}</Text>
          <Pressable
            onPress={() => canNext && shift(1)}
            disabled={!canNext}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={d.home.nextMonth}
            accessibilityState={{ disabled: !canNext }}
            style={({ pressed }) => [s.nav, { backgroundColor: c.fill }, !canNext && { opacity: 0.3 }, pressed && { opacity: 0.5 }]}
          >
            <Ionicons name="chevron-forward" size={20} color={c.ink} />
          </Pressable>
        </View>

        <View style={s.row}>
          {WEEK_ORDER.map((i) => (
            <Text key={i} style={[s.wd, { color: c.ink3 }]}>{f.weekdaysMin[i]}</Text>
          ))}
        </View>

        <View style={s.grid}>
          {cells.map((day, i) => {
            if (!day) return <View key={`e${i}`} style={s.cell} />;
            const future = day > today;
            const isSel = !!selected && toDayKey(day) === toDayKey(selected);
            const isToday = toDayKey(day) === toDayKey(today);
            return (
              <View key={toDayKey(day)} style={s.cell}>
                <Pressable
                  onPress={() => pick(normalizeDay(toDayKey(day)))}
                  disabled={future}
                  accessibilityRole="button"
                  accessibilityLabel={tr(f.dayMonth, { d: day.getDate(), m: f.months[day.getMonth()] })}
                  accessibilityState={{ selected: isSel, disabled: future }}
                  style={({ pressed }) => [
                    s.day,
                    isSel ? { backgroundColor: c.tintFill } : isToday ? { borderWidth: 1.5, borderColor: c.tint } : null,
                    pressed && !isSel && { backgroundColor: c.fill },
                  ]}
                >
                  <Text style={[s.dayT, tabular, { color: isSel ? c.onTint : future ? c.ink3 : c.ink, opacity: future ? 0.45 : 1, fontWeight: isSel || isToday ? '700' : '500' }]}>
                    {day.getDate()}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      </View>
    </Sheet>
  );
}

const s = StyleSheet.create({
  cal: { borderRadius: 20, padding: 12, gap: 6 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 6 },
  nav: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  month: { fontSize: 17, fontWeight: '700' },
  row: { flexDirection: 'row' },
  wd: { flex: 1, textAlign: 'center', fontSize: 13, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 3 },
  day: { flex: 1, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  dayT: { fontSize: 16 },
});
