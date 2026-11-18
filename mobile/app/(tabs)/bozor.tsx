import { Catalog } from '@/components/market/Catalog';
import { useMarketDict } from '@/lib/marketI18n';

/**
 * Biznes foydalanuvchisi uchun «Bozor» tabi — Savora Market katalogi (xaridor sifatida).
 * Fayl nomi «market» emas: (tabs) guruhi URL'ga qo'shilmaydi va /market (app/market) bilan to'qnashardi.
 */
export default function MarketTab() {
  const m = useMarketDict();
  return <Catalog title={m.brand} subtitle={m.tagline} />;
}
