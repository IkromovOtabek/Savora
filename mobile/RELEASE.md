# Savora Mobile — TestFlight va do'konlarga chiqarish

Qisqa lug'at (birinchi marta uchrashganlar uchun):

- **EAS Build** — Expo'ning bulutli yig'uvchisi. Kodingizni Expo serveriga yuboradi, u yerda iOS `.ipa` / Android `.aab` yig'iladi. Mac va Xcode shart emas.
- **TestFlight** — Apple'ning beta-test ilovasi. App Store'ga chiqishdan oldin ilovani 100 tagacha ichki va 10 000 tagacha tashqi testerga tarqatish mumkin.
- **App Store Connect (ASC)** — Apple'ning ilova boshqaruv paneli: ilova yozuvi, TestFlight, ko'rikka yuborish.
- **Imzo (signing)** — Apple har bir buildni sertifikat + provisioning profile bilan imzolashni talab qiladi. EAS buni o'zi yaratadi va o'zida saqlaydi.
- **ASC API kaliti** — Apple parolisiz, avtomatik yuborish (CI) uchun kalit. EAS'da saqlanadi.

Loyiha: `@otabekikromov/savora-mobile` → https://expo.dev/accounts/otabekikromov/projects/savora-mobile
Bundle ID: `uz.savora.app` (iOS va Android bir xil).

---

## Nima tayyor (repo'da)

- `app.json`: ikonka, splash, `bundleIdentifier`, `ITSAppUsesNonExemptEncryption=false` (export-compliance savoli chiqmaydi), faqat kamera ruxsati (mikrofon yo'q), iPad o'chirilgan (iPad skrinshotlari talab qilinmaydi).
- `eas.json`: `production` (store build, build raqami avtomatik oshadi), `preview` (ichki tarqatish, Android APK), `preview-simulator`, `development`.
- `assets/`: `icon.png`, `adaptive-icon.png`, `splash-icon.png`, `android-icon-monochrome.png` — brend belgisidan `assets/make-icons.py` bilan yaratilgan (`npm run icons`).
- CI: `.github/workflows/mobile-release.yml` — GitHub'dan bir tugma bilan build + TestFlight.

## Bir martalik tayyorgarlik (siz, ~30 daqiqa)

### 1. Apple tomonida (developer.apple.com / appstoreconnect.apple.com)

1. Apple Developer Program a'zoligi faol (to'langan) — **bor**.
2. App Store Connect → **My Apps → + → New App**:
   - Platform: iOS; Name: `Savora`; Primary language: Uzbek (yo'q bo'lsa Russian/English);
   - Bundle ID: `uz.savora.app` — ro'yxatda bo'lmasa, EAS birinchi buildda o'zi yaratadi (2-qadamdan keyin qaytib tanlaysiz);
   - SKU: `savora-mobile`.
3. **ASC API kaliti** (CI'dan avtomatik yuborish uchun): Users and Access → Integrations → App Store Connect API → **Generate API Key**, rol: *App Manager*. `.p8` faylni yuklab oling (bir marta beriladi), **Issuer ID** va **Key ID** ni yozib qo'ying. Faylni git'ga qo'ymang (`.gitignore`da `*.p8` bor).

### 2. Birinchi build — lokalda, interaktiv (shu Mac'da)

```bash
cd mobile
npm install -g eas-cli      # 25.x
eas login                   # otabekikromov
eas build -p ios --profile production
```

EAS so'raydi:
- *Apple ID bilan kirish* → ha, Apple ID + parol (2FA kodi). Bu faqat sertifikat yaratish uchun; parol saqlanmaydi.
- *Generate a new Apple Distribution Certificate?* → **Yes**
- *Generate a new Apple Provisioning Profile?* → **Yes**
- Push notifications kaliti so'rasa → **No** (hozircha ishlatilmaydi).

Natija: imzo kalitlari EAS'da saqlanadi, build ~15–25 daqiqa. Holat: `eas build:list` yoki expo.dev.

### 3. Birinchi submit — ASC API kalitini EAS'ga saqlash

```bash
eas submit -p ios --latest
```

- *How would you like to upload?* → **App Store Connect API Key**
- Key ID, Issuer ID, `.p8` fayl yo'li → kiriting. EAS: *Save for future submissions?* → **Yes**.
- ASC App ID so'rasa → App Store Connect'dagi ilova sahifasida *App Information → Apple ID* (raqam).

Shundan keyin build va submit **parolsiz, CI'dan** ishlaydi.

### 4. TestFlight'da ko'rish

App Store Connect → Savora → **TestFlight**. Build "Processing" (5–30 daqiqa) → "Ready to Test".
- **Internal Testing** → guruh yarating → o'zingizni va jamoani qo'shing → telefonda TestFlight ilovasida ochiladi. Ko'rik shart emas.
- **External Testing** (mijozlar) → Apple'ning qisqa ko'rigi (odatda 1 kun), *Test Information*da demo login kerak.

## Har keyingi reliz (2 daqiqa)

1. `mobile/app.json` → `version` ni oshiring (masalan `1.0.1`). Build raqami avtomatik.
2. Commit + push `main`.
3. GitHub → **Actions → Mobile release → Run workflow** (iOS, production, submit ✓)
   yoki `git tag mobile-v1.0.1 && git push origin mobile-v1.0.1`.
4. 30–40 daqiqadan keyin TestFlight'da yangi build.

Lokal muqobil: `npm run build:ios` → `npm run submit:ios`.

## App Store'ga (TestFlight'dan keyin) — kerak bo'ladi

- Skrinshotlar: iPhone 6.7" (1290×2796) va 6.5" (1242×2688) — kamida 3 tadan.
- Tavsif, kalit so'zlar, qo'llab-quvvatlash URL (`https://savora.uz/help`), **maxfiylik siyosati URL** (`https://savora.uz/privacy`).
- **App Privacy** anketasi: yig'iladigan ma'lumot — login/identifikator, savdo ma'lumotlari (biznes), "linked to user", tracking yo'q.
- **Demo hisob** ko'rik uchun (App Review Information): ishlaydigan login + parol, ichida namunaviy ma'lumot bo'lsin.
- Ilova hisob yaratmaydi (faqat kirish) — Apple'ning "akkauntni o'chirish" talabi tegishli emas; lekin tavsifda "hisob veb-saytda ochiladi" deb yozing.
- Yosh reytingi: 4+. Kategoriya: Business.

## Android (Play Console) — xuddi shu yo'l

```bash
eas build -p android --profile production   # birinchi marta keystore'ni EAS yaratadi → Yes
eas submit -p android --latest              # Google Service Account JSON so'raydi (Play Console → API access)
```
`eas.json`da Play track `internal`, holat `draft` — avval ichki test, keyin Console'dan production'ga ko'tariladi.

## Saytga joylash (savora.uz → «Mobil ilova» tugmalari)

Barqaror havolalar: **https://savora.uz/download/android** (APK) va **https://savora.uz/download/ios** (TestFlight/App Store'ga yo'naltiradi). Landing tugmalari shularga ishora qiladi; manba bo'lmasa tugma «Tez kunda».

> EAS artefakt havolalari (`expo.dev/artifacts/...apk`) **~14 kundan keyin o'chadi** (404) — saytga to'g'ridan-to'g'ri qo'ymang. APK serverda saqlanadi.

**Android (har APK relizda):**

1. Mac'da: `cd mobile && npx --yes eas-cli@latest build -p android --profile preview` → oxirida `.apk` havolasi chiqadi.
2. Serverda (havola 14 kun ichida ishlaydi; `mv` — yarim yozilgan faylni hech kim olmasligi uchun):
   ```bash
   mkdir -p /root/savora-downloads
   curl -fL -o /root/savora-downloads/savora.apk.tmp "<EAS .apk havolasi>"
   mv /root/savora-downloads/savora.apk.tmp /root/savora-downloads/savora.apk
   ```
3. Faqat birinchi marta: `web/.env` → `MOBILE_DOWNLOADS_DIR=/root/savora-downloads` (eski `MOBILE_ANDROID_URL` ni bo'shating), so'ng `pm2 reload savora-b && sleep 10 && pm2 reload savora-a`. Keyingi relizlarda faylni almashtirish kifoya — reload ham shart emas.

Papka repo va `web/public` dan **tashqarida** bo'lsin (deploy uni o'chirmasin, git'ga tushmasin).

**iPhone (bir marta):** App Store Connect → Savora → TestFlight → **External Testing** → guruh yarating → buildni qo'shing → Apple beta ko'rigiga yuboring (demo login kerak, odatda 1 kun) → **Enable Public Link** → `https://testflight.apple.com/join/...` havolani `web/.env` → `MOBILE_IOS_URL=` ga yozing → `pm2 reload`. App Store'ga chiqqach shu qiymatni App Store havolasiga almashtirasiz.

**Tekshiruv:**
```bash
curl -sI https://savora.uz/download/android | grep -iE "^HTTP|content-type|content-length"   # 200, application/vnd.android.package-archive
curl -sI https://savora.uz/download/ios | grep -iE "^HTTP|location"                          # 302 → testflight.apple.com
```

## Tez-tez uchraydigan muammolar

| Belgi | Sabab / yechim |
|---|---|
| `Missing Compliance` TestFlight'da | `usesNonExemptEncryption=false` bor — yangi buildlarda chiqmaydi. |
| Build "Processing"da qotib qoldi | Apple tomonida 1 soatgacha bo'lishi mumkin; email keladi. |
| `eas build` CI'da Apple login so'rayapti | 2-qadam (lokal interaktiv build) bajarilmagan — kalitlar EAS'da yo'q. |
| Submit CI'da "ascApiKey" so'rayapti | 3-qadamda *Save for future* → Yes qilinmagan; `eas credentials -p ios` → App Store Connect API Key → qo'shing. |
| Ilova serverga ulanmayapti | `EXPO_PUBLIC_API_URL=https://savora.uz` (eas.json `base.env`) va server `/api/mobile/*` ishlayotganini tekshiring. |
