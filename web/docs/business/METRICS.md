# Savora — asosiy ko'rsatkichlar (KPI)

Tahrir: 2026-yil oktabr. Maqsadlar — strategiya tadqiqotidagi taxminlar; pilotdan keyin yangilanadi.

## 1. Voronka

| Ko'rsatkich | Ta'rif | Maqsad | Manba |
|---|---|---|---|
| Tashrif → ro'yxat | `SiteVisit.signedUp = true` / unikal tashriflar | ≥ 3% | master DB `site_visits` |
| Lid → demo | Demo o'tkazilgan / lidlar | ≥ 30% | CRM (Sheets) |
| Demo → sinov | Ro'yxatdan o'tgan / demo | ≥ 60% | CRM + `organizations` |
| **Aktivatsiya** | 3 kun ichida `onboarding.branchCreated && productAdded && saleMade` | ≥ 70% | `organizations.onboarding` |
| To'liq onboarding | 7 kun ichida 6 qadam (`lib/onboardingSteps.ts`) | ≥ 40% | hisoblanadi |
| **Sinov → pullik** | Sinov tugagach 7 kun ichida tasdiqlangan to'lov / tugagan sinovlar | ≥ 35% | `payment_requests` (approved) |

## 2. Daromad

| Ko'rsatkich | Ta'rif | Maqsad |
|---|---|---|
| MRR | Faol pullik do'konlar oylik to'lovi yig'indisi (yillik ÷ 12) | 90-kun: ≈ 25 mln so'm |
| ARPU | MRR / pullik do'konlar | ≈ 430 000 so'm |
| NRR | (Oy boshidagi kogorta MRR + upgrade − downgrade − churn) / oy boshidagi MRR | ≥ 100% |
| Yillik ulush | Yillik to'laganlar / pullik | ≥ 25% |

## 3. Ushlab qolish

| Ko'rsatkich | Ta'rif | Maqsad |
|---|---|---|
| **Oylik churn (logo)** | Oy davomida to'lovni to'xtatgan / oy boshidagi pullik | ≤ 4–5% |
| Revenue churn | Yo'qotilgan MRR / oy boshidagi MRR | ≤ 4% |
| Haftalik faol do'kon | 7 kunda ≥ 5 sotuv qilgan / pullik | ≥ 80% |
| Xavf ostidagi do'kon | 7 kun sotuvsiz yoki 14 kun egasi kirmagan | menejerga signal |

## 4. Mijoz qiymati (Savora'ning asosiy dalili)

| Ko'rsatkich | Ta'rif | Maqsad |
|---|---|---|
| **Undirilgan nasiya** | Oy davomida nasiya sotuvlariga qo'shilgan to'lovlar yig'indisi (`sales.payments`, boshlang'ich to'lovsiz) | 12-oy: ≥ 20 mlrd so'm/oy barcha do'konlar bo'yicha |
| O'z vaqtida to'lov ulushi | Muddatida yopilgan oylar / muddati kelgan oylar (`computeInstallmentPlan`) | o'sish trendi |
| Kechikkan portfel (PAR30) | 30+ kun kechikkan qoldiq / jami nasiya qoldig'i | do'konga hisobot |
| Eslatmalar | Yuborilgan Telegram/SMS eslatmalar soni | o'sish trendi |
| 2027 muvofiqligi | 12 oydan uzun yangi nasiyalar ulushi (`installmentMonths > 12`) | 2027-01-01 dan 0% |

Oylik "ROI xabari" do'konga: "Savora bu oy N ta to'lovni eslatdi, X so'm undirildi."

## 5. Sotuv va marketing

| Ko'rsatkich | Maqsad |
|---|---|
| CAC (dala) | ≤ 1 200 000 so'm |
| CAC (Telegram Ads) | lid ≤ 40 000 so'm, pullik ≤ 700 000 so'm |
| LTV / CAC | ≥ 3 |
| Qoplash muddati | ≤ 6 oy |
| Referal ulushi yangi pulliklarda | ≥ 20% |

## 6. Mahsulot sifati

| Ko'rsatkich | Maqsad |
|---|---|
| Ishlash vaqti (uptime) | ≥ 99,5% |
| Yordamga birinchi javob | ≤ 2 soat (ish vaqtida) |
| Ma'lumot ko'chirish muddati | ≤ 2 ish kuni |

## Hisoblash eslatmalari

- Haftalik dashboard: super admin `/super/metrics` + `/super/visitors` (mavjud), qolganlari hozircha qo'lda (Sheets).
- Kelajakda: kogorta jadvali (ro'yxat oyi bo'yicha retention) va "undirilgan nasiya" kunlik agregati master DB'da.
