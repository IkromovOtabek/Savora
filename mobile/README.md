# Savora Mobile

Savora (POS / ombor / nasiya savdo) tizimining **native mobil ilovasi** — biznes egalari va filiallar uchun. Expo (SDK 52) + expo-router v4 asosida qurilgan.

## Imkoniyatlar (v1.0)

- **Kirish** — do'kon manzili (slug) + login + parol orqali. Token `expo-secure-store` da xavfsiz saqlanadi.
- **Asosiy** — bugungi sotuvlar, tushum, ombordagi mahsulot, jami qarzdorlik (filialga moslangan). Obuna muddati ogohlantirishi.
- **Ombor** — mahsulotlar ro'yxati, qidiruv (nomi/IMEI/barcode), cheksiz sahifalash, narx va qoldiq.
- **Kabinet** — profil, obuna holati, tizimdan chiqish.

Ma'lumotlar veb-backenddagi `/api/mobile/*` endpointlaridan olinadi (xuddi sayt bilan bir xil baza, bir xil filialga bo'linish mantig'i).

## Ishga tushirish

```bash
cd Savora-mobile
npm install
npx expo start
```

So'ng telefonda **Expo Go** ilovasini oching va QR kodni skaner qiling (yoki `i` / `a` bilan simulyatorda).

## API manzilini sozlash

Ilova standart holda `https://savora.uz` ga ulanadi. O'zgartirish uchun:

- **Doimiy:** `app.json` → `expo.extra.apiUrl` ni o'zgartiring.
- **Vaqtincha (dev):** ishga tushirishdan oldin `EXPO_PUBLIC_API_URL` muhit o'zgaruvchisini bering:
  ```bash
  EXPO_PUBLIC_API_URL=http://192.168.x.x:3000 npx expo start
  ```
  > Lokal backendga ulanayotganda `localhost` emas, kompyuteringizning **LAN IP** manzilini ishlating (telefon alohida qurilma).

## Build (APK / IPA)

```bash
npm install -g eas-cli
eas login
eas build -p android --profile preview   # APK
eas build -p ios                          # IPA (Apple Developer hisobi kerak)
```

## Tuzilma

```
Savora-mobile/
├── app/
│   ├── _layout.tsx          # root: AuthProvider + Stack
│   ├── index.tsx            # auth bo'yicha redirect
│   ├── login.tsx            # kirish ekrani
│   └── (tabs)/
│       ├── _layout.tsx      # tab navigator (guard)
│       ├── index.tsx        # Asosiy (dashboard)
│       ├── products.tsx     # Ombor
│       └── profile.tsx      # Kabinet
├── lib/
│   ├── api.ts               # fetch wrapper + token saqlash
│   ├── auth.tsx             # AuthProvider / useAuth
│   └── theme.ts             # ranglar + fmtSum
└── app.json
```

## Backend (Savora repo) tomonidagi endpointlar

- `POST /api/mobile/auth/login` — `{ slug, username, password }` → `{ token, user, org }`
- `GET  /api/mobile/me` — joriy foydalanuvchi + obuna + modullar
- `GET  /api/mobile/summary` — dashboard statistikasi
- `GET  /api/mobile/products?q=&page=` — mahsulotlar (qidiruv + sahifalash)

Avtorizatsiya: `Authorization: Bearer <token>` (iron-session sealed, 30 kun).
