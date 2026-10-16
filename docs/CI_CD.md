# Savora — CI/CD

GitHub Actions. Fayllar: `.github/workflows/`.

| Workflow | Qachon | Nima qiladi |
|---|---|---|
| `ci.yml` — **CI** | har push/PR `main`ga | web: typecheck + vitest + `next build`; mobile: typecheck + expo-doctor; Docker image yig'iladi (push qilinmaydi) |
| `mobile-release.yml` — **Mobile release** | qo'lda (Actions → Run workflow) yoki teg `mobile-v*` | EAS Build (iOS/Android) va ixtiyoriy TestFlight / Play'ga submit |

## Sirlar va o'zgaruvchilar

GitHub → repo → **Settings → Secrets and variables → Actions**.

### Mobile release

| Nomi | Turi | Qayerdan |
|---|---|---|
| `EXPO_TOKEN` | Secret | https://expo.dev/accounts/otabekikromov/settings/access-tokens → *Create token* (nomi: `github-actions`) |

Apple sertifikati, provisioning profile va App Store Connect API kaliti **EAS'da** saqlanadi — GitHub'ga qo'yilmaydi.
Ular bir marta lokal interaktiv `eas build` / `eas submit` bilan yaratiladi: [`mobile/RELEASE.md`](../mobile/RELEASE.md).

### Web deploy (hozircha qo'lda)

Web `web/deploy/deploy.sh` bilan serverda deploy qilinadi (uzilishsiz, rollback bilan): [`web/docs/DEPLOY.md`](../web/docs/DEPLOY.md).
Avtomatik deploy job'i CI'ga **ataylab qo'shilmagan** — prod server (77.83.206.235) hali sozlanmagan va SSH kaliti yo'q.
Server tayyor bo'lgach qo'shish rejasi:

1. Serverda deploy uchun alohida SSH kalit (faqat `savora` foydalanuvchisi, `authorized_keys`da `command=` cheklovi bilan).
2. GitHub sirlar: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`; o'zgaruvchi `DEPLOY_ENABLED=true` (o'chirish uchun `false`).
3. `ci.yml`ga `deploy` job: `needs: [web, docker]`, faqat `main`ga push, GitHub *environment* `production` (kerak bo'lsa qo'lda tasdiq), SSH orqali `cd /opt/savora/web && ./deploy/deploy.sh`, so'ng `https://savora.uz/api/health` tekshiruvi.

## Mobil reliz oqimi

```
app.json version ↑ → push main → Actions: Mobile release (ios, production, submit ✓)
   └─ GitHub runner: npm ci → typecheck → expo-doctor → eas build --auto-submit --no-wait
        └─ Expo serveri: build (~20 daq) → App Store Connect'ga yuklaydi
             └─ TestFlight: Processing (5–30 daq) → Ready to Test
```

`--no-wait` — GitHub runner build tugashini kutmaydi (daqiqalar sarflanmaydi); holat expo.dev'da.

## EAS limitlari

Expo bepul reja: oyiga 30 build (shundan iOS 15 tagacha), navbat sekinroq. Shuning uchun har push'da avtomatik build **yo'q** — faqat qo'lda yoki teg bilan.
Builds: https://expo.dev/accounts/otabekikromov/projects/savora-mobile/builds

## Lokal ekvivalentlar

```bash
# CI bilan bir xil tekshiruv
cd web    && npm run typecheck && npm test && npm run build
cd mobile && npm run typecheck && npm run doctor

# Reliz
cd mobile && npm run build:ios && npm run submit:ios
```
