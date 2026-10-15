'use client';

import type { BranchCashCard } from '@/lib/cashKassa';
import NaxtKassaCards from '@/components/tenant/NaxtKassaCards';

/** Naqd kassa — hamyon ko'rinishi (NaxtKassaCards bilan bir xil dizayn) */
export default function CashKassaPanel({
  total,
  cards,
}: {
  total: BranchCashCard;
  cards: BranchCashCard[];
}) {
  return <NaxtKassaCards total={total} cards={cards} />;
}
