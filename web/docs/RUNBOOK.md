# Savora — Hodisalar qo'llanmasi (Runbook)

Har hodisada tartib: **1) aniqlash → 2) ta'sirni kamaytirish → 3) sababni tuzatish → 4) qayd qilish.**
Barcha buyruqlar serverda, `/opt/savora/web` papkasidan. Deploy tafsilotlari: [DEPLOY.md](./DEPLOY.md).

## Tezkor diagnostika (birinchi 2 daqiqa)

**Avval panel:** `https://savora.uz/super/monitoring` — server (RAM/CPU/disk), MongoDB (ping, ulanishlar, hajm),
zaxira yoshi, xavfsizlik auditi, login/brute-force hodisalari, server xatolari jurnali, cron tarixi, Telegram webhook.
Sahifa ochilmasa (ilova yiqilgan) — quyidagi buyruqlar:

```bash
cd /opt/savora/web
./deploy/deploy.sh status                       # konteynerlar + health + oxirgi relizlar
curl -s https://savora.uz/api/health            # tashqaridan (nginx orqali)
curl -s http://127.0.0.1:3001/api/health?live=1 # nusxa tirikmi
docker stats --no-stream                        # CPU/RAM
df -h / && free -h
docker compose logs --since 15m app_a app_b | grep '"level":"error"' | tail -30
sudo tail -50 /var/log/nginx/savora.error.log
```

| Belgi | Ehtimoliy sabab | Bo'lim |
|---|---|---|
| `/api/health` → 503 `db: down` | MongoDB to'xtagan / disk to'la | 1 |
| 502 Bad Gateway | ikkala ilova nusxasi ham ishlamayapti | 3, 4 |
| Telegram bot javob bermaydi | webhook xatosi | 2 |
| Sekin, timeout | yuqori yuk / RAM | 3 |
| Deploy'dan keyin xato | yangi relizdagi bug | 4 |
| Server ishga tushmaydi, logda "muhit sozlamalarida xato" | `.env` | 5 |

---

## 1. Baza (MongoDB) ishlamayapti

**Belgilar:** `/api/health` → `503 {"db":"down"}`, sahifalar 500, logda `MongoServerSelectionError`.

```bash
docker compose ps mongo
docker compose logs --tail=100 mongo
df -h /                        # disk to'la bo'lsa Mongo yozolmaydi
docker compose restart mongo
# 30 s kuting:
curl -s http://127.0.0.1:3001/api/health
```
- **Disk to'la:** `docker system prune -f` (ishlatilmagan image'lar), eski `backups/` ni tashqariga ko'chirib o'chiring, `journalctl --vacuum-size=200M`.
- **RAM yetmaydi (OOM):** `dmesg -T | grep -i oom`. `.env` da `MONGO_CACHE_GB=0.25`, `docker compose up -d mongo`.
- **Ma'lumot buzilgan (Mongo ishga tushmaydi):** to'xtang va avval volume nusxasini oling (nom: `docker volume ls`):
  `docker run --rm -v web_mongo_data:/d -v /var/backups:/b alpine tar czf /b/mongo-volume-$(date +%F-%H%M).tgz -C /d .`
  keyin BACKUP.md bo'yicha **tiklash** (`mongorestore --drop`) — faqat aniq qaror bilan.
- Ilova DB qaytgach o'zi qayta ulanadi (`lib/db.ts`), restart shart emas.

## 2. Telegram webhook ishlamayapti

```bash
source <(grep -E '^TELEGRAM_BOT_TOKEN=' .env)
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo" | python3 -m json.tool
```
| `last_error_message` | Yechim |
|---|---|
| `Wrong response from the webhook: 401/403` | `secret_token` `.env` dagi `TELEGRAM_WEBHOOK_SECRET` ga mos emas → DEPLOY.md §8 bo'yicha setWebhook'ni qayta bajaring |
| `SSL error` / `certificate` | `sudo certbot renew && sudo systemctl reload nginx` |
| `Connection timed out` / `502` | ilova ishlamayapti → §3/§4 |
| `pending_update_count` katta | ilova sekin; tuzalgach o'zi kamayadi. Kerak bo'lsa `drop_pending_updates=true` bilan qayta setWebhook |

- Logdan: `docker compose logs --since 30m app_a app_b | grep -i telegram`.
- Production'da `TELEGRAM_WEBHOOK_SECRET` bo'lmasa webhook **barcha** so'rovni rad etadi (ataylab).

## 3. Yuqori yuk / sekinlik

```bash
docker stats --no-stream
sudo tail -f /var/log/nginx/savora.access.log | awk '{print $1, $7, $9}'
# Eng ko'p so'rov yuborayotgan IP'lar:
sudo awk '{print $1}' /var/log/nginx/savora.access.log | sort | uniq -c | sort -rn | head
```
- **Bitta IP hujum qilyapti:** `sudo ufw deny from <IP>` yoki nginx'da `deny <IP>;` → `sudo nginx -t && sudo systemctl reload nginx`.
- **429 ko'p (haqiqiy foydalanuvchilar):** `deploy/nginx/savora.conf` dagi `rate=` ni oshiring.
- **Ilova RAM limitiga yetyapti (`memory: 768m`):** `docker compose logs app_a | grep -i 'heap\|memory'`;
  vaqtincha `docker compose restart app_b && sleep 20 && docker compose restart app_a` (navbat bilan — uzilishsiz).
- **Mongo sekin:** `docker compose exec mongo mongosh --eval 'db.currentOp({secs_running:{$gt:3}})'` — uzoq so'rovlar. Indeks yetishmasa — kodda tuzatiladi.
- **Doimiy yuk:** VPS'ni kattalashtiring (4 → 8 GB) yoki MongoDB'ni alohida serverga/Atlas'ga ko'chiring (`MONGO_URI_DOCKER`).

## 4. Rollback (yangi reliz buzilgan)

```bash
./deploy/deploy.sh rollback            # oldingi relizga (≈1–2 daqiqa, uzilishsiz)
./deploy/deploy.sh rollback <sha>      # aniq relizga (deploy/.releases dan)
./deploy/deploy.sh status
```
- Rollback faqat **kodni** qaytaradi. Yangi reliz bazani o'zgartirgan bo'lsa (migratsiya) — eski kod u bilan ishlay olishini tekshiring; kerak bo'lsa deploy oldidan olingan zaxiradan tiklash (BACKUP.md) — **faqat aniq qaror bilan**.
- Deploy skripti yangi nusxa sog'liq tekshiruvidan o'tmasa o'zi to'xtaydi; o'shanda bitta nusxa yangi (buzuq), biri eski bo'ladi → darhol `rollback`.
- Ikkala nusxa ham yiqilgan (502): `docker compose up -d app_a app_b`, keyin loglar.

## 5. Server ishga tushmaydi — env xatosi

Logda: `Savora: muhit sozlamalarida N ta xato — server ishga tushirilmadi.`
```bash
docker compose logs --tail=40 app_a
nano .env             # ko'rsatilgan o'zgaruvchilarni tuzating
docker compose up -d app_a app_b
```
`NEXT_PUBLIC_*` / `ROOT_DOMAIN` / `CSP_MODE` o'zgargan bo'lsa → `./deploy/deploy.sh --no-pull` (qayta build).

## 6. Sahifa oq / skript ishlamaydi (CSP)

Brauzer konsolida `Refused to load ... Content Security Policy`:
1. Tezkor: `.env` → `CSP_MODE=report-only` → `./deploy/deploy.sh --no-pull`.
2. Konsoldagi bloklangan manzilni `next.config.mjs` → `buildCsp()` ga qo'shing, `enforce` ga qaytaring.

## 7. SSL sertifikat muddati

```bash
sudo certbot certificates
sudo certbot renew --dry-run
sudo systemctl list-timers | grep certbot
```

## 8. Ma'lumot yo'qolgani haqida shikoyat

1. **Hech narsani o'chirmang / tiklamang** — avval holatni saqlang (zaxira oling: `npm run backup`).
2. Audit: do'kon kabinetidagi "Amallar" (AuditLog) — kim, qachon o'chirgan.
3. Kerak bo'lsa zaxirani **alohida** bazaga tiklab solishtiring (BACKUP.md, boshqa `--nsFrom/--nsTo` bilan), asosiy bazaga tegmasdan.

## Hodisadan keyin

- Qisqa yozuv: nima bo'ldi, qachon, qancha davom etdi, ta'sir (nechta do'kon), sabab, nima tuzatildi, qayta bo'lmasligi uchun nima qilinadi.
- Mijozlarga ta'sir bo'lgan bo'lsa — Telegram kanal/SMS orqali qisqa xabar.
