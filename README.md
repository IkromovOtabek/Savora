# Savora — Monorepo

Savora — O'zbekiston do'konlari uchun **multi-tenant SaaS** savdo / ombor / nasiya / kassa boshqaruv platformasi.

Bu repozitoriy ikki loyihadan iborat:

```
Savora/
├── web/        # Veb ilova — Next.js 15 (full-stack: backend + frontend)
└── mobile/     # Mobil ilova — Expo (React Native), web API'ga ulanadi
```

## web/ — Veb ilova

Next.js 15 (App Router) + React 19 + MongoDB/Mongoose + iron-session. Backend (Server Actions, API routes) va frontend bitta loyihada. Database-per-tenant (har do'konga alohida MongoDB baza).

```bash
cd web
npm install
npm run dev          # http://localhost:3000
npm run build        # ishlab chiqarish build
npm test             # vitest
```

Batafsil: [`web/PROJECT.md`](web/PROJECT.md), [`web/BACKUP.md`](web/BACKUP.md).

## mobile/ — Mobil ilova

Expo (SDK 52) + expo-router. Biznes egalari va filiallar uchun. `web/app/api/mobile/*` REST endpointlariga ulanadi.

```bash
cd mobile
npm install
npx expo start       # Expo Go bilan QR skaner qiling
```

API manzili: `mobile/app.json` → `extra.apiUrl` (yoki `EXPO_PUBLIC_API_URL`). Batafsil: [`mobile/README.md`](mobile/README.md).

## Deploy

Veb ilova `web/` papkasidan deploy qilinadi (Dockerfile, docker-compose `web/` ichida). CI (`.github/workflows/ci.yml`) `web/` da typecheck + test + build ishlatadi.
