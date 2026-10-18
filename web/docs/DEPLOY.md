# Savora — Production'ga chiqarish (Deploy) qo'llanmasi

Yangi, toza **Ubuntu 22.04/24.04 VPS** uchun bosqichma-bosqich. Buyruqlarni ketma-ket nusxa olib ishga tushiring.
Fayllar: `web/Dockerfile`, `web/docker-compose.yml`, `web/deploy/` (nginx, deploy.sh, crontab, pm2).

> **Kim nima qiladi:** 1–2-qadam (server sotib olish, DNS) — **siz** (hosting/registrator panelida).
> Qolganlari — serverda terminal buyruqlari (siz yoki men, ruxsatingiz bilan).

---

## 0. Ehtiyot: insof serveri

`~/.ssh/config` dagi yagona host — **`insof` (189.74.98.242)** — bu **Insof ERP** kompaniyasining production serveri.
`savora.uz` esa **77.83.206.235** ga ishora qiladi — unga SSH sozlamasi hali yo'q.

Savora'ni Insof serverida **birga ishlatmang**, agar bu ataylab qabul qilingan qaror bo'lmasa:

| Muammo | Tafsilot |
|---|---|
| RAM | Insof serverida ~3.8 GB, Insof ERP bilan bo'lishiladi. Savora: 2 × Next.js (~300–500 MB) + MongoDB (~0.5–1 GB) → OOM xavfi, ikkala tizim ham yiqiladi. |
| Port | `3000` band (Insof). Savora compose `127.0.0.1:3001/3002` ishlatadi, lekin nginx/certbot konfiguratsiyasi umumiy bo'ladi. |
| Xavfsizlik | Bir tizimdagi zaiflik ikkinchisining ma'lumotiga yo'l ochadi (boshqa kompaniya mijozlari ma'lumoti). |
| Huquqiy | Boshqa yuridik shaxs serverida mijoz ma'lumotini saqlash — shartnoma/shaxsga doir ma'lumotlar qonuni bo'yicha savol. |
| Operatsion | Insof uchun restart/yangilash Savora'ni ham to'xtatadi va aksincha. |

**Tavsiya:** Savora uchun alohida VPS (77.83.206.235 yoki yangi). Minimal: **2 vCPU, 4 GB RAM, 40 GB SSD**.
Birga joylashtirish qaror qilinsa — avval `free -h`, `docker stats`, `ss -ltnp` bilan resursni o'lchang va
`docker-compose.yml` dagi `memory` limitlarini kamaytiring (faqat `app_a`, MONGO_CACHE_GB=0.25).

---

## 1. Server va DNS (siz)

1. VPS: Ubuntu 24.04, 2 vCPU / 4 GB RAM / 40 GB+. Data-markaz — O'zbekistonda bo'lsa yaxshi (qarang: LAUNCH_CHECKLIST → ma'lumot lokalizatsiyasi).
2. DNS (domen registratori panelida):
   - `savora.uz` → `A` → server IP
   - `www.savora.uz` → `A` → server IP
   - Subdomen rejimi kerak bo'lsa (`dokon.savora.uz`): `*.savora.uz` → `A` → server IP
3. Tekshirish: `dig +short savora.uz` → server IP.

## 2. Serverga birinchi kirish va himoya

```bash
ssh root@<SERVER_IP>
adduser savora && usermod -aG sudo savora
# SSH kalitni nusxalash (o'z kompyuteringizdan): ssh-copy-id savora@<SERVER_IP>
sudo sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/; s/^#\?PermitRootLogin .*/PermitRootLogin no/' /etc/ssh/sshd_config
sudo systemctl restart ssh

sudo apt update && sudo apt -y upgrade
sudo apt -y install ufw fail2ban unattended-upgrades git curl nginx certbot python3-certbot-nginx
sudo timedatectl set-timezone Asia/Tashkent
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw --force enable
sudo dpkg-reconfigure -plow unattended-upgrades
```

Lokal kompyuterda `~/.ssh/config` ga qo'shing (insof bilan aralashmasin):
```
Host savora
  HostName 77.83.206.235
  User savora
```

## 3. Docker (A variant — tavsiya)

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker savora && newgrp docker
docker compose version   # v2 bo'lishi kerak
```

## 4. Kodni olish

```bash
sudo mkdir -p /opt/savora && sudo chown savora:savora /opt/savora
git clone <REPO_URL> /opt/savora
cd /opt/savora/web
```

## 5. `.env` — muhit o'zgaruvchilari

```bash
cp .env.example .env
chmod 600 .env
nano .env
```

Sirlarni yaratish:
```bash
openssl rand -base64 48   # SESSION_SECRET
openssl rand -hex 32      # CRON_SECRET
openssl rand -hex 32      # TELEGRAM_WEBHOOK_SECRET
```

| O'zgaruvchi | Majburiy | Tavsif / namuna |
|---|---|---|
| `MONGO_URI` | ha | Host'dagi skriptlar uchun: `mongodb://127.0.0.1:27017`. Konteynerlar `MONGO_URI_DOCKER` (standart `mongodb://mongo:27017`) ishlatadi. |
| `MASTER_DB_NAME` | ha | Master baza nomi, masalan `savora`. **Keyin o'zgartirmang.** |
| `SESSION_SECRET` | ha | ≥32 belgi, tasodifiy. O'zgarsa barcha foydalanuvchilar chiqib ketadi. |
| `ROOT_DOMAIN`, `NEXT_PUBLIC_ROOT_DOMAIN` | ha | `savora.uz` (protokolsiz). |
| `NEXT_PUBLIC_APP_URL` | ha | `https://savora.uz` (oxirida `/` yo'q). SEO, OG, Telegram havolalari. |
| `NEXT_PUBLIC_USE_PATH_ROUTING` | ha | `true` — bitta domen (`/super`, `/t/<slug>`). `false` — subdomenlar (pastda). |
| `NODE_ENV` | ha | `production` |
| `CRON_SECRET` | ha | ≥16 belgi. Cron so'rovlari `Authorization: Bearer` bilan. |
| `TELEGRAM_BOT_TOKEN` | yo'q | @BotFather dan. Bo'lsa → `TELEGRAM_WEBHOOK_SECRET` **majburiy**. |
| `TELEGRAM_BOT_USERNAME` | Telegram bo'lsa | `@` siz. |
| `TELEGRAM_WEBHOOK_SECRET` | Telegram bo'lsa | `A-Z a-z 0-9 _ -`, 1–256. |
| `TELEGRAM_CHAT_ID` | yo'q | Platforma egasi uchun bildirishnomalar. |
| `ESKIZ_EMAIL`, `ESKIZ_PASSWORD`, `ESKIZ_FROM` | yo'q | Eskiz.uz SMS (Daftar eslatmalari). |
| `R2_*` | tavsiya | Cloudflare R2 — rasmlar. Bo'lmasa `uploads` volume'ga yoziladi. |
| `ERROR_WEBHOOK_URL` | yo'q | Xatolar JSON POST qilinadigan manzil (Slack/Discord/n8n). |
| `SENTRY_DSN` | yo'q | Sentry — server xatolari (`logError` va ushlanmagan xatolar). Bo'sh bo'lsa paket yuklanmaydi. |
| `REDIS_URL` | tavsiya (2+ instance) | Markazlashgan login/so'rov rate-limit (savora-a/b bitta hisobni ko'radi). Bo'lmasa yoki ishlamasa — xotiradagi zaxira. |
| `NEXT_PUBLIC_SENTRY_DSN` | yo'q | Sentry — brauzer xatolari. **Build vaqtida** o'qiladi (CSP `connect-src` ga ham qo'shiladi). |
| `CSP_MODE` | yo'q | `enforce` (standart) / `report-only` / `off`. **Build vaqtida** o'qiladi. |
| `BACKUP_DIR`, `BACKUP_KEEP_DAYS` | yo'q | Zaxira joyi va saqlash muddati (BACKUP.md). |
| `MONGO_CACHE_GB` | yo'q | MongoDB RAM keshi, standart 0.5. |

Production'da majburiy qiymat yo'q/xato bo'lsa server **ishga tushmaydi** va logda aniq o'zbekcha sabab chiqadi
(`lib/env.ts`, `instrumentation.ts`): `docker compose logs app_a | head -30`.

> `NEXT_PUBLIC_*`, `ROOT_DOMAIN`, `CSP_MODE` — **build vaqtida** kodga yoziladi. Ularni o'zgartirsangiz — qayta build (`./deploy/deploy.sh --no-pull`).
> Repo'dagi `web/.env.production` Docker image'ga kirmaydi (`.dockerignore`). Unda haqiqiy sir bo'lmasligi kerak — tekshiring.

## 6. nginx + SSL (certbot)

```bash
sudo mkdir -p /var/www/certbot
sudo cp deploy/nginx/savora.conf /etc/nginx/sites-available/savora.conf
# Avval faqat 80-port blokini qoldirib sertifikat olamiz:
sudo ln -sf /etc/nginx/sites-available/savora.conf /etc/nginx/sites-enabled/savora.conf
sudo rm -f /etc/nginx/sites-enabled/default
sudo certbot certonly --nginx -d savora.uz -d www.savora.uz --agree-tos -m <email> --no-eff-email
sudo nginx -t && sudo systemctl reload nginx
sudo systemctl status certbot.timer   # avtomatik yangilanish
```

Agar `nginx -t` sertifikat yo'qligi sababli yiqilsa: 443 bloklarini vaqtincha izohga oling → certbot → qaytaring.

### Path routing vs subdomen

| | Path (standart) | Subdomen |
|---|---|---|
| `.env` | `NEXT_PUBLIC_USE_PATH_ROUTING=true` | `NEXT_PUBLIC_USE_PATH_ROUTING=false` |
| URL'lar | `savora.uz/super`, `savora.uz/t/dokon1/login` | `admin.savora.uz`, `dokon1.savora.uz` |
| DNS | `savora.uz`, `www` | + `*.savora.uz` |
| SSL | oddiy (HTTP-01) | **wildcard** — faqat DNS-01: `certbot certonly --manual --preferred-challenges dns -d savora.uz -d '*.savora.uz'` (yoki DNS provayder plagini — avtomatik yangilanishi uchun) |
| nginx | o'zgarishsiz | `server_name savora.uz *.savora.uz;` (fayldagi izohlar) |

Boshlash uchun **path routing** tavsiya: oddiy SSL, bitta cookie domeni.

## 7. Build va ishga tushirish

```bash
cd /opt/savora/web
chmod +x deploy/deploy.sh
./deploy/deploy.sh --no-pull      # birinchi marta: build + mongo + app_b + app_a
./deploy/deploy.sh status
curl -s https://savora.uz/api/health
```

Birinchi super admin (yoki parol unutilganda tiklash) — faqat `superadmins` ga yozadi, demo ma'lumot yaratmaydi:
```bash
npm run super-admin                              # admin / tasodifiy parol, bir marta chop etiladi
SUPER_ADMIN_PASSWORD='KuchliParol' npm run super-admin
```
`npm run seed` — faqat lokal/demo uchun (demo do'kon va ma'lum parollar yaratadi), production'da `SEED_ALLOW=1` siz bloklangan.

## B variant — Docker'siz (Node 20 + pm2)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt -y install nodejs
sudo npm i -g pm2
# MongoDB 7: https://www.mongodb.com/docs/manual/tutorial/install-mongodb-on-ubuntu/ (bind_ip 127.0.0.1)
cd /opt/savora/web && npm ci && npm run build
cp -r public .next/standalone/ && cp -r .next/static .next/standalone/.next/
# Yuklamalar build'da o'chib ketmasligi uchun:
sudo mkdir -p /var/lib/savora/uploads /var/log/savora && sudo chown -R savora /var/lib/savora /var/log/savora
rm -rf .next/standalone/public/uploads && ln -s /var/lib/savora/uploads .next/standalone/public/uploads
pm2 start deploy/ecosystem.config.cjs && pm2 save && pm2 startup
```
Yangilash: `git pull && npm ci && npm run build && (yuqoridagi cp/ln) && pm2 reload savora-b && sleep 10 && pm2 reload savora-a`.
Diqqat: standalone papkaga `.env.production` ham nusxalanadi — unda faqat ommaviy qiymatlar bo'lsin.

## 8. Telegram webhook (secret_token bilan)

```bash
source <(grep -E '^(TELEGRAM_BOT_TOKEN|TELEGRAM_WEBHOOK_SECRET)=' .env)
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d "url=https://savora.uz/api/telegram/webhook" \
  -d "secret_token=${TELEGRAM_WEBHOOK_SECRET}" \
  -d 'allowed_updates=["message","callback_query"]' -d "drop_pending_updates=true"
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"   # last_error_message bo'sh bo'lsin
```
Mini App: @BotFather → `/setmenubutton` (yoki `/newapp`) → URL `https://savora.uz/tg`.
Telegram har so'rovda `X-Telegram-Bot-Api-Secret-Token` sarlavhasini yuboradi; mos kelmasa ilova rad etadi.

## 9. Cron (Authorization: Bearer)

```bash
echo "CRON_SECRET=$(grep ^CRON_SECRET= .env | cut -d= -f2-)" | sudo tee /etc/savora-cron.env >/dev/null
sudo chmod 600 /etc/savora-cron.env && sudo chown savora /etc/savora-cron.env
crontab -e     # deploy/crontab.example mazmunini qo'shing (APP yo'lini tekshiring)
```
Qo'lda sinash:
```bash
. /etc/savora-cron.env; curl -s -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3001/api/cron/expire-orgs
```
nginx `/api/cron/` ni tashqaridan yopadi — cron to'g'ridan-to'g'ri `127.0.0.1:3001/3002` ga boradi.
Production'da `?secret=` ishlamaydi (faqat sarlavha).

## 10. Zaxira (backup)

To'liq tafsilot: [`../BACKUP.md`](../BACKUP.md). Qisqa:
```bash
sudo apt -y install mongodb-database-tools   # yoki MongoDB repo'dan
npm run backup                              # host'dan, MONGO_URI=mongodb://127.0.0.1:27017
```
Docker ichidan muqobil (host'da Node shart emas):
```bash
docker compose exec -T mongo mongodump --archive --gzip > /var/backups/savora-$(date +%F).archive.gz
```
**Majburiy:** zaxirani serverdan tashqariga ko'chiring (R2/S3: `rclone copy`, yoki boshqa server) va oyiga bir marta tiklab ko'ring.

## 11. Yangilash (uzilishsiz) va rollback

```bash
cd /opt/savora/web
./deploy/deploy.sh            # git pull --ff-only → build savora:<sha> → app_b → health → app_a → health
./deploy/deploy.sh status
./deploy/deploy.sh rollback          # oldingi relizga
./deploy/deploy.sh rollback a1b2c3d  # aniq relizga
```
Qanday ishlaydi: ikki nusxa (3001, 3002) nginx upstream'da. Bittasi qayta ishga tushayotganda nginx
so'rovni ikkinchisiga yuboradi (`proxy_next_upstream`). Yangi nusxa `/api/health` dan o'tmasa — skript to'xtaydi,
ikkinchi nusxa eski versiyada ishlashda davom etadi. Relizlar `deploy/.releases` da, oxirgi 5 image saqlanadi.

**Baza o'zgarishi (migratsiya) bo'lsa:** avval `npm run backup`, keyin deploy. Rollback faqat kodni qaytaradi — bazani emas.

Eslatma: login rate-limit hozir har nusxa xotirasida (`lib/rateLimit.ts`) — 2 nusxada limit amalda 2 baravar.
nginx `limit_req` birinchi qatlam sifatida buni qoplaydi.

## 12. Sog'liq tekshiruvi va monitoring

| Manzil | Ma'nosi |
|---|---|
| `GET /api/health` | readiness: master DB ping (2 s). `200 {"status":"ok","db":"up"}` yoki `503 {"db":"down"}` |
| `GET /api/health?live=1` | liveness: jarayon tirik (DB'ga tegmaydi) |

- Docker `HEALTHCHECK` — `/api/health` (30 s). `docker compose ps` da `healthy` ko'rinadi.
- Tashqi monitoring: UptimeRobot / Better Stack → `https://savora.uz/api/health`, 1–5 daqiqa, xabar — Telegram.
- Xatolar: `.env` da `ERROR_WEBHOOK_URL` — har ushlanmagan server xatosi (Next `onRequestError`) va `logError()` u yerga yuboriladi (1 daqiqada bir xil xato bir marta, max 20/daqiqa, parol/token maydonlari yashiriladi).

## 13. Log joylari

| Nima | Qayerda |
|---|---|
| Ilova (JSON, bir qator = bir hodisa) | `docker compose logs -f --tail=200 app_a app_b` (rotatsiya: 5 × 20 MB) |
| MongoDB | `docker compose logs mongo` |
| nginx | `/var/log/nginx/savora.access.log`, `/var/log/nginx/savora.error.log` |
| Cron | `/var/log/savora-cron.log`, `/var/log/savora-backup.log`, `/var/log/savora-health.log` |
| pm2 (B variant) | `/var/log/savora/app.out.log`, `app.err.log`, `pm2 logs` |

Qidirish misoli: `docker compose logs app_a --since 1h | grep '"level":"error"'`

## 14. Xavfsizlik sarlavhalari va CSP

`next.config.mjs` → `headers()`:

| Sarlavha | Qiymat | Sabab |
|---|---|---|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` (faqat prod) | HTTPS majburiy. Barcha subdomenlar HTTPS bo'lishi shart. `preload` qo'shilmagan (qaytarib bo'lmaydi). |
| `X-Content-Type-Options` | `nosniff` | MIME-sniffing'dan himoya |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Tashqi saytlarga to'liq URL (slug, id) ketmaydi |
| `Permissions-Policy` | `camera=(self)`, qolganlari `()` | Shtrix-kod skaneri faqat o'z sahifamizda |
| `X-Frame-Options` | `DENY` (`/tg`, `/app` dan tashqari) | Clickjacking |
| `X-Robots-Tag` | `noindex` — `/app`, `/super`, `/t/`, `/api` | Kabinet Google'ga chiqmasin |

**CSP** (`Content-Security-Policy`):
- `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`.
- `script-src 'self' 'unsafe-inline' https://telegram.org` — Next.js App Router RSC ma'lumotini inline `<script>` bilan yuboradi
  va layout'da tema skripti bor; nonce uchun har sahifa dinamik render + middleware o'zgarishi kerak (keyingi bosqich).
  `telegram.org` — `/tg` Mini App skripti. Dev'da qo'shimcha `'unsafe-eval'` (HMR).
- `style-src 'self' 'unsafe-inline'` — React `style={}` atributlari.
- `img-src 'self' data: blob: https:` — R2/CDN domeni env'ga bog'liq, rasm — past xavf.
- `connect-src 'self' https://telegram.org`; `worker-src 'self' blob:` (service worker); `media-src 'self' blob:` (kamera).
- `form-action 'self' https://savora.uz https://*.savora.uz` — subdomen rejimida login redirect'i uchun (`ROOT_DOMAIN` build'da).
- `frame-ancestors 'none'`; `/tg` va `/app` uchun `'self' https://web.telegram.org https://*.telegram.org` — Telegram Web Mini App'ni iframe'da ochadi, login'dan keyin `/app` ga o'tadi.
- `upgrade-insecure-requests` (prod).

Brauzerda sinaldi: `/super/login`, `/tg` (telegram-web-app.js yuklanadi, gidratsiya ishlaydi), `/offline.html` — CSP buzilishi yo'q.

**Muammo bo'lsa (sahifa ishlamay qolsa):** brauzer konsolida `Refused to ...` qidiring →
`.env` da `CSP_MODE=report-only` → `./deploy/deploy.sh --no-pull` (bloklamaydi, faqat ogohlantiradi) → sababni tuzating → `enforce` ga qaytaring.

## 15. Birinchi chiqishdan keyingi tekshiruv

```bash
curl -sI https://savora.uz | grep -iE 'strict-transport|content-security|x-frame'
curl -s https://savora.uz/api/health
curl -s https://savora.uz/robots.txt && curl -s https://savora.uz/sitemap.xml | head
curl -sI https://savora.uz/opengraph-image   # 200 image/png
```
- Telegram'da `https://savora.uz` havolasini yuboring — OG kartochka chiqishi kerak.
- Telefonda "Bosh ekranga qo'shish" (PWA) → ikonka to'g'ri.
- `LAUNCH_CHECKLIST.md` ni oxirigacha belgilang.
