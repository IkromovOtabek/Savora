import { useCallback, useEffect, useState } from 'react';
import { Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api, errMsg } from '@/lib/api';
import { useDebounced, usePaged } from '@/lib/hooks';
import { useTheme } from '@/lib/theme';
import { fmtMoney } from '@/lib/format';
import {
  Screen, NavBar, LargeTitle, SearchField, Group, Cell, Button, Stepper, Loading, EmptyState, ErrorState, InlineError,
} from '@/components/ui';

interface P { id: string; name: string; salePrice: number; status: string; trackQuantity: boolean; available: number }
interface B { id: string; name: string; address?: string | null; isMain: boolean }

export default function Transfer() {
  const router = useRouter();
  const { c } = useTheme();
  const params = useLocalSearchParams<{ productId?: string; name?: string; track?: string; available?: string }>();
  const [picked, setPicked] = useState<P | null>(
    params.productId && params.name
      ? { id: String(params.productId), name: String(params.name), salePrice: 0, status: 'in_stock', trackQuantity: params.track === '1', available: Number(params.available) || 1 }
      : null,
  );
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 300);
  const list = usePaged<P>(picked ? null : `/api/mobile/products?q=${encodeURIComponent(dq)}`);

  const [branches, setBranches] = useState<B[]>([]);
  const [bLoading, setBLoading] = useState(true);
  const [bError, setBError] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);

  const loadBranches = useCallback(async () => {
    setBLoading(true);
    try { setBranches((await api<{ items: B[] }>('/api/mobile/branches')).items); setBError(null); }
    catch (e) { setBError(errMsg(e)); }
    finally { setBLoading(false); }
  }, []);
  useEffect(() => { loadBranches(); }, [loadBranches]);

  async function submit() {
    if (!picked || !target) { Alert.alert('Tanlov', 'Mahsulot va filialni tanlang.'); return; }
    setBusy(true);
    try {
      const r = await api<{ toBranch: string; quantity: number }>('/api/mobile/transfer', {
        method: 'POST',
        body: { productId: picked.id, toBranchId: target, ...(picked.trackQuantity ? { qty } : {}) },
      });
      Alert.alert('Berildi', `${r.toBranch ?? 'Filial'}ga ${r.quantity ?? qty} ta berildi.`);
      router.back();
    } catch (e) { Alert.alert('Xatolik', errMsg(e)); }
    finally { setBusy(false); }
  }

  if (!picked) {
    return (
      <Screen keyboard header={<NavBar />}>
        <LargeTitle title="Filialga berish" subtitle="Qaysi mahsulot?" />
        <SearchField value={q} onChangeText={setQ} placeholder="Mahsulot nomi yoki kodi" />
        {list.loading && list.items.length === 0 ? <Loading />
          : list.error && list.items.length === 0 ? <ErrorState message={list.error} onRetry={list.retry} />
          : list.items.length === 0 ? <EmptyState icon="search" title="Mahsulot topilmadi" />
          : (
            <Group>
              {list.items.map((p) => {
                const ok = p.status === 'in_stock' && p.available > 0;
                return (
                  <Cell
                    key={p.id}
                    icon="cube"
                    iconColor={ok ? c.sq.b : c.sq.g}
                    title={p.name}
                    subtitle={p.trackQuantity ? `${fmtMoney(p.available)} dona` : undefined}
                    value={fmtMoney(p.salePrice)}
                    disabled={!ok}
                    chevron
                    onPress={() => { setPicked(p); setQty(1); }}
                  />
                );
              })}
            </Group>
          )}
        {list.loadingMore ? <ActivityIndicator color={c.tint} /> : list.hasMore ? <Button title="Ko'proq ko'rsatish" variant="plain" onPress={list.loadMore} style={{ alignSelf: 'center' }} /> : null}
      </Screen>
    );
  }

  return (
    <Screen
      header={<NavBar />}
      footer={<Button title="Berish" size="lg" full loading={busy} disabled={!target} onPress={submit} />}
    >
      <LargeTitle title="Filialga berish" />
      <Group>
        <Cell icon="cube" iconColor={c.sq.b} title={picked.name} right={<Button title="O'zgartirish" size="sm" variant="tinted" onPress={() => setPicked(null)} />} />
        {picked.trackQuantity ? <Cell title="Miqdor" right={<Stepper value={qty} onChange={setQty} min={1} max={Math.max(1, picked.available)} />} /> : null}
      </Group>

      {bLoading ? <Loading />
        : bError && branches.length === 0 ? <ErrorState message={bError} onRetry={loadBranches} />
        : branches.length === 0 ? <EmptyState icon="business-outline" title="Filial yo'q" message="Avval filial oching." />
        : (
          <Group header="Qaysi filialga?">
            {branches.map((b) => (
              <Cell
                key={b.id}
                icon="business"
                iconColor={b.isMain ? c.sq.b : c.sq.g}
                title={b.name}
                subtitle={b.isMain ? 'Asosiy filial' : b.address ?? undefined}
                checked={target === b.id}
                onPress={() => setTarget(b.id)}
              />
            ))}
          </Group>
        )}
      {bError && branches.length > 0 ? <InlineError message={bError} onRetry={loadBranches} /> : null}
    </Screen>
  );
}
