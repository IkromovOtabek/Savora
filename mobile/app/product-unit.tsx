import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, NavBar, Group, Cell } from '@/components/ui';
import { useDict } from '@/lib/i18n';
import { FORM_UNITS, putChoice } from '@/lib/catalog';

/** O'lchov birligini tanlash: Dona / KG / Metr / Litr — tanlangach formaga qaytadi */
export default function ProductUnit() {
  const router = useRouter();
  const { value } = useLocalSearchParams<{ value?: string }>();
  const d = useDict();
  const units = d.productFields.units;
  // Ro'yxatda bosh harf bilan: Dona, KG, Metr, Litr
  const label = (u: string) => {
    const v = units[u] ?? u;
    return u === 'kg' ? v.toUpperCase() : v.charAt(0).toUpperCase() + v.slice(1);
  };

  return (
    <Screen header={<NavBar title={d.catalog.unitTitle} />}>
      <Group>
        {FORM_UNITS.map((u) => (
          <Cell
            key={u}
            title={label(u)}
            checked={u === (value || 'dona')}
            onPress={() => { putChoice('unit', u); router.back(); }}
          />
        ))}
      </Group>
    </Screen>
  );
}
