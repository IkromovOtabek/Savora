import SystemsPanels from '@/components/super/SystemsPanels';

export const metadata = { title: 'Tizim funksiyalari — Savora' };

export default function SuperSystemsPage() {
  return (
    <>
      <div className="super-page-head">
        <div>
          <h1>Tizim funksiyalari</h1>
          <p>Cron, export va Telegram — bu yerda boshqaring. API havolalarini brauzerda ochmang.</p>
        </div>
      </div>
      <SystemsPanels />
    </>
  );
}
