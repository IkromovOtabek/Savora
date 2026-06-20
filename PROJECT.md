# SavdoPro — Multi-tenant SaaS savdo/nasiya boshqaruv platformasi

> Bu fayl loyiha konteksti (Claude Code uchun). Til: foydalanuvchi **o'zbekcha** gaplashadi.
> Asos: **OneNasiya** loyihasi (single-tenant) → **SavdoPro** (multi-tenant SaaS).

---

## 1. Loyiha haqida

**SavdoPro** — do'konlar uchun ombor / sotuv / nasiya / kassa boshqaruv tizimini **ijaraga beruvchi**
ko'p-ijarali (multi-tenant) SaaS platforma.

- **Katta Admin (super_admin)** — platforma egasi. Do'konlar (organization) ochadi, ijara muddatini
  boshqaradi, **barcha do'konlarni** kuzatadi.
- **Kichik Admin (admin)** — do'kon egasi. Super admindan login oladi. O'z filiallari/xodimlari uchun
  login ochadi va **faqat o'z do'koni** ma'lumotini kuzatadi (OneNasiya admin kabi).
- **Filial/Xodim (user)** — kichik admin ochadi. Mahsulot/sotuv kiritadi.

---

## 2. Asosiy arxitektura qarorlari (tasdiqlangan)

| Qaror | Tanlov |
|---|---|
| Boshlanish | OneNasiya **nusxasidan yangi loyiha** |
| Ma'lumotlar bazasi | **Har do'konga alohida DB** (database-per-tenant) |
| Tenant aniqlash | **Subdomen** (`dokon.savdopro.uz`) |
| To'lov/ijara | **Qo'lda** (super admin muddat belgilaydi) |
| Stack | Next.js 15 (App Router) + MongoDB/Mongoose + iron-session |

---

## 3. Database-per-tenant modeli

### Master DB (markaziy — `savdopro_master`)
```
Organization (do'konlar reyestri)
 ├── _id
 ├── name              # do'kon nomi
 ├── slug              # subdomen: dokon.savdopro.uz
 ├── dbName            # tenant bazasi nomi: "tenant_<slug>" yoki "tenant_<_id>"
 ├── ownerName, phone
 ├── status            # active | suspended | expired
 ├── expiresAt         # ijara muddati (qo'lda belgilanadi)
 ├── plan              # { maxFilial: number, ... }
 └── createdAt

SuperAdmin (platforma egasi)
 ├── username, password (bcrypt), tokenVersion
```

### Har do'kon uchun alohida DB (`tenant_<...>`)
```
User       # do'kon egasi (admin) + filiallar (user)
SaleRecord # OneNasiya'dagi mahsulot/sotuv yozuvlari
MonitoringHistory, Announcement, ... (OneNasiya modellari)
```

> **Muhim yutuq:** Tenant DB o'zi izolyatsiya bo'lgani uchun, ichida `organizationId` kerak EMAS —
> baza chegarasi ajratib turadi. OneNasiya modellari/so'rovlari deyarli o'zgarmaydi.

---

## 4. Tenant Connection Manager (yadro)

`lib/tenantDb.ts` — har do'kon bazasiga **keshlangan** Mongoose ulanishini boshqaradi:
- Bitta MongoDB klasteriga ulanish, `connection.useDb(dbName, { useCache: true })` orqali har
  tenant uchun alohida database.
- `getTenantConnection(dbName)` → o'sha bazaga bog'langan connection qaytaradi.
- Modellar **connection'ga** registratsiya qilinadi (global `mongoose.model` emas), masalan
  `conn.model('User', userSchema)` — chunki har connection alohida.
- `lib/masterDb.ts` — master bazaga alohida ulanish (Organization, SuperAdmin).

---

## 5. Subdomen routing (middleware)

`middleware.ts`:
1. So'rovdan `host` ni o'qiydi → subdomenni ajratadi.
2. `admin.savdopro.uz` (yoki asosiy domen) → **super admin** zonasi.
3. `dokon.savdopro.uz` → master DB'dan `Organization` ni `slug` bo'yicha topadi.
   - Topilmasa → 404 / "do'kon topilmadi".
   - `status !== active` yoki `expiresAt < now` → "muddat tugagan / to'xtatilgan" sahifasi.
   - OK bo'lsa → tenant kontekstini (orgId, dbName) header/cookie orqali uzatadi.
4. **Lokal dev:** `dokon1.localhost:3000` yoki `dokon1.lvh.me:3000` (wildcard subdomen).

---

## 6. Auth oqimi

- **Super admin** (`admin.` subdomen): master DB'da `SuperAdmin` bo'yicha tekshiriladi.
- **Do'kon foydalanuvchisi** (`dokon.` subdomen): tenant DB'dagi `User` bo'yicha tekshiriladi
  (username faqat shu do'kon ichida noyob — subdomen do'konni allaqachon aniqlagan).
- Sessiya (iron-session): `{ userId, role, organizationId, dbName }`.
- Login formasi — **POST server action** (parol hech qachon URL'da emas; OneNasiya'dagi xato bu yerda
  takrorlanmaydi: form `action={serverAction}` + progressive enhancement).

### Guard'lar (`lib/auth.ts`)
- `requireSuperAdmin()` — master, super_admin roli.
- `requireOrgAdmin()` — tenant, admin roli + do'kon faol/muddat tekshiruvi.
- `requireOrgUser()` — tenant, har qanday user + do'kon faol tekshiruvi.

---

## 7. Super Admin paneli (3-bosqich)
- **Do'kon yaratish:** Organization yozuvi + tenant DB avtomatik tayyorlanadi + birinchi `admin`
  useri (login/parol) ochiladi.
- Do'konlar ro'yxati, **muddat cho'zish**, suspend/activate.
- Barcha do'konlar bo'yicha umumiy statistika (read-only).

---

## 8. Qurilish bosqichlari

| Bosqich | Mazmun |
|---|---|
| **0** | Repo skeleti (OneNasiya'dan), master DB + tenant connection manager |
| **1** | Master modellari (Organization, SuperAdmin), subdomen middleware |
| **2** | Auth: super admin + tenant login, sessiya, guard'lar, muddat blokirovkasi |
| **3** | Super Admin paneli (do'kon CRUD, muddat, statistika) |
| **4** | OneNasiya funksiyalarini tenant kontekstiga ko'chirish (Ombor/Sotildi/Filial/Kirim-Chiqim/Monitoring/Kassa/Variant/Korzinka/Filial boshqaruvi) |
| **5** | Sayqal: tarif limitlari (maxFilial), to'lov tarixi, UI |

---

## 9. Papka tuzilmasi (rejalashtirilgan)
```
SavdoPro/
├── app/
│   ├── (super)/            # super admin zonasi (admin. subdomen)
│   ├── (tenant)/           # do'kon zonasi (dokon. subdomen) — OneNasiya sahifalari
│   ├── login/
│   ├── actions/
│   └── layout.tsx
├── lib/
│   ├── masterDb.ts         # master ulanish
│   ├── tenantDb.ts         # tenant connection manager
│   ├── models/
│   │   ├── master/         # Organization, SuperAdmin
│   │   └── tenant/         # User, SaleRecord, ... (schema'lar)
│   ├── auth.ts, session.ts
│   └── tenantContext.ts    # joriy tenant (orgId, dbName) ni olish
├── middleware.ts           # subdomen → tenant
└── PROJECT.md
```

---

## 10. Environment (.env)
```
MONGO_URI=                 # MongoDB klaster (master + tenantlar shu klasterda)
MASTER_DB_NAME=savdopro_master
SESSION_SECRET=
ROOT_DOMAIN=savdopro.uz    # subdomen ajratish uchun
NODE_ENV=
```

---

## 11. Xavfsizlik tamoyillari
- **Tenant izolatsiyasi** — foydalanuvchi hech qachon boshqa do'kon bazasiga kira olmaydi
  (sessiyadagi dbName'ga qat'iy bog'lanadi; URL'dan dbName olinmaydi).
- Login — POST server action (parol URL'da emas).
- Har so'rovda do'kon **muddat/status** tekshiriladi.
- Parollar — bcrypt.
- super_admin va tenant zonalari middleware bilan qat'iy ajratiladi.

---

## 12. Sotuvga tayyorlash bosqichi — qo'shilgan imkoniyatlar (2026-06)

> Quyidagilar clientlarga sotish uchun qo'shildi. Har biri alohida commit.

- **Object storage (Cloudflare R2)** — `lib/storage.ts`. R2 sozlangan bo'lsa rasm/fayl bulutga,
  bo'lmasa lokal `public/uploads` ga. `app/api/upload/route.ts` shuni ishlatadi.
  Env: `R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL`.
- **Audit jurnali** — `lib/models/tenant/AuditLog.ts` + `lib/audit.ts` (`recordAudit`).
  products/sales/finance/users/branches action'lariga ulangan. Ko'rish: `/app/audit` (admin).
- **Barcode** — `barcode` maydoni qidiruvga qo'shildi (`/app/products`). Kamera skaner:
  `components/ui/CameraScanButton.tsx` (BarcodeDetector API). USB/pistalet: mavjud `BarcodeInputField`.
- **Chek (80mm termal)** — `/app/sales/[id]/receipt` (oldin ham bor edi, do'kon tel + soni/narx qo'shildi).
- **Backup/restore** — `scripts/backup.mjs`, `scripts/restore.mjs`. `npm run backup` / `npm run restore`.
  Hujjat: `BACKUP.md`. Cron: har kuni 03:00 (mongodump kerak). Env: `BACKUP_DIR, BACKUP_KEEP_DAYS`.
- **Telegram parol tiklash** — do'kon Telegram'ini ulash: Kabinet → "Telegram ulash"
  (`components/tenant/TelegramConnect.tsx`) → `/start link_<orgId>` webhook → `org.telegramChatId`.
  Tiklash: login → "Parolni unutdingizmi?" → `/forgot` → yangi vaqtinchalik parol Telegram'ga.
  Env: `TELEGRAM_BOT_USERNAME` (deep link uchun). Webhook setWebhook bilan ulanadi.
- **PWA** — `public/manifest.webmanifest`, `public/sw.js` (offline), `public/offline.html`,
  `components/PWARegister.tsx` (faqat production'da SW). PWA ikonka: `public/icon-512.svg`
  (favicon esa `app/icon.svg`). `app/layout.tsx` da manifest + viewport themeColor.
- **Trial (sinov rejimi)** — `org.plan.isTrial`. Registratsiya 14 kunlik **Pro** trial yaratadi
  (`app/actions/register.ts`, env `TRIAL_DAYS=14`). `ExpiryBanner` sinov sanog'ini ko'rsatadi.
  Helperlar: `isTrialActive`, `daysUntilExpiry` (Organization.ts).
- **Super analitika** — `/super`: MRR, faol, sinovda, 7 kunda tugaydi, muddati tugagan, +shu oyda.
  "Tez orada tugaydi" jadvali.
- **Onboarding** — `lib/onboarding.ts` (`markOnboardingStep`). Flaglar haqiqiy amallarda o'rnatiladi
  (filial/mahsulot/sotuv/profil). Checklist: dashboard'dagi `OnboardingChecklist`.

### Rol modeli (2026-06, soddalashtirildi)
Endi faqat **2 xil tenant roli**: `admin` (do'kon egasi — hammasi + filiallararo hisobot) va
`user` (= **filial login**, `branchId` bilan). Alohida "xodim" akkaunti **yo'q** — filialdagi barcha
xodimlar bitta filial login/paroli bilan ishlaydi. (`createEmployeeAction`, `EmployeeForm`,
`/app/users/new|[id]`, loginsiz `branches.ts` — o'chirildi.)
- Filial yaratish: **`app/actions/filials.ts`** (filial + login birga). UI: `/app/users` (nav "Filiallar")
  → `FilialManager` — **jadval ko'rinishi** (avatar, rol, sana, tahrir/o'chirish, modal). `deleteFilialAction`
  bor (mahsulot/sotuv bo'lsa bloklaydi).
- **Markaziy ombor tushunchasi YO'Q** (OneNasiya modeli): har filial mustaqil. Mahsulot qo'shganda
  filial-login → o'z filialiga; admin → filialni tanlaydi. Boshqa filialga "Filialga berish" (transfer).
- **Scoping:** `lib/branchScope.ts` — `branchFilter(user)` (find) va `branchAggMatch(user)` (aggregate,
  ObjectId). Filial login faqat o'z filiali ko'radi: products, sales, debts, kassa, inventory, transferred
  (toBranchId), dashboard, monitoring, sales/new + lookupProductByImei. Session'ga `branchId` qo'shildi.

### Sifat/xavfsizlik (2026-06, bajarildi ✅)
- **Testlar:** Vitest + 30 unit test (`tests/`): branchScope, plans/features, sales, monitoring, slug, org.
  `npm test`. **CI:** `.github/workflows/ci.yml` (typecheck + test + build).
- **Xavfsizlik:** `SESSION_SECRET` production'da majburiy (`lib/session.ts`), login/reset **rate-limit**
  (`lib/rateLimit.ts` — in-memory). Multi-tenant izolatsiya testlandi.
- **Tuzatildi:** Sale `branchId` indeksi, `soldQuantity` nollanish bug'i, `referralCode` dup index.
- **Logger:** `lib/logger.ts` (Sentry-ga tayyor) — kritik catch'larda `logError`.
- **UX:** `app/app/loading.tsx` skeleton. Brending: paket nomi `savora`.

### Yo'l xaritasi (tashqi kalit/server kerak — keyingi bosqich)
- **Avtomatik to'lov (Payme/Click/Uzum)** — merchant kalit + webhook kerak. Hozir billing qo'lda.
  Eng katta biznes ustuvorligi.
- **Redis** — markazlashgan rate-limit (multi-instance), hot-read kesh, session store.
- **BullMQ (background jobs)** — cron skriptlar o'rniga navbat (backup, eslatma, hisobot).
- **Sentry** — `@sentry/nextjs` + DSN; `lib/logger.ts` ga ulanadi.
- **zod validatsiya** — barcha action'larga sxema (hozir qo'lda parsing).
- **Soft-delete** — o'chirish o'rniga `deletedAt` (audit kuchayadi).
- **Offline-first POS** — PWA bor; keyingisi offline sotuv + sinxronlash.
