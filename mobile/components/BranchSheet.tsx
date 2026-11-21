import { useState } from 'react';
import { Alert, ActivityIndicator } from 'react-native';
import { Text } from '@/components/ui/Text';
import { Sheet, Group, Cell, Pill, Button, Loading, ErrorState, EmptyState } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useResource } from '@/lib/hooks';
import { useTheme } from '@/lib/theme';
import { errMsg } from '@/lib/api';
import { useDict } from '@/lib/i18n';

interface B { id: string; name: string; address: string | null; isMain: boolean }

/**
 * Do'kon nomi bosilganda: egasi parolsiz filialga kiradi (server: POST /api/mobile/auth/branch),
 * filialda bo'lsa — «Bosh hisobga qaytish» yoki boshqa filialga o'tish.
 */
export function BranchSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { c } = useTheme();
  const d = useDict();
  const h = d.home;
  const { me, inBranch, enterBranch, leaveBranch } = useAuth();
  // Ro'yxat faqat varaq ochiq bo'lganda so'raladi (filial hisobida ham /branches ochiq — GET)
  const res = useResource<{ items: B[] }>(visible ? '/api/mobile/branches' : null);
  const [busy, setBusy] = useState<string | null>(null);

  const current = inBranch ? me?.stockBranch?.id ?? null : null;
  const items = (res.data?.items ?? []).filter((b) => !b.isMain);

  async function run(key: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(key);
    try {
      await fn();
      onClose();
    } catch (e) {
      Alert.alert(d.common.error, errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={h.branchSwitch} subtitle={me?.org.name} closeLabel={d.common.close}>
      <Group>
        <Cell
          icon="business"
          iconColor={c.sq.b}
          title={h.mainAccount}
          subtitle={h.mainAccountSub}
          right={!inBranch ? <Pill label={h.current} tone="br" /> : undefined}
          chevron={inBranch}
          onPress={inBranch ? () => run('main', leaveBranch) : undefined}
        />
      </Group>

      {res.loading && !res.data ? <Loading />
        : !res.data ? <ErrorState message={res.error} onRetry={res.retry} />
        : items.length === 0 ? <EmptyState icon="business-outline" title={h.noBranches} />
        : (
          <Group header={h.branches}>
            {items.map((b) => (
              <Cell
                key={b.id}
                icon="storefront"
                iconColor={c.sq.g}
                title={b.name}
                subtitle={b.address ?? undefined}
                right={b.id === current ? <Pill label={h.current} tone="br" /> : busy === b.id ? <ActivityIndicator color={c.tint} /> : undefined}
                chevron={b.id !== current && busy !== b.id}
                onPress={b.id === current ? undefined : () => run(b.id, () => enterBranch(b.id))}
              />
            ))}
          </Group>
        )}

      <Text style={{ color: c.ink3, fontSize: 13, lineHeight: 18, paddingHorizontal: 4 }}>{h.branchHint}</Text>

      {inBranch ? <Button title={h.backToMain} icon="arrow-undo" variant="tinted" full loading={busy === 'main'} onPress={() => run('main', leaveBranch)} /> : null}
    </Sheet>
  );
}
