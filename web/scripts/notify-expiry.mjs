/**
 * Kunlik obuna eslatmalari (2 kun qolganda).
 * Cron: har kuni 09:00 da ishga tushiring.
 *
 *   node --env-file=.env scripts/notify-expiry.mjs
 *   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/expiry-notifications
 */
const BASE = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const SECRET = process.env.CRON_SECRET;

if (!SECRET) {
  console.error('CRON_SECRET .env da belgilanmagan');
  process.exit(1);
}

const res = await fetch(`${BASE}/api/cron/expiry-notifications`, {
  headers: { Authorization: `Bearer ${SECRET}` },
});
const data = await res.json();
console.log(res.ok ? 'OK — Eslatmalar yuborildi:' : 'XATO:', data);
process.exit(res.ok ? 0 : 1);
