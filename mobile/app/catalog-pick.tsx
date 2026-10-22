import { useCallback, useMemo, useState } from 'react';
import { View, Alert, StyleSheet } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { api, errMsg } from '@/lib/api';
import { Screen, NavBar, SearchField, Group, Cell, Field, Button, FormCard, AddRow, Loading, ErrorState, EmptyState } from '@/components/ui';
import { useDict } from '@/lib/i18n';
import { putChoice, type NamedItem } from '@/lib/catalog';

type Kind = 'brand' | 'supplier';
interface Row extends NamedItem { phone?: string | null }

/** Brend yoki yetkazib beruvchini tanlash; ro'yxat tepasida «Yangi … qo'shish» (shu yerning o'zida) */
export default function CatalogPick() {
  const router = useRouter();
  const { kind: kindParam } = useLocalSearchParams<{ kind?: string }>();
  const kind: Kind = kindParam === 'supplier' ? 'supplier' : 'brand';
  const d = useDict();
  const k = d.catalog;
  const path = kind === 'brand' ? '/api/mobile/catalog/brands' : '/api/mobile/catalog/suppliers';

  const [items, setItems] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<{ items: Row[] }>(path);
      setItems(r.items); setError(null);
    } catch (e) { setError(errMsg(e)); }
  }, [path]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (items ?? []).filter((x) => !s || x.name.toLowerCase().includes(s));
  }, [items, q]);

  function choose(item: NamedItem | null) {
    putChoice(kind, item ? { id: item.id, name: item.name } : null);
    router.back();
  }

  async function onCreate() {
    setTouched(true);
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const created = await api<Row>(path, { method: 'POST', body: { name: newName.trim(), phone: newPhone.trim() } });
      choose(created);
    } catch (e) {
      Alert.alert(d.common.error, errMsg(e));
    } finally { setBusy(false); }
  }

  const title = kind === 'brand' ? k.brandTitle : k.supplierTitle;

  return (
    <Screen keyboard header={<NavBar title={title} />}>
      <FormCard>
        <SearchField value={q} onChangeText={setQ} placeholder={kind === 'brand' ? k.brandSearch : k.supplierSearch} />
        {adding ? (
          <View style={s.form}>
            <Field
              label={kind === 'brand' ? k.brandName : k.supplierName}
              value={newName}
              onChangeText={setNewName}
              autoFocus
              maxLength={kind === 'brand' ? 60 : 120}
              error={touched && !newName.trim() ? k.nameRequired : null}
              returnKeyType="done"
              onSubmitEditing={onCreate}
            />
            {kind === 'supplier' ? (
              <Field label={k.supplierPhone} value={newPhone} onChangeText={setNewPhone} keyboardType="phone-pad" maxLength={40} placeholder={d.common.phonePlaceholder} />
            ) : null}
            <View style={s.btns}>
              <Button title={d.common.cancel} variant="gray" onPress={() => { setAdding(false); setTouched(false); }} style={{ flex: 1 }} />
              <Button title={d.common.add} loading={busy} onPress={onCreate} style={{ flex: 1 }} />
            </View>
          </View>
        ) : (
          <AddRow title={kind === 'brand' ? k.brandAdd : k.supplierAdd} onPress={() => { setAdding(true); setNewName(q.trim()); }} />
        )}
      </FormCard>

      {items === null && !error ? <Loading /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {items && !shown.length ? <EmptyState icon="pricetags-outline" title={k.empty} /> : null}
      {shown.length ? (
        <Group>
          {[
            <Cell key="__none" title={k.none} onPress={() => choose(null)} />,
            ...shown.map((it) => (
              <Cell key={it.id} title={it.name} subtitle={it.phone ?? undefined} onPress={() => choose(it)} chevron />
            )),
          ]}
        </Group>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  form: { gap: 12 },
  btns: { flexDirection: 'row', gap: 10 },
});
