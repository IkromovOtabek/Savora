# Yangi do'kon: birinchi 14 kun (onboarding playbook)

Tahrir: 2026-yil oktabr. Maqsad — sinov tugaguncha do'kon Savora'siz ishlay olmaydigan holatga kelsin: har kuni sotuv, nasiya hisobda, ega Telegram xabarini o'qiydi.

Kabinetdagi cheklist (`components/tenant/OnboardingChecklist.tsx`, `lib/onboardingSteps.ts`) 6 qadam: biznes turi → filial → birinchi tovar → birinchi sotuv → xodimga login → Telegram. Menejer shu qadamlarni kuzatadi.

## Kunma-kun

| Kun | Maqsad | Menejer nima qiladi | Muvaffaqiyat belgisi |
|---|---|---|---|
| 0 (ro'yxat kuni) | Kabinet ochildi | Salom xabari (Telegram), 2 daqiqalik video, qo'ng'iroq vaqtini kelishish | Biznes turi to'g'ri tanlangan |
| 1 | Filial + tovarlar | 20 daqiqalik qo'ng'iroq yoki tashrif: filial, eng ko'p sotiladigan 20 tovar | ≥20 tovar |
| 2 | Ma'lumot ko'chirish | Excel/daftar rasmini olib, tovar va qarzdorlarni yuklab berish | Faol nasiyalar kiritildi |
| 3 | Birinchi sotuv | Ega bilan birga 1 ta naqd va 1 ta nasiya sotuvi | `saleMade` ✓ |
| 4 | Telegram | Profil → Telegram ulash, ertalabki xabarni ko'rsatish | `telegramChatId` bor |
| 5 | Xodimlar | Har sotuvchiga login, huquqlarni sozlash (chegirma, bekor qilish) | ≥1 xodim logini |
| 7 | 1-hafta tekshiruvi | Qo'ng'iroq: "Nima qiyin bo'ldi?" Hisobotni birga ko'rish | Haftada ≥10 sotuv |
| 8–10 | Undirish odati | Kechikkanlar ro'yxati, "Eslatma" tugmasi, Daftar SMS | ≥1 kechikkan to'lov undirildi |
| 11 | Qiymatni ko'rsatish | "Savora bu hafta N ta to'lovni eslatdi, X so'm undirildi" xabari | Ega raqamni ko'rdi |
| 12 | Tarif tanlash | Foydalanishga qarab tarif tavsiyasi, yillik chegirma | Tarif tanlandi |
| 13 | To'lov | Rekvizit va chek yuklash bo'yicha yordam | To'lov cheki yuklandi |
| 14 | Yakun | Rahmat, referal taklifi (+1 oy), sharh so'rash (faqat rozilik bilan) | Pullik ✓ |

## Soha bo'yicha urg'u

- **Telefon / texnika:** IMEI bilan kiritish, nasiya jadvali, kredit kassa (bank), 12 oy chegarasi.
- **Mebel:** rasmli katalog, oldindan to'lov + bo'lib to'lash.
- **Oziq-ovqat, qurilish, avto qismlar, optom:** qarz daftari va SMS eslatma, tez kassa.
- **Kiyim, kosmetika:** shtrix-kod, rasmlar, inventar.
- **Restoran, xizmat:** menyu/xizmatlar ro'yxati, kunlik kassa.

## Xavf signallari (darhol qo'ng'iroq)

- 3 kun ketma-ket sotuv yo'q.
- 1-kundan keyin tovarlar < 10.
- Telegram ulanmagan va ega 5 kun kirmagan.
- Faqat admin logini ishlatiladi (xodimlar daftarda davom etmoqda).

## Muvaffaqiyat ko'rsatkichlari (14 kun)

| Ko'rsatkich | Maqsad |
|---|---|
| Aktivatsiya (3 asosiy qadam: filial, tovar, sotuv) 3 kun ichida | ≥ 70% |
| 6 qadamning hammasi 7 kun ichida | ≥ 40% |
| 2-haftada faol kunlar (sotuv bor) | ≥ 8 / 14 |
| Kiritilgan faol nasiyalar | ≥ 10 (nasiya segmentida) |
| Sinov → pullik | ≥ 35% (dala sotuvidan ≥ 50%) |

Ta'riflar — METRICS.md.
