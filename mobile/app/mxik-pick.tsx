import { useEffect, useRef, useState } from 'react';
import { View, Linking, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api, errMsg } from '@/lib/api';
import { Screen, NavBar, SearchField, Group, Cell, Button, FormCard, Loading, EmptyState, InlineError } from '@/components/ui';
import { Text } from '@/components/ui/Text';
import { useTheme, MONO } from '@/lib/theme';
import { useDict } from '@/lib/i18n';
import { putChoice } from '@/lib/catalog';

interface MxikItem { code: string; name: string; unit: string | null; barcode: string | null; marked: boolean }

const SITE_URL = 'https://tasnif.soliq.uz';

/**
 * MXIK (IKPU) katalogidan qidirish: server proksi (/api/mobile/mxik/search → tasnif.soliq.uz).
 * Tanlangan kod formaga qaytadi (putChoice('mxik')). Katalog ishlamasa — rasmiy saytga havola, kod qo'lda kiritiladi.
 */
export default function MxikPick() {
  const router = useRouter();
  const { q: initialQ } = useLocalSearchParams<{ q?: string }>();
  const { c } = useTheme();
  const d = useDict();
  const t = d.mxikPick;
  const [q, setQ] = useState(initialQ ?? '');
  const [items, setItems] = useState<MxikItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const started = useRef(false);

  async function search(text = q) {
    const s = text.trim();
    if (s.length < 2) return;
    const my = ++seq.current;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ items: MxikItem[] }>(`/api/mobile/mxik/search?q=${encodeURIComponent(s)}`);
      if (my === seq.current) setItems(r.items);
    } catch (e) {
      if (my === seq.current) { setItems(null); setError(errMsg(e)); }
    } finally {
      if (my === seq.current) setBusy(false);
    }
  }

  // Formadan nom/shtrix-kod kelgan bo'lsa — ochilganda bir marta qidiramiz
  useEffect(() => {
    if (started.current || (initialQ ?? '').trim().length < 2) return;
    started.current = true;
    void search(initialQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQ]);

  function choose(item: MxikItem) {
    putChoice('mxik', { code: item.code, name: item.name, marked: item.marked });
    router.back();
  }

  return (
    <Screen keyboard header={<NavBar title={t.title} />}>
      <FormCard>
        <SearchField value={q} onChangeText={setQ} placeholder={t.searchPh} autoFocus={!initialQ} />
        <Button title={t.search} icon="search" variant="tinted" onPress={() => search()} disabled={busy || q.trim().length < 2} />
        {!items && !error && !busy ? <Text style={[s.hint, { color: c.ink3 }]}>{t.hint}</Text> : null}
      </FormCard>

      {error ? <InlineError message={error} onRetry={() => search()} /> : null}
      {busy && !items ? <Loading /> : null}

      {items && items.length === 0 ? <EmptyState icon="search-outline" title={t.empty} /> : null}
      {items && items.length > 0 ? (
        <Group>
          {items.map((it, i) => (
            <Cell
              key={it.code}
              sep={i > 0}
              title={it.name}
              titleLines={3}
              subtitle={[it.code, it.unit, it.marked ? t.markedTag : null].filter(Boolean).join(' · ')}
              subtitleLines={2}
              onPress={() => choose(it)}
              chevron
            />
          ))}
        </Group>
      ) : null}

      <View style={s.foot}>
        <Text style={[s.hint, { color: c.ink3 }]}>{t.source}</Text>
        <Button title={t.openSite} icon="open-outline" variant="gray" onPress={() => Linking.openURL(SITE_URL)} />
        <Text style={[s.mono, { color: c.ink3, fontFamily: MONO }]}>{SITE_URL.replace('https://', '')}</Text>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  hint: { fontSize: 13.5, fontWeight: '500' },
  foot: { gap: 10, paddingHorizontal: 4 },
  mono: { fontSize: 12, textAlign: 'center' },
});
