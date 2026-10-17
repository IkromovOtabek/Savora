import { useState } from 'react';
import { Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { api, errMsg } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useResource } from '@/lib/hooks';
import { useTheme } from '@/lib/theme';
import { Screen, NavBar, LargeTitle, Group, Cell, Loading, ErrorState } from '@/components/ui';
import { useDict } from '@/lib/i18n';

interface BType { key: string; label: string; description: string }

export default function BusinessType() {
  const router = useRouter();
  const { me, refresh } = useAuth();
  const { c } = useTheme();
  const d = useDict();
  const current = me?.org.businessType;
  const res = useResource<{ types: BType[] }>('/api/mobile/org');
  const [saving, setSaving] = useState<string | null>(null);

  async function choose(key: string) {
    if (key === current || saving) return;
    setSaving(key);
    try {
      await api('/api/mobile/org', { method: 'PATCH', body: { businessType: key } });
      await refresh();
      router.back();
    } catch (e) {
      Alert.alert(d.common.error, errMsg(e));
    } finally { setSaving(null); }
  }

  return (
    <Screen header={<NavBar backLabel={d.profile.title} />}>
      <LargeTitle title={d.businessType.title} />
      {res.loading ? <Loading /> : !res.data ? <ErrorState message={res.error} onRetry={res.retry} /> : (
        <Group footer={d.businessType.footer}>
          {res.data.types.map((tp) => (
            <Cell
              key={tp.key}
              title={tp.label}
              subtitle={tp.description}
              subtitleLines={3}
              checked={tp.key === current}
              disabled={!!saving}
              right={saving === tp.key ? <ActivityIndicator color={c.tint} /> : undefined}
              onPress={() => choose(tp.key)}
            />
          ))}
        </Group>
      )}
    </Screen>
  );
}
