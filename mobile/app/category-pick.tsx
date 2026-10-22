import { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { api, errMsg } from '@/lib/api';
import { Screen, NavBar, SearchField, Group, Cell, FormCard, AddRow, Loading, ErrorState, EmptyState } from '@/components/ui';
import { useTheme } from '@/lib/theme';
import { useDict } from '@/lib/i18n';
import { putChoice, flattenCategories, type CategoryItem } from '@/lib/catalog';

/** «Turkum» — qidiruv, «Yangi kategoriya qo'shish» va ichma-ich ro'yxat; istalgan darajani tanlash mumkin */
export default function CategoryPick() {
  const router = useRouter();
  const { c } = useTheme();
  const d = useDict();
  const k = d.catalog;
  const [items, setItems] = useState<CategoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await api<{ items: CategoryItem[] }>('/api/mobile/catalog/categories');
      setItems(r.items); setError(null);
    } catch (e) { setError(errMsg(e)); }
  }, []);
  // Yangi kategoriya ekranidan qaytganda ham yangilanadi
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const rows = useMemo(() => {
    const all = flattenCategories(items ?? []);
    const s = q.trim().toLowerCase();
    return s ? all.filter((r) => r.path.toLowerCase().includes(s)) : all;
  }, [items, q]);
  const searching = !!q.trim();

  return (
    <Screen header={<NavBar title={k.categoryTitle} />}>
      <FormCard>
        <SearchField value={q} onChangeText={setQ} placeholder={k.categorySearch} />
        <AddRow title={k.categoryAdd} onPress={() => router.push('/category-new')} />
      </FormCard>

      {items === null && !error ? <Loading /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {items && !rows.length ? <EmptyState icon="folder-open-outline" title={k.empty} /> : null}
      {rows.length ? (
        <Group>
          {[
            <Cell key="__none" title={k.none} onPress={() => { putChoice('category', null); router.back(); }} />,
            ...rows.map(({ item, depth, path }) => (
              <Cell
                key={item.id}
                title={searching ? path : item.name}
                titleLines={2}
                left={!searching && depth > 0 ? (
                  <View style={[s.indent, { width: depth * 18 }]}>
                    <View style={[s.elbow, { borderColor: c.ink3 }]} />
                  </View>
                ) : undefined}
                onPress={() => { putChoice('category', { id: item.id, name: item.name, path }); router.back(); }}
                chevron
              />
            )),
          ]}
        </Group>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  indent: { alignSelf: 'stretch', justifyContent: 'center', alignItems: 'flex-end' },
  elbow: { width: 12, height: 14, borderLeftWidth: 1.5, borderBottomWidth: 1.5, borderBottomLeftRadius: 4, marginTop: -10, opacity: 0.6 },
});
