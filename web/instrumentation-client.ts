/**
 * Brauzer tomoni instrumentation (Next.js 15) — sahifa yuklanishida bir marta.
 * Sentry FAQAT NEXT_PUBLIC_SENTRY_DSN berilganda (build vaqtida) dinamik yuklanadi —
 * aks holda bundle'ga qo'shimcha kod tushmaydi. Faqat xatolar (replay/tracing yo'q).
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  import('@sentry/nextjs')
    .then((Sentry) => {
      Sentry.init({
        dsn,
        environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
        tracesSampleRate: 0,
        sendDefaultPii: false,
      });
    })
    .catch(() => {
      /* Sentry yuklanmasa — ilova ishlashda davom etadi */
    });
}
