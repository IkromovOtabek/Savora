# Savora Mobile

Savora (POS / ombor / nasiya savdo) tizimining **native mobil ilovasi** — biznes egalari va filiallar uchun. Expo (SDK 54) + expo-router v6. Dizayn: **jonli** — rangli KPI plitkalari va tez amallar.

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

## Production — TestFlight / App Store / Play Market

Batafsil qadam-baqadam qo'llanma: [`RELEASE.md`](RELEASE.md). Qisqacha:

```bash
npm run build:ios      # eas build -p ios --profile production (birinchi marta Apple ID so'raydi)
npm run submit:ios     # TestFlight'ga (birinchi marta ASC API kalitini so'raydi, keyin saqlaydi)
```
GitHub'dan: Actions → **Mobile release** → Run workflow. Ikonkalar: `assets/` (`npm run icons` qayta yaratadi).

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
├── lib/  (api.ts · auth.tsx · theme.ts · format.ts · hooks.ts)
├── assets/  (icon · adaptive-icon · splash-icon · make-icons.py)
├── app.json · eas.json · RELEASE.md
```

## Backend endpointlar (Savora web)

- `POST /api/mobile/auth/login` — `{ username, password, slug? }` → `{ token, user, org }` (slug'siz)
- `GET  /api/mobile/me` — foydalanuvchi + obuna + modullar
- `GET  /api/mobile/summary` — dashboard statistikasi
- `GET  /api/mobile/products?q=&page=` — mahsulotlar (faqat qoldiq)
- `GET  /api/mobile/sales?type=all|debt|installment&page=` — sotuvlar / qarzdorlik / nasiya

Avtorizatsiya: `Authorization: Bearer <token>`.
