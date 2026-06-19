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
