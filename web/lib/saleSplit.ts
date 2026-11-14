/**
 * Bir nechta tovarli sotuvni (bitta mijoz, bitta xarid) qatorlarga bo'lish — sof funksiyalar, test qilinadi.
 * Har qator alohida Sale bo'lib yoziladi (umumiy checkoutId bilan, POS'dagi kabi), shuning uchun jami summa,
 * boshlang'ich to'lov va bank ulushlari qatorlarga aniq (so'mi so'migacha) taqsimlanadi.
 */

/** Bitta qatorga tushgan bank ulushi */
export interface LineBankPart { bankName: string; amount: number }

export interface SaleLineSplit {
  total: number;
  paid: number;
  /** Faqat bank kreditida; shu qatorning qoldig'i (total − paid) bo'yicha */
  bankParts?: LineBankPart[];
}

/**
 * Butun summani og'irliklarga mutanosib bo'ladi (eng katta qoldiq usuli): yig'indi = amount,
 * og'irligi 0 bo'lgan qatorga hech narsa tushmaydi, amount ≤ yig'indi bo'lsa hech bir qator o'z og'irligidan oshmaydi.
 */
export function splitProportional(weights: number[], amount: number): number[] {
  const sum = weights.reduce((s, w) => s + Math.max(0, w), 0);
  const total = Math.max(0, Math.round(amount));
  if (weights.length === 0) return [];
  if (sum === 0) return weights.map((_, i) => (i === 0 ? total : 0));
  const exact = weights.map((w) => (Math.max(0, w) * total) / sum);
  const parts = exact.map(Math.floor);
  let rest = total - parts.reduce((s, n) => s + n, 0);
  // Kasr qismi kattasidan boshlab bittadan (teng bo'lsa — oldingi qator)
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .filter((x) => x.frac > 0)
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (rest <= 0) break;
    parts[i] += 1;
    rest -= 1;
  }
  return parts;
}

/**
 * Bank ulushlarini qatorlarga ketma-ket to'ldiradi: har qator qoldig'i (needs[i]) to'lguncha banklardan oladi.
 * Σ ulushlar = Σ needs bo'lsa — har qatorda yig'indi aynan needs[i], har bankda — o'z summasi.
 */
export function fillBankParts(needs: number[], parts: LineBankPart[]): LineBankPart[][] {
  const out: LineBankPart[][] = needs.map(() => []);
  let li = 0;
  let room = needs[0] ?? 0;
  for (const part of parts) {
    let left = part.amount;
    while (left > 0 && li < needs.length) {
      if (room <= 0) { li += 1; room = needs[li] ?? 0; continue; }
      const take = Math.min(left, room);
      const cur = out[li];
      const same = cur.find((p) => p.bankName === part.bankName);
      if (same) same.amount += take;
      else cur.push({ bankName: part.bankName, amount: take });
      left -= take;
      room -= take;
    }
  }
  return out;
}

/**
 * Sotuvni qatorlarga bo'ladi:
 * - jami summa — ro'yxat narxlari (narx × miqdor) ga mutanosib (chegirma/ustama ham shunday taqsimlanadi);
 * - boshlang'ich to'lov — qator jamilariga mutanosib (har qatorda to'langan ≤ jami);
 * - bank ulushlari — har qator qoldig'iga ketma-ket.
 */
export function splitSale(input: {
  listTotals: number[];
  total: number;
  paid: number;
  bankParts?: LineBankPart[];
}): SaleLineSplit[] {
  const totals = splitProportional(input.listTotals, input.total);
  const paids = splitProportional(totals, Math.min(input.paid, input.total));
  const rests = totals.map((t, i) => t - paids[i]);
  const banks = input.bankParts ? fillBankParts(rests, input.bankParts) : null;
  return totals.map((total, i) => ({
    total,
    paid: paids[i],
    ...(banks ? { bankParts: banks[i] } : {}),
  }));
}
