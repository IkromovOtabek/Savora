import SystemsPanels from '@/components/super/SystemsPanels';
import { PageTitle } from '@/components/super/ui';

export const metadata = { title: 'Tizimlar — Super Admin' };

export default function SuperSystemsPage() {
  return (
    <>
      <PageTitle
        title="Tizimlar"
        sub="Cron vazifalari, eksport va Telegram — shu yerdan boshqaring. API havolalarini brauzerda ochmang."
      />
      <SystemsPanels />
    </>
  );
}
