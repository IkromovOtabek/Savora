# Savora — Ishga tushirish (go-live) ro'yxati

Belgilash: `[x]`. Har bo'lim oxirida mas'ul va sana yozing. Huquqiy bandlar — **yurist bilan tekshiriladi**;
bu ro'yxat yuridik maslahat emas.

## 1. Texnik

### Infratuzilma
- [ ] Alohida VPS (Insof serveri emas — DEPLOY.md §0), ≥2 vCPU / 4 GB RAM
- [ ] DNS: `savora.uz`, `www` (+ `*.savora.uz` subdomen rejimida) → server IP
- [ ] SSH: faqat kalit, root login o'chiq, `ufw` (22/80/443), `fail2ban`, avtomatik xavfsizlik yangilanishlari
- [ ] SSL (certbot), `certbot renew --dry-run` o'tadi
- [ ] `docker compose ps` — `mongo`, `app_a`, `app_b` — `healthy`
- [ ] MongoDB porti tashqaridan yopiq (`nmap -p 27017 <IP>` → filtered/closed)

### Sozlamalar
- [ ] `.env` to'liq, `chmod 600`; `SESSION_SECRET`, `CRON_SECRET`, `TELEGRAM_WEBHOOK_SECRET` — yangi tasodifiy
- [ ] Repo'dagi `web/.env.production` da haqiqiy sir yo'q (bo'lsa — git tarixidan tozalash va kalitlarni almashtirish)
- [ ] Seed'dagi standart super admin paroli (`admin123`) o'zgartirilgan
- [ ] R2 (rasm saqlash) sozlangan yoki `uploads` volume zaxiraga kiritilgan
- [ ] `ERROR_WEBHOOK_URL` (yoki boshqa xato kanali) ulangan, sinov xatosi kelgan

### Tekshiruv
- [ ] `https://savora.uz/api/health` → `200 db: up`
- [ ] Xavfsizlik sarlavhalari: `curl -sI https://savora.uz` (HSTS, CSP, X-Frame-Options)
- [ ] Brauzer konsolida CSP xatosi yo'q: landing, login, ro'yxatdan o'tish, kabinet, sotuv, skaner (kamera), rasm yuklash, chek chop etish, `/tg`
- [ ] `robots.txt`, `sitemap.xml` to'g'ri; Google Search Console'ga sitemap yuborilgan
- [ ] OG kartochka: Telegram/Facebook'da havola ulashilganda rasm chiqadi
- [ ] PWA: Android va iOS'da "Bosh ekranga qo'shish", offline sahifa
- [ ] Telegram: `getWebhookInfo` xatosiz, Mini App (`/tg`) bot menyusidan ochiladi, hisob bog'lash ishlaydi
- [ ] Cron: 4 ta endpoint qo'lda sinaldi (`Authorization: Bearer`), crontab o'rnatilgan
- [ ] Zaxira: avtomatik (03:00) ishladi, **server tashqarisiga** ko'chiriladi, bir marta test bazaga tiklab ko'rildi
- [ ] Uzilishsiz deploy va `rollback` bir marta sinaldi
- [ ] Tashqi uptime monitoring (UptimeRobot/Better Stack) → Telegram xabar
- [ ] Mobil ilova: `EXPO_PUBLIC_API_URL=https://savora.uz`, login/sotuv ishlaydi
- [ ] Yuk sinovi (kamida 20 parallel foydalanuvchi, masalan `npx autocannon`) — javob < 1 s

## 2. Huquqiy (yurist bilan)

- [ ] **Yuridik shaxs:** MChJ yoki YaTT ro'yxatdan o'tgan; shartnomalar/oferta shu nomdan
- [ ] **Ommaviy oferta / Foydalanish shartlari** (`/terms`) — SaaS obuna, to'lov, qaytarish, javobgarlik chegarasi, nizolarni hal qilish
- [ ] **Maxfiylik siyosati** (`/privacy`) — qanday shaxsiy ma'lumot (do'kon mijozlari: F.I.Sh., telefon, pasport?, qarz) yig'iladi, maqsad, saqlash muddati, o'chirish tartibi
- [ ] **Shaxsga doir ma'lumotlar to'g'risidagi qonun (ZRU-547) — lokalizatsiya:** O'zbekiston fuqarolarining shaxsiy ma'lumotlari O'zbekiston hududidagi serverlarda saqlanishi talabi (27¹-modda). **Yurist uchun savol:** Savora do'kon mijozlari (qarzdorlar) ma'lumotini qayta ishlaydi — biz "operator"mizmi yoki do'kon operator, biz "uchinchi shaxs/qayta ishlovchi"? Server (77.83.206.235) qaysi mamlakatda? Chet el VPS/Cloudflare R2 ruxsat etiladimi yoki UZ data-markaz (Uztelecom, Billur, Ucell DC va b.) shartmi?
- [ ] **Shaxsiy ma'lumotlar bazalari davlat reyestri** — ro'yxatdan o'tish kerakmi (Personallashtirish markazi / pd.gov.uz) — yurist bilan
- [ ] **PQ-294 (2027)** — tegishli qaror talablari (muddat 2027) Savora faoliyatiga qanday ta'sir qilishi — yurist bilan aniqlashtirish va bajarish rejasi
- [ ] Nasiya/muddatli to'lov: Savora — **hisob yuritish vositasi**, kredit bermaydi; bu shartlarda aniq yozilgan (mikromoliya/litsenziya talabiga tushmaslik uchun yurist tasdig'i)
- [ ] Mijozlarga SMS eslatma yuborish uchun **rozilik** mexanizmi (do'kon zimmasida — shartlarda ko'rsatilgan)
- [ ] Shartnoma shablonlari (do'kon ↔ xaridor) — namunaviy, javobgarlik do'konda
- [ ] Savdo belgisi "Savora" — Intellektual mulk agentligida tekshiruv/ariza

## 3. Biznes

- [ ] **To'lov qabul qilish:** Payme Business va/yoki Click merchant — shartnoma, merchant ID, test → prod. (Hozir to'lov qo'lda tasdiqlanadi — avtomatlashtirish keyingi bosqich)
- [ ] Hisob-faktura / chek: soliq talablari (onlayn-KKM / virtual kassa, Soliq.uz e-faktura) — buxgalter bilan
- [ ] **SMS sender nomi (alpha-name) "Savora"** — Eskiz.uz orqali ro'yxatdan o'tkazish (bir necha kun-hafta), shablonlar moderatsiyasi
- [ ] **IT Park rezidentligi** — soliq imtiyozlari; ariza, talablar (faoliyat turi, hisobot), muddatlar
- [ ] Tariflar va bepul sinov muddati yakuniy; super panelda sozlangan
- [ ] Qo'llab-quvvatlash kanali: Telegram (@savora_support), telefon, ish vaqti; `/contact` va `/help` dolzarb
- [ ] Onboarding: birinchi 5–10 do'kon bilan shaxsan sozlash, fikr-mulohaza yig'ish
- [ ] Hodisa bo'lsa mijozlarga xabar berish kanali (Telegram kanal)
- [ ] Analitika: tashrif/ro'yxatdan o'tish konversiyasi (super panel → Tashriflar)

## 4. Chiqish kuni

- [ ] Deploy oldidan zaxira
- [ ] `./deploy/deploy.sh` → `status` → `/api/health`
- [ ] Smoke test: ro'yxatdan o'tish → do'kon yaratish → mahsulot → nasiya sotuv → to'lov → chek
- [ ] 24 soat loglar va xato kanali kuzatiladi
- [ ] RUNBOOK.md jamoaga tanish

Mas'ul: ____________ Sana: ____________
