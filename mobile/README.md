# Savora Mobile

Savora (POS / ombor / nasiya savdo) tizimining **native mobil ilovasi** — biznes egalari va filiallar uchun. Expo (SDK 52) + expo-router v4. Dizayn: **jonli** — rangli KPI plitkalari va tez amallar.

## Imkoniyatlar (v1.0)

- **Kirish** — faqat **login + parol** (slug shart emas; username global registrdan do'konni topadi). Token `expo-secure-store` da xavfsiz saqlanadi.
- **Asosiy** — rangli plitkalar: bugungi tushum, bugungi sotuv, qarzdorlik, ombor. Tez amallar + so'nggi sotuvlar. Obuna muddati ogohlantirishi.
- **Ombor** — mahsulotlar (faqat qoldiq), qidiruv (nom/IMEI/barcode), sahifalash.
- **Sotuvlar** — barcha / qarzdor filtri, summa va qoldiq.
- **Nasiya** — bo'lib to'lash savdolari: oy, qoldiq, muddat, holat (To'landi / Faol / Muddat o'tgan).
- **Kabinet** — profil, obuna holati, chiqish.

Ma'lumotlar veb-backenddagi `/api/mobile/*` dan olinadi (sayt bilan bir baza, bir xil filialga bo'linish).

## Ishga tushirish (dev)

```bash
cd mobile
npm install
EXPO_PUBLIC_API_URL=http://192.168.x.x:3000 npx expo start
```

Telefonda **Expo Go** ni oching, QR kodni skaner qiling (yoki `i` / `a` bilan simulyatorda).

> Lokal backendga ulanayotganda `localhost` emas, kompyuteringizning **LAN IP** manzilini bering (telefon alohida qurilma). Backend ishlab turishi kerak: `cd ../web && npm run dev`.

## API manzili

- Doimiy (prod): `app.json` → `expo.extra.apiUrl` (hozir `https://savora.uz`).
- Vaqtincha: `EXPO_PUBLIC_API_URL` muhit o'zgaruvchisi.

## Production — App Store + Play Market

### 1. Tayyorgarlik
- **Ikonka va splash** qo'shing: `assets/icon.png` (1024×1024), `assets/adaptive-icon.png` (Android), `assets/splash.png`. `app.json` da yo'llarni ko'rsating.
- `app.json`: `version`, iOS `bundleIdentifier` = `uz.savora.app`, Android `package` = `uz.savora.app` (tayyor).
- `expo.extra.apiUrl` production domeniga ishora qilsin.

### 2. EAS build
```bash
npm install -g eas-cli
eas login
eas build:configure          # projectId ni app.json ga yozadi
eas build -p android --profile production   # AAB (Play uchun)
eas build -p ios --profile production       # IPA (App Store uchun)
```
> iOS uchun **Apple Developer** ($99/yil), Android uchun **Google Play Console** ($25 bir marta) hisobi kerak.

### 3. Do'konga yuborish
```bash
eas submit -p android --latest   # Play Console'ga
eas submit -p ios --latest       # App Store Connect'ga
```
So'ng har do'konning konsolida ma'lumot (skrinshot, tavsif, maxfiylik siyosati) to'ldirilib, ko'rikka yuboriladi.

## Tuzilma

```
mobile/
├── app/
│   ├── _layout.tsx          # root: AuthProvider + Stack
│   ├── index.tsx            # auth bo'yicha redirect
│   ├── login.tsx            # kirish (slug'siz)
│   └── (tabs)/
│       ├── _layout.tsx      # 5 tab + guard
│       ├── index.tsx        # Asosiy (jonli dashboard)
│       ├── products.tsx     # Ombor
│       ├── sales.tsx        # Sotuvlar
│       ├── nasiya.tsx       # Nasiya
│       └── profile.tsx      # Kabinet
├── lib/  (api.ts · auth.tsx · theme.ts)
├── app.json · eas.json
```

## Backend endpointlar (Savora web)

- `POST /api/mobile/auth/login` — `{ username, password, slug? }` → `{ token, user, org }` (slug'siz)
- `GET  /api/mobile/me` — foydalanuvchi + obuna + modullar
- `GET  /api/mobile/summary` — dashboard statistikasi
- `GET  /api/mobile/products?q=&page=` — mahsulotlar (faqat qoldiq)
- `GET  /api/mobile/sales?type=all|debt|installment&page=` — sotuvlar / qarzdorlik / nasiya

Avtorizatsiya: `Authorization: Bearer <token>`.
