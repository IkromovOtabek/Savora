# SavdoPro

Universal multi-tenant SaaS platformasi — har qanday savdo biznesi uchun modulli tizim.

Super Admin client talabiga qarab har bir biznes uchun modullarni yoqadi/o'chiradi.

## Tez boshlash

```bash
mongod --bind_ip 127.0.0.1
cp .env.example .env
npm run seed
npm run dev
```

## Localhost havolalar

| Kim | URL | Login |
|-----|-----|-------|
| Marketing | http://localhost:3000/ | — |
| Super Admin kirish | http://localhost:3000/super/login | admin / admin123 |
| Super Admin panel | http://localhost:3000/super | — |
| Biznes yaratish | http://localhost:3000/super/organizations/new | — |
| Do'kon kirish (dokon1) | http://localhost:3000/t/dokon1/login | admin / admin123 |
| Do'kon paneli | http://localhost:3000/app | login qilingan holda |

## Super Admin — modul boshqaruvi

1. http://localhost:3000/super/login — kiring
2. Biznesni tanlang → **Modullar** bo'limi
3. Client talabiga qarab checkboxlarni yoqing
4. **Saqlash** — do'konda darhol faol bo'ladi
5. O'ng panelda barcha localhost havolalar va tavsiflar ko'rsatiladi

## Modullar

| Modul | Vazifa |
|-------|--------|
| Sotuv | Naqd, qarz, nasiya, bank krediti |
| Kassa | Kunlik tushum hisoboti |
| Monitoring | Foyda va analitika |
| Ombor | Mahsulotlar, import/export |
| IMEI | Ko'p qidiruv (ixtiyoriy) |
| Mijozlar | CRM |
| Filiallar | Ko'p nuqta |
| Xodimlar | Rollar va loginlar |
| CSV export | Hisobot eksport |

## Cron

```bash
npm run expire
# yoki
curl -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/cron/expire-orgs
```
