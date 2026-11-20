# Savora — App Store sahifasi (App Store Connect uchun tayyor matnlar)

> Ilova: App Store Connect → Savora (Apple ID `6824531556`, bundle `uz.savora.app`).
> Matnlardagi har bir funksiya kodda bor va prod serverda ishlaydi (2026-11-20 holati). Restoran moduli
> prod'ga hali chiqmagan — shuning uchun matnda yo'q; deploy qilingach qo'shiladi.

## 1. Til va umumiy sozlamalar

App Store Connect'da **o'zbek tili yo'q**. O'zbekiston do'konida sahifa **English (U.K.)** tilida ko'rsatiladi
(boshqa til tanlab bo'lmaydi). Shuning uchun:

- **Primary Language:** English (U.K.)
- English (U.K.) maydonlariga quyidagi **o'zbekcha** matnlarni qo'ying — O'zbekistondagi foydalanuvchi aynan shuni ko'radi.
- **Category:** Business (asosiy), Productivity (qo'shimcha)
- **Price:** Free (bepul)
- **Availability:** Uzbekistan (xohlasangiz, Qozog'iston, Qirg'iziston, Tojikiston, Rossiya ham)
- **Age Rating:** barcha savollarga «None / No» → **4+**
- **Copyright:** `2026 <Ism Familiya yoki kompaniya>`

## 2. Matnlar

**Name** (30 belgi): `Savora`

**Subtitle** (30 belgi):
```
Savdo, ombor va nasiya hisobi
```

**Promotional Text** (170 belgi — ko'rikdan o'tmasdan istalgan payt almashtirsa bo'ladi):
```
Sotuv, qoldiq va qarzdorlar doim telefoningizda. Shtrix-kodni kamera bilan skanerlang, nasiyani yozing, tovaringizni Savora Market'da xaridorlarga ko'rsating.
```

**Description** (4000 belgi):
```
Savora — do'kon va kichik biznes uchun savdo, ombor va nasiya hisobini telefonda yuritish ilovasi. Sotuv, qoldiq va qarzdorlar doim qo'lingizda.

SOTUV
• Shtrix-kodni telefon kamerasi bilan skanerlab tez sotish
• To'lov turini belgilash: naqd, karta va boshqalar
• Internet uzilganda ham sotuvni yozish — aloqa tiklanganda serverga yuboriladi

NASIYA (QARZGA SOTISH)
• Qarzga sotish va qisman to'lovni qabul qilish
• Qarzdorlar ro'yxati va umumiy qarz summasi
• Qarz daftari: kimga berdingiz, kimdan oldingiz

OMBOR VA TOVARLAR
• Tovar, xizmat va to'plamlar: rasm, kategoriya, brend, yetkazib beruvchi
• Qoldiq nazorati va shtrix-kod bo'yicha qidirish
• Barkod yorlig'ini chop etish (AirPrint)
• Filiallar va filiallar o'rtasida tovar ko'chirish

KASSA VA MOLIYA
• Kassa smenalari
• Kirim-chiqim: tushum va xarajatlarni yozib borish

JAMOA
• Xodimlar va ularning ruxsatlari
• Topshiriqlar
• Bildirishnomalar

ISHLAB CHIQARISH (SEX)
• Ishbay hisobi
• Xom ashyo kirimi

SAVORA MARKET
• Tovarlaringiz Savora Market onlayn bozorida xaridorlarga ko'rinadi
• Xaridor buyurtma beradi, to'lov tovarni olganda — naqd yoki karta orqali
• Buyurtmani qabul qilish va yakunlash; tovar ombordan avtomatik ayiriladi

Ilova o'zbek va rus tillarida, yorug' va tungi mavzu bilan ishlaydi.

Boshlash uchun ilovada bepul ro'yxatdan o'ting yoki savora.uz'dagi hisobingiz bilan kiring.
```

**Keywords** (100 belgi, vergul bilan, bo'sh joysiz):
```
kassa,ombor,nasiya,qarz,savdo,dokon,sotuv,shtrix,barkod,pos,biznes,tovar,qoldiq,hisob,market,filial
```

**Support URL:** `https://savora.uz/help`
**Marketing URL:** `https://savora.uz`
**Privacy Policy URL:** `https://savora.uz/privacy`

## 3. App Review Information (Apple tekshiruvchisi uchun)

- **Sign-in required:** ✓
- **User name / Password:** demo do'kon hisobi (6-bo'limga qarang)
- **Contact:** ism, telefon, email — sizniki
- **Notes** (inglizcha yozing — tekshiruvchi uchun):

```
Savora is a point-of-sale, inventory and customer-credit app for small shops in Uzbekistan.
The interface is in Uzbek; Russian can be selected in Profile → Language.

Demo business account (pre-filled with products, sales and debtors) is provided above.
Main flows to test: Sell tab (scan a barcode with the camera or pick a product), Products, Nasiya (credit sales), Profile.

Savora Market (the first screen when not signed in) is a marketplace of physical goods from local shops.
Buyers place an order and pay the shop in person on pickup or delivery — no payments are processed in the app.
Demo buyer account: phone <BUYER_PHONE>, password <BUYER_PASSWORD>.

Account deletion:
- Business owner: Profile → Delete account.
- Buyer: Savora Market → person icon (top) → My orders → Delete account.
To test account deletion, please create a new free account (Sign up on the login screen) and delete that one —
deleting the demo business account suspends the demo shop immediately and blocks the rest of the review.

The app does not sell any digital content or subscriptions. In-app registration creates a free plan only.
Barcode label printing uses the standard iOS print dialog (AirPrint).
```

## 4. App Privacy anketasi (App Store Connect → App Privacy)

**Data used to track you:** No (reklama/analitika SDK yo'q, boshqa ilovalar bo'ylab kuzatish yo'q).

**Data collected** — har biri: *Linked to the user: Yes*, *Used for tracking: No*, *Purpose: App Functionality*:

| Kategoriya | Tur | Qayerda |
|---|---|---|
| Contact Info | Name | Ro'yxatdan o'tish (do'kon egasi, xaridor) |
| Contact Info | Phone Number | Ro'yxatdan o'tish, kirish |
| Contact Info | Physical Address | Market buyurtmasida yetkazish manzili |
| User Content | Photos or Videos | Tovar rasmi (kamera/galereya) |
| User Content | Other User Content | Tovarlar, sotuvlar, mijoz va qarz yozuvlari |
| Identifiers | User ID | Hisob identifikatori |
| Purchases | Purchase History | Savora Market buyurtmalari |

Yig'ilmaydi: joylashuv, kontaktlar, sog'liq, moliyaviy karta ma'lumoti, brauzer tarixi, qidiruv tarixi,
diagnostika/crash (SDK yo'q).

## 5. Skrinshotlar

- iPhone **6.9"** — 1320×2868 piksel, 3–10 ta. iPad shart emas (`supportsTablet: false`).
- **Tayyor:** `mobile/store/screenshots/ios-6.9/01.png … 05.png` (uslub — «Panorama», 2026-11-20 tanlangan).
  App Store Connect → iOS App → Previews and Screenshots → **6.9" Display** ga shu tartibda torting:
  01 Asosiy → 02 Sotuv → 03 Chek → 04 Qarzlar → 05 Ombor (lenta sahifadan sahifaga uzluksiz o'tadi).
- Ichidagi ekranlar — ilovaning haqiqiy ekranlari (Android emulator, lokal bazadagi «Baraka Market» demo do'koni),
  tizim qatori iOS ko'rinishiga almashtirilgan.
- Qayta yasash: `mobile/store/screenshots-src/gen.html` — matnlar `FINAL` ro'yxatida, xom ekranlar `img/`.
  Chrome bilan: `--headless=new --allow-file-access-from-files --window-size=1320,2868 --screenshot=01.png "file://…/gen.html?mode=final&s=0"`
  (`s=0…4`; `?mode=strip` — beshalasi yonma-yon ko'rinishi).

## 6. Demo hisob (siz tayyorlaysiz)

Apple tekshiruvchisi ilovani ichi to'la holda ko'rishi kerak — bo'sh do'kon rad etilishga sabab bo'lishi mumkin.

1. **Do'kon hisobi — `rami`** (2026-11-20 tanlandi): prodda sun'iy ma'lumotli kiyim do'koni (tovar, variant,
   sotuv, nasiya, daftar, 2 filial). Prodda sun'iy ma'lumot faqat dom24 va rami'da — yangi demo do'kon ochilmaydi.
   - Mobil login'da do'kon nomi (slug) so'ralmaydi — rami egasining **logini va paroli** 3-bo'limga yoziladi.
   - Yuborishdan oldin TestFlight'dagi 1.6.0 da shu login bilan kirib, tovarlar, sotuvlar va nasiya ko'rinishini tekshiring.
   - Tekshiruvchi baribir «Delete account» ni bossa, rami `suspended` bo'ladi (ma'lumot o'chmaydi) —
     super paneldan qayta faollashtiring va Telegram'dagi «Hisobni o'chirish so'rovi» xabarini e'tiborsiz qoldiring.
2. **Xaridor hisobi:** ilovada Bozor → Kirish → Ro'yxatdan o'tish (alohida telefon raqam bilan).
3. rami tarifining muddati kamida 1–2 oy oldinda bo'lsin (super panel → rami → muddat), aks holda ko'rik paytida bloklanib qoladi.

## 7. Yuborish tartibi

1. 1.6.0 build App Store Connect'ga yuklanadi (EAS) → TestFlight'da «Ready to Submit».
2. App Store → iOS App → **1.6.0** versiyasini yarating, yuqoridagi matnlar va skrinshotlarni qo'ying.
3. **Build** bo'limida 1.6.0 build'ini tanlang.
4. **Add for Review** → **Submit to App Review**. Javob odatda 1–3 kunda.
5. Tasdiqlangach: «Manually release» tanlangan bo'lsa — **Release** tugmasini o'zingiz bosasiz.
