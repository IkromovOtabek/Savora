import Script from 'next/script';
import TgEntry from './TgEntry';

export const metadata = { title: 'Savora — Telegram' };

/** Telegram Mini App kirish nuqtasi (savora.uz/tg). Bot ichida WebView'da ochiladi. */
export default function TgPage() {
  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      <TgEntry />
    </>
  );
}
