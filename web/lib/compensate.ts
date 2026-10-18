import { logError } from './logger';

export type CompensatedStep<R> = { result: R; undo: () => Promise<void> };

export type CompensationOutcome<R> =
  | { ok: true; results: R[] }
  | { ok: false; failedIndex: number; error?: unknown };

/**
 * Ketma-ket qadamlarni bajaradi; birortasi muvaffaqiyatsiz bo'lsa (null yoki xato),
 * avval bajarilganlarini teskari tartibda bekor qiladi — "hammasi yoki hech biri".
 * Tranzaksiyasiz MongoDB (bitta server) uchun kompensatsiya usuli.
 */
export async function runWithCompensation<T, R>(
  items: readonly T[],
  step: (item: T, index: number) => Promise<CompensatedStep<R> | null>,
): Promise<CompensationOutcome<R>> {
  const done: CompensatedStep<R>[] = [];
  for (let i = 0; i < items.length; i++) {
    let res: CompensatedStep<R> | null;
    let error: unknown;
    try {
      res = await step(items[i], i);
    } catch (e) {
      res = null;
      error = e;
    }
    if (!res) {
      for (const s of [...done].reverse()) {
        try { await s.undo(); } catch (e) { logError('compensation undo failed', e); }
      }
      return { ok: false, failedIndex: i, error };
    }
    done.push(res);
  }
  return { ok: true, results: done.map((s) => s.result) };
}
