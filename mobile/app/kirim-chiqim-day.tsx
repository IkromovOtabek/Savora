import { useState } from 'react';
import { DayFilter, DayStats, DayDetails, useDayFlow } from '@/components/DayFlow';
import { useDict } from '@/lib/i18n';
import { toDayKey, type DayKey } from '@/lib/homePeriod';
import { Screen, NavBar, LargeTitle, Loading, ErrorState, InlineError, CacheStamp } from '@/components/ui';

/**
 * Kunlik kirim-chiqim — tanlangan kundagi barcha pul harakati (web Kassa → «Kirim-chiqim» bilan bir manba):
 * sotuv va qarz/nasiya to'lovlari, bank tushumi, kirim/xarajatlar, qaytarishlar. Filial login — o'z filiali.
 */
export default function KirimChiqimDay() {
  const k = useDict().dayFlow;
  const [day, setDay] = useState<DayKey>(() => toDayKey(new Date()));
  const { res, data } = useDayFlow(day);

  return (
    <Screen header={<NavBar />} refreshing={res.refreshing} onRefresh={res.refresh} gap={14}>
      <LargeTitle title={k.title} subtitle={data ? (data.scoped ? k.subBranch : k.subAll) : undefined} />
      <DayFilter day={day} onChange={setDay} />
      {!data ? (
        res.error && !res.loading ? <ErrorState message={res.error} onRetry={res.retry} /> : <Loading />
      ) : (
        <>
          <CacheStamp of={res} />
          {res.error ? <InlineError message={res.error} onRetry={res.refresh} /> : null}
          <DayStats data={data} />
          <DayDetails data={data} />
        </>
      )}
    </Screen>
  );
}
