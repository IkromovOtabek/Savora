# Zaxira va tiklash (Backup & Restore)

SavdoPro database-per-tenant arxitekturasida ishlaydi — har do'kon alohida MongoDB bazasida.
Zaxira skripti **master DB** + **barcha tenant bazalarini** bitta urinishda saqlaydi.

## Talab

MongoDB Database Tools (`mongodump`, `mongorestore`):

```bash
# macOS
brew install mongodb-database-tools
# Ubuntu/Debian
sudo apt-get install -y mongodb-database-tools
```

## Qo'lda zaxira olish

```bash
npm run backup
```

Natija: `BACKUP_DIR/<sana_vaqt>/` papkasida har baza uchun `.gz` arxiv.
`.env` da sozlanadi:

```
BACKUP_DIR=./backups        # zaxira saqlanadigan joy
BACKUP_KEEP_DAYS=14         # bundan eski zaxiralar avtomatik o'chiriladi
```

> Tavsiya: `BACKUP_DIR` ni boshqa diskka yoki tashqi/bulut ombor (R2/S3) bilan sinxronlanadigan
> papkaga qo'ying. Bir serverda turgan zaxira — server o'lsa, zaxira ham yo'qoladi.

## Avtomatik (cron) — har kuni 03:00

```bash
crontab -e
# quyidagini qo'shing:
0 3 * * * cd /var/www/savdopro && node --env-file=.env scripts/backup.mjs >> backups/backup.log 2>&1
```

## Tiklash (restore)

⚠️ `mongorestore --drop` ishlatiladi — tiklanayotgan baza **butunlay almashtiriladi**.

```bash
# Bitta do'kon bazasini tiklash:
npm run restore -- backups/2026-06-19_03-00 tenant_dokon1

# Master bazani tiklash:
npm run restore -- backups/2026-06-19_03-00 savdopro_master

# Hammasini tiklash (ehtiyot bo'ling):
npm run restore -- backups/2026-06-19_03-00
```

## Tekshirish (tavsiya)

Oyiga bir marta zaxirani **test serverda** tiklab, ma'lumot butunligini tekshiring.
Tiklab ko'rilmagan zaxira — ishonchli zaxira emas.
