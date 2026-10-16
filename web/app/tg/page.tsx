import Script from 'next/script';
import TgEntry from './TgEntry';
import { getDict } from '@/lib/i18n/server';

export async function generateMetadata() {
  const d = await getDict();
  return { title: d.landing.tg.metaTitle };
}

/** Telegram Mini App kirish nuqtasi (savora.uz/tg). Bot ichida WebView'da ochiladi. */
export default function TgPage() {
  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      <TgEntry />
    </>
  );
}
