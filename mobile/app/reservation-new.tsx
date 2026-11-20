import { useEffect, useMemo, useRef, useState } from 'react';
import { View, ScrollView, Pressable, Alert, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { errMsg } from '@/lib/api';
import { useTheme, tabular } from '@/lib/theme';
import { fmtMoney } from '@/lib/format';
import { isBarePhone } from '@/lib/phone';
import { useDict, tr } from '@/lib/i18n';
import { newClientKey, type MenuGroup, type MenuItem } from '@/lib/restaurant';
import {
  reservationsApi, type CustomerHit, type FreeTable, type Reservation, type ReservationFormData,
} from '@/lib/reservations';
import {
  DEFAULT_DURATION, DURATION_PRESETS, GUEST_PRESETS, MAX_ITEMS, MINUTE_STEPS, addDays, defaultMinutes, fmtDayShort, fmtTime,
  parseTime, tashkentDay,
} from '@/lib/reservationTime';
import {
  Screen, NavBar, LargeTitle, SegmentedControl, Chips, Group, Cell, Button, Field, PhoneField, SearchField, Stepper,
  Loading, ErrorState, useLayout,
} from '@/components/ui';

interface Line { key: string; productId: string; name: string; qty: number; note: string; optionIds: string[] }

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const soldOut = (m: MenuItem) => m.available !== null && m.available <= 0;

/**
 * Bron formasi (yangi: ?date=&branchId=, tahrir: ?id=): mijoz (ism/telefon yozilganda mavjud mijozlar taklif qilinadi),
 * sana (14 kun tugmalari), vaqt (soat tugmalari + 15 daqiqa), davomiylik, mehmonlar, shu vaqtda bo'sh stollar
 * (mosi birinchi), oldindan taomlar (qidiruvli menyu, ±, modifikator, izoh), izoh. Faqat `reservation.manage`.
 */
export default function ReservationNew() {
  const params = useLocalSearchParams<{ id?: string; date?: string; branchId?: string }>();
  const editId = params.id ? String(params.id) : '';
  const router = useRouter();
  const { c } = useTheme();
  const d = useDict();
  const r = d.reservations;
  const L = useLayout();

  const [form, setForm] = useState<ReservationFormData | null>(null);
  const [editing, setEditing] = useState<Reservation | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const today = tashkentDay();

  const [date, setDate] = useState(() => (params.date && /^\d{4}-\d{2}-\d{2}$/.test(String(params.date)) && String(params.date) >= today ? String(params.date) : today));
  const [minutes, setMinutes] = useState(() => defaultMinutes(date));
  const [duration, setDuration] = useState(DEFAULT_DURATION);
  const [guests, setGuests] = useState(2);
  const [tableId, setTableId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);

  async function loadAll() {
    setLoadErr(null);
    try {
      const ed = editId ? (await reservationsApi.one(editId)).reservation : null;
      const fd = await reservationsApi.form(ed?.branchId ?? (params.branchId ? String(params.branchId) : null));
      setForm(fd);
      if (ed) {
        setEditing(ed);
        setDate(ed.day);
        setMinutes(parseTime(ed.time) ?? 19 * 60);
        setDuration(ed.durationMin);
        setGuests(ed.guests);
        setTableId(ed.tableId);
        setCustomerId(ed.customerId ?? '');
        setName(ed.customerName);
        setPhone(ed.customerPhone);
        setNote(ed.note ?? '');
        setLines(ed.items.map((i) => ({ key: newClientKey(), productId: i.productId, name: i.name, qty: i.qty, note: i.note ?? '', optionIds: i.optionIds })));
      }
      setReady(true);
    } catch (e) {
      setLoadErr(errMsg(e));
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadAll(); }, []);

  /* ───── bo'sh stollar ───── */
  const time = fmtTime(minutes);
  const [free, setFree] = useState<FreeTable[] | null>(null);
  const [freeErr, setFreeErr] = useState('');
  useEffect(() => {
    if (!ready || !form) return;
    let alive = true;
    setFree(null);
    setFreeErr('');
    const timer = setTimeout(async () => {
      try {
        const res = await reservationsApi.freeTables({ date, time, durationMin: duration, guests, branchId: form.branchId, excludeId: editing?.id });
        if (!alive) return;
        setFree(res.tables);
        setTableId((cur) => (cur && !res.tables.some((x) => x.id === cur) ? '' : cur));
      } catch (e) {
        if (alive) setFreeErr(errMsg(e));
      }
    }, 300);
    return () => { alive = false; clearTimeout(timer); };
  }, [ready, form, date, time, duration, guests, editing?.id]);

  /* ───── mijoz takliflari ───── */
  const [hits, setHits] = useState<CustomerHit[]>([]);
  const digits = phone.replace(/\D/g, '').replace(/^998/, '');
  const query = customerId ? '' : digits.length >= 3 ? phone : name.trim().length >= 2 ? name.trim() : '';
  useEffect(() => {
    if (!query) { setHits([]); return; }
    let alive = true;
    const timer = setTimeout(async () => {
      try {
        const res = await reservationsApi.customers(query);
        if (alive) setHits(res.customers);
      } catch {
        if (alive) setHits([]);
      }
    }, 350);
    return () => { alive = false; clearTimeout(timer); };
  }, [query]);

  /* ───── taomlar ───── */
  const menuById = useMemo(() => new Map((form?.menu.items ?? []).map((i) => [i.id, i])), [form]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mq, setMq] = useState('');
  const shown = useMemo(() => {
    const q = mq.trim().toLowerCase();
    return (form?.menu.items ?? []).filter((i) => !q || i.name.toLowerCase().includes(q)).slice(0, 40);
  }, [form, mq]);

  function addDish(i: MenuItem) {
    setLines((ls) => {
      if (ls.length >= MAX_ITEMS) return ls;
      if (!i.modifierGroups.length) {
        const same = ls.find((l) => l.productId === i.id && !l.optionIds.length && !l.note);
        if (same) return ls.map((l) => (l === same ? { ...l, qty: l.qty + 1 } : l));
      }
      return [...ls, { key: newClientKey(), productId: i.id, name: i.name, qty: 1, note: '', optionIds: [] }];
    });
  }
  const patch = (key: string, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));
  function toggleOption(l: Line, g: MenuGroup, optionId: string) {
    const inGroup = new Set(g.options.map((o) => o.id));
    const on = l.optionIds.includes(optionId);
    let next = l.optionIds;
    if (on) next = next.filter((x) => x !== optionId);
    else if (Math.max(1, g.max) === 1) next = [...next.filter((x) => !inGroup.has(x)), optionId];
    else if (next.filter((x) => inGroup.has(x)).length < Math.max(1, g.max)) next = [...next, optionId];
    patch(l.key, { optionIds: next });
  }

  /* ───── saqlash ───── */
  const busyRef = useRef(false);
  async function save() {
    if (busyRef.current || !form) return;
    const cleanPhone = isBarePhone(phone) ? '' : phone.trim();
    if (!customerId && (!name.trim() || !cleanPhone)) { Alert.alert(r.customer, r.needCustomer); return; }
    if (!tableId) { Alert.alert(r.table, r.needTable); return; }
    busyRef.current = true;
    setSaving(true);
    const body = {
      branchId: form.branchId,
      tableId,
      date,
      time,
      durationMin: duration,
      guests,
      customerId: customerId || undefined,
      customerName: name.trim(),
      customerPhone: cleanPhone,
      items: lines.map((l) => ({ productId: l.productId, qty: l.qty, optionIds: l.optionIds, note: l.note.trim() || undefined })),
      note: note.trim(),
    };
    try {
      if (editing) await reservationsApi.update(editing.id, body);
      else await reservationsApi.create(body);
      router.back();
    } catch (e) {
      Alert.alert(d.common.error, errMsg(e));
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  }

  const header = <NavBar />;
  const title = <LargeTitle title={editId ? r.editTitle : r.newTitle} />;
  if (loadErr) return <Screen header={header}>{title}<ErrorState message={loadErr} onRetry={loadAll} /></Screen>;
  if (!ready || !form) return <Screen header={header}>{title}<Loading /></Screen>;

  const days = Array.from({ length: 14 }, (_, n) => addDays(today, n));
  if (!days.includes(date)) days.push(date);
  const dayLabel = (k: string) => (k === today ? r.today : k === addDays(today, 1) ? r.tomorrow : fmtDayShort(k));
  const durLabel = (m: number) => (m % 60 === 0 ? tr(r.durH, { h: m / 60 }) : tr(r.durHM, { h: Math.floor(m / 60), m: m % 60 }));
  const multiHall = form.halls.length > 1;
  const selected = free?.find((x) => x.id === tableId) ?? null;
  const cols = Math.min(L.width, 600) - L.padX * 2 >= 420 ? 5 : 4;
  const tileW = Math.floor((Math.min(L.width, 600) - L.padX * 2 - 8 * (cols - 1)) / cols);

  return (
    <Screen
      keyboard
      header={header}
      gap={16}
      footer={<Button title={r.save} size="lg" full loading={saving} onPress={save} />}
    >
      {title}

      {/* Mijoz */}
      <View style={{ gap: 8 }}>
        <Text style={[s.label, { color: c.ink3 }]}>{r.customer}</Text>
        {customerId ? (
          <Group>
            <Cell
              icon="person"
              iconColor={c.sq.b}
              title={name}
              subtitle={phone}
              right={<Button title={r.change} size="sm" variant="tinted" onPress={() => { setCustomerId(''); setName(''); setPhone(''); }} />}
            />
          </Group>
        ) : (
          <>
            <Field label={r.name} value={name} onChangeText={setName} placeholder={r.namePh} autoCapitalize="words" maxLength={80} />
            <PhoneField label={r.phone} value={phone} onChangeText={setPhone} />
            {hits.length ? (
              <Group header={r.existing} icon="people-outline">
                {hits.map((h) => (
                  <Cell key={h.id} title={h.name} subtitle={h.phone} chevron onPress={() => { setCustomerId(h.id); setName(h.name); setPhone(h.phone); setHits([]); }} />
                ))}
              </Group>
            ) : (
              <Text style={[s.hint, { color: c.ink3 }]}>{r.newCustomerHint}</Text>
            )}
          </>
        )}
      </View>

      {/* Sana */}
      <View style={{ gap: 8 }}>
        <Text style={[s.label, { color: c.ink3 }]}>{r.date}</Text>
        <Chips options={days.map((k) => ({ key: k, label: dayLabel(k) }))} value={date} onChange={setDate} />
      </View>

      {/* Vaqt */}
      <View style={{ gap: 8 }}>
        <Text style={[s.label, { color: c.ink3 }]}>{`${r.time} · ${time}`}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} accessibilityLabel={r.hour}>
          {HOURS.map((h) => {
            const on = Math.floor(minutes / 60) === h;
            return (
              <Pressable
                key={h}
                onPress={() => setMinutes(h * 60 + (minutes % 60))}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                style={({ pressed }) => [s.hourChip, { backgroundColor: on ? c.tintFill : c.fill }, pressed && { opacity: 0.6 }]}
              >
                <Text style={[s.hourT, tabular, { color: on ? c.onTint : c.ink }]}>{String(h).padStart(2, '0')}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <SegmentedControl<string>
          options={MINUTE_STEPS.map((m) => ({ key: String(m), label: `:${String(m).padStart(2, '0')}` }))}
          value={String(minutes % 60)}
          onChange={(k) => setMinutes(Math.floor(minutes / 60) * 60 + Number(k))}
        />
      </View>

      {/* Davomiylik va mehmonlar */}
      <View style={{ gap: 8 }}>
        <Text style={[s.label, { color: c.ink3 }]}>{r.duration}</Text>
        <Chips options={DURATION_PRESETS.map((m) => ({ key: m, label: durLabel(m) }))} value={(DURATION_PRESETS as readonly number[]).includes(duration) ? duration : null} onChange={setDuration} />
      </View>
      <View style={{ gap: 8 }}>
        <Text style={[s.label, { color: c.ink3 }]}>{r.guests}</Text>
        <Chips options={GUEST_PRESETS.map((n) => ({ key: n, label: String(n) }))} value={(GUEST_PRESETS as readonly number[]).includes(guests) ? guests : null} onChange={setGuests} />
        <Group>
          <Cell title={r.guests} right={<Stepper value={guests} onChange={setGuests} min={1} max={100} />} />
        </Group>
      </View>

      {/* Stol */}
      <View style={{ gap: 8 }}>
        <Text style={[s.label, { color: c.ink3 }]}>{`${r.table} · ${tr(r.tableFor, { time: `${time}–${fmtTime(minutes + duration)}` })}`}</Text>
        {freeErr ? <Text style={[s.hint, { color: c.bad }]}>{freeErr}</Text>
          : !free ? <Text style={[s.hint, { color: c.ink3 }]}>{r.tablesLoading}</Text>
          : free.length === 0 ? <Text style={[s.warn, { backgroundColor: c.warnSoft, color: c.warn }]}>{r.noFreeTables}</Text>
          : (
            <View style={s.grid}>
              {free.map((x) => {
                const on = tableId === x.id;
                return (
                  <Pressable
                    key={x.id}
                    onPress={() => setTableId(on ? '' : x.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${tr(r.tableN, { n: x.number })}, ${tr(r.seatsN, { n: x.seats })}`}
                    style={({ pressed }) => [
                      s.tile,
                      { width: tileW, backgroundColor: on ? c.tintFill : c.cell, borderColor: on ? c.tintFill : c.sep, opacity: x.fits ? 1 : 0.6 },
                      pressed && { opacity: 0.6 },
                    ]}
                  >
                    <Text style={[s.tileNo, tabular, { color: on ? c.onTint : c.ink }]}>{x.number}</Text>
                    <Text style={[s.tileSub, { color: on ? c.onTint : c.ink3 }]} numberOfLines={1}>
                      {tr(r.seatsN, { n: x.seats })}{multiHall && x.hallName ? ` · ${x.hallName}` : ''}
                    </Text>
                    {x.busyNow || !x.fits ? <Text style={[s.tileTag, { color: on ? c.onTint : c.warn }]}>{x.busyNow ? r.busyNow : r.tooSmall}</Text> : null}
                  </Pressable>
                );
              })}
            </View>
          )}
        {selected && !selected.fits ? <Text style={[s.warn, { backgroundColor: c.warnSoft, color: c.warn }]}>{r.smallWarn}</Text> : null}
      </View>

      {/* Oldindan taomlar */}
      <View style={{ gap: 8 }}>
        <Text style={[s.label, { color: c.ink3 }]}>{r.items}</Text>
        <Text style={[s.hint, { color: c.ink3 }]}>{r.itemsHint}</Text>
        {lines.map((l) => {
          const item = menuById.get(l.productId);
          return (
            <View key={l.key} style={[s.line, { backgroundColor: c.cell }]}>
              <View style={s.lineTop}>
                <Text style={[s.lineName, { color: c.ink }]} numberOfLines={2}>{l.name}</Text>
                <Stepper value={l.qty} onChange={(n) => patch(l.key, { qty: n })} min={1} max={99} />
                <Pressable onPress={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${r.remove}: ${l.name}`} style={s.x}>
                  <Ionicons name="trash-outline" size={20} color={c.bad} />
                </Pressable>
              </View>
              {item?.modifierGroups.map((g) => (
                <View key={g.id} style={{ gap: 6 }}>
                  <Text style={[s.hint, { color: c.ink2 }]}>{tr(r.pickOptions, { group: g.name })}</Text>
                  <View style={s.opts}>
                    {g.options.map((o) => {
                      const on = l.optionIds.includes(o.id);
                      return (
                        <Pressable
                          key={o.id}
                          onPress={() => toggleOption(l, g, o.id)}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: on }}
                          style={({ pressed }) => [s.opt, { backgroundColor: on ? c.tintFill : c.fill }, pressed && { opacity: 0.6 }]}
                        >
                          <Text style={[s.optT, { color: on ? c.onTint : c.ink }]}>{o.name}{o.price ? ` +${fmtMoney(o.price)}` : ''}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
              <Field value={l.note} onChangeText={(v) => patch(l.key, { note: v })} placeholder={r.itemNotePh} maxLength={200} />
            </View>
          );
        })}
        {menuOpen ? (
          <View style={{ gap: 8 }}>
            <SearchField value={mq} onChangeText={setMq} placeholder={r.menuSearchPh} autoFocus />
            <Group>
              {shown.length === 0 ? [<Cell key="none" title={r.noDishes} disabled />] : shown.map((i) => {
                const off = i.stopListed ? r.stop : soldOut(i) ? r.soldOut : null;
                return (
                  <Cell
                    key={i.id}
                    title={i.name}
                    value={off ?? fmtMoney(i.price)}
                    disabled={!!off || lines.length >= MAX_ITEMS}
                    onPress={() => addDish(i)}
                  />
                );
              })}
            </Group>
            <Button title={r.hideMenu} variant="gray" onPress={() => { setMenuOpen(false); setMq(''); }} />
          </View>
        ) : (
          <Button title={r.addDish} icon="add-circle" variant="tinted" onPress={() => setMenuOpen(true)} />
        )}
      </View>

      <Field label={r.note} value={note} onChangeText={setNote} placeholder={r.notePh} maxLength={300} multiline />
    </Screen>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '600' },
  hint: { fontSize: 13, fontWeight: '500' },
  warn: { fontSize: 14, fontWeight: '600', borderRadius: 12, padding: 10, overflow: 'hidden' },
  hourChip: { minWidth: 52, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  hourT: { fontSize: 16, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { minHeight: 70, borderRadius: 16, borderWidth: 1, padding: 8, alignItems: 'center', justifyContent: 'center', gap: 2 },
  tileNo: { fontSize: 22, fontWeight: '800' },
  tileSub: { fontSize: 11.5, fontWeight: '600' },
  tileTag: { fontSize: 10.5, fontWeight: '700' },
  line: { borderRadius: 16, padding: 12, gap: 10 },
  lineTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lineName: { flex: 1, fontSize: 15.5, fontWeight: '700' },
  x: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  opts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  opt: { minHeight: 38, borderRadius: 999, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  optT: { fontSize: 14, fontWeight: '600' },
});
