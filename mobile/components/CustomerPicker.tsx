import { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/ui/Text';
import { Field, PhoneField, Group, Cell } from '@/components/ui';
import { api } from '@/lib/api';
import { getNetState } from '@/lib/net';
import { isNetworkError } from '@/lib/offline';
import { useTheme } from '@/lib/theme';
import { useDict } from '@/lib/i18n';

/** Sotuv mijozi: id — ro'yxatdan tanlangan mavjud mijoz ('' — yangi, ism + telefon bo'yicha) */
export interface PickedCustomer { id: string; name: string; phone: string }
export const EMPTY_CUSTOMER: PickedCustomer = { id: '', name: '', phone: '' };

interface Hit { id: string; name: string; phone: string }
interface SearchResp { hits: Hit[]; more: boolean }

/** Har harfdan keyin shuncha kutib so'raladi (oraliqda oldingi natija darhol mahalliy toraytiriladi) */
const DEBOUNCE_MS = 150;
/** Telefonda ro'yxat qisqa — qolgani qidiruv bilan */
const SHOW_MAX = 5;

const APOS = /['‘’ʻʼ`´]/g;
const norm = (s: string) => s.toLowerCase().replace(APOS, "'");
const isPhoneQuery = (q: string) => /^[\d\s+()-]+$/.test(q) && q.replace(/\D/g, '').length >= 3;

/** Server javobi kelguncha oldingi natijani yangi so'z bo'yicha toraytirish (web/lib/saleCustomer bilan bir xil qoida) */
function localMatch(h: Hit, q: string): boolean {
  if (!q) return true;
  if (isPhoneQuery(q)) return h.phone.replace(/\D/g, '').includes(q.replace(/\D/g, '').slice(-9));
  const name = norm(h.name);
  return norm(q).split(/\s+/).filter(Boolean).every((w) => name.includes(w));
}

interface Props {
  value: PickedCustomer;
  onChange: (v: PickedCustomer) => void;
  nameError?: string | null;
  phoneError?: string | null;
}

/**
 * Mijoz F.I.O + telefon (web components/tenant/CustomerPicker bilan bir xil):
 * F.I.O katagi bosilganda so'nggi mijozlar, har harf yozilganda real vaqtda qidiriladi (ism yoki raqam);
 * tanlansa telefon o'zi to'ladi. Internet yo'q bo'lsa — ism va telefon qo'lda yoziladi.
 */
export function CustomerPicker({ value, onChange, nameError, phoneError }: Props) {
  const { c } = useTheme();
  const d = useDict();
  const k = d.saleNew;
  const [open, setOpen] = useState(false);
  const [res, setRes] = useState<{ q: string; r: SearchResp } | null>(null);
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(false);
  const cache = useRef(new Map<string, SearchResp>());
  const seq = useRef(0);

  const q = value.name.trim();

  useEffect(() => {
    if (!open) return;
    const key = norm(q);
    const cached = cache.current.get(key);
    const my = ++seq.current;
    if (cached) {
      setRes({ q, r: cached });
      setLoading(false);
      return;
    }
    if (getNetState() === 'offline') {
      setOffline(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const r = await api<SearchResp>(`/api/mobile/customers?q=${encodeURIComponent(q)}`, { timeoutMs: 8000 });
        cache.current.set(key, r);
        if (seq.current !== my) return;
        setRes({ q, r });
        setOffline(false);
      } catch (e) {
        if (seq.current !== my) return;
        // Tarmoq yo'q — qo'lda yoziladi; boshqa xato (huquq va h.k.) — ro'yxatsiz
        setOffline(isNetworkError(e));
        setRes({ q, r: { hits: [], more: false } });
      }
      if (seq.current === my) setLoading(false);
    }, key ? DEBOUNCE_MS : 0);
    return () => clearTimeout(timer);
  }, [q, open]);

  const shown = useMemo(() => {
    if (!res) return [];
    return res.q === q ? res.r.hits : res.r.hits.filter((h) => localMatch(h, q));
  }, [res, q]);

  function pick(h: Hit) {
    onChange({ id: h.id, name: h.name, phone: h.phone });
    setOpen(false);
  }

  function onName(v: string) {
    // Tanlangan mijoz ismi o'zgartirilsa — bu boshqa (yangi) mijoz: uning telefoni ham tozalanadi
    onChange({ id: '', name: v, phone: value.id ? '' : value.phone });
    setOpen(true);
  }

  function onPhone(v: string) {
    // Niqob faqat ko'rinishni o'zgartirsa (raqamlar o'sha) — tanlangan mijoz saqlanadi
    const same = v.replace(/\D/g, '') === value.phone.replace(/\D/g, '');
    onChange({ id: same ? value.id : '', name: value.name, phone: v });
  }

  const list = shown.slice(0, SHOW_MAX);
  const more = shown.length > SHOW_MAX || (res?.q === q && res.r.more);
  const note = offline ? k.custOffline
    : loading && list.length === 0 ? k.custSearching
    : list.length === 0 ? (q ? k.custNew : k.custNone)
    : null;

  return (
    <View style={{ gap: 12 }}>
      <Field
        label={k.custName}
        value={value.name}
        onChangeText={onName}
        onFocus={() => setOpen(true)}
        placeholder={k.custPlaceholder}
        autoCapitalize="words"
        textContentType="name"
        maxLength={120}
        error={nameError}
        hint={value.id && !open ? `✓ ${k.custPicked}` : undefined}
      />
      {open ? (
        <View style={{ gap: 6 }}>
          {list.length > 0 ? (
            <Group header={q ? k.custFound : k.custRecent} icon="people-outline">
              {list.map((h) => (
                <Cell
                  key={h.id}
                  icon="person"
                  iconColor={h.id === value.id ? c.sq.g : c.sq.b}
                  title={h.name}
                  subtitle={h.phone}
                  checked={h.id === value.id}
                  onPress={() => pick(h)}
                />
              ))}
            </Group>
          ) : null}
          {note ? <Text style={[s.hint, { color: c.ink3 }]}>{note}</Text> : null}
          {more && !offline ? <Text style={[s.hint, { color: c.ink3 }]}>{k.custMore}</Text> : null}
        </View>
      ) : null}
      <PhoneField
        label={d.common.phone}
        value={value.phone}
        onChangeText={onPhone}
        onFocus={() => setOpen(false)}
        error={phoneError}
      />
    </View>
  );
}

const s = StyleSheet.create({
  hint: { fontSize: 13, lineHeight: 18, paddingHorizontal: 4 },
});
