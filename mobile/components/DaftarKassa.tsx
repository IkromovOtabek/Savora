import { useResource } from '@/lib/hooks';
import { useTheme } from '@/lib/theme';
import { useDict } from '@/lib/i18n';
import { Group, Cell } from '@/components/ui';

export type KassaAnswer = 'yes' | 'no' | null;
export interface KassaMeta { enabled: boolean; branches: { id: string; name: string }[] }

/**
 * Daftar ↔ kassa (server: web/lib/daftarOps.ts). Kassa moduli yoqilganmi va admin uchun filiallar.
 * Eski server `kassa` qaytarmaydi — unda savol ko'rsatilmaydi (kassaga yozilmaydi).
 */
export function useKassaMeta(): { meta: KassaMeta | null; loading: boolean } {
  const res = useResource<{ kassa?: KassaMeta }>('/api/mobile/daftar?meta=1');
  return { meta: res.data ? (res.data.kassa ?? { enabled: false, branches: [] }) : null, loading: res.loading };
}

/** Saqlashdan oldin: javob berilganmi, kerak bo'lsa filial tanlanganmi (xato matni yoki null) */
export function kassaError(
  meta: KassaMeta | null, answer: KassaAnswer, branchId: string | null,
  k: { kassaRequired: string; kassaBranchRequired: string },
): string | null {
  if (!meta?.enabled) return null;
  if (!answer) return k.kassaRequired;
  if (answer === 'yes' && meta.branches.length > 1 && !branchId) return k.kassaBranchRequired;
  return null;
}

/** Serverga yuboriladigan maydonlar */
export function kassaBody(meta: KassaMeta | null, answer: KassaAnswer, branchId: string | null) {
  if (!meta?.enabled) return {};
  const toKassa = answer === 'yes';
  const kassaBranchId = toKassa ? (meta.branches.length === 1 ? meta.branches[0].id : branchId) : null;
  return { toKassa, ...(kassaBranchId ? { kassaBranchId } : {}) };
}

/**
 * «Kassaga qo'shilsinmi?» — majburiy savol, oldindan tanlanmaydi. «Ha» va bir nechta filial bo'lsa — filial.
 */
export function KassaChoice({
  meta, question, yesLabel, answer, onAnswer, branchId, onBranch, error,
}: {
  meta: KassaMeta | null;
  question: string;
  yesLabel: string;
  answer: KassaAnswer;
  onAnswer: (a: 'yes' | 'no') => void;
  branchId: string | null;
  onBranch: (id: string) => void;
  /** Saqlashga urinilgandan keyin ko'rsatiladigan xato */
  error?: string | null;
}) {
  const { c } = useTheme();
  const k = useDict().daftar;
  if (!meta?.enabled) return null;
  const pickBranch = answer === 'yes' && meta.branches.length > 1;
  return (
    <>
      <Group header={question} footer={!pickBranch && error ? error : undefined}>
        <Cell icon="wallet" iconColor={c.sq.g} title={yesLabel} checked={answer === 'yes'} onPress={() => onAnswer('yes')} />
        <Cell icon="person" iconColor={c.sq.b} title={k.kassaNo} checked={answer === 'no'} onPress={() => onAnswer('no')} />
      </Group>
      {pickBranch ? (
        <Group header={k.kassaBranch} footer={error ?? undefined}>
          {meta.branches.map((b) => (
            <Cell key={b.id} icon="business" iconColor={c.sq.b} title={b.name} checked={b.id === branchId} onPress={() => onBranch(b.id)} />
          ))}
        </Group>
      ) : null}
    </>
  );
}
