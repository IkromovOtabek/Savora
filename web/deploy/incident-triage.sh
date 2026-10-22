#!/usr/bin/env bash
# Savora prod — incident 2026-10-19: FAQAT O'QIYDIGAN dalil yig'ish skripti.
# Hech narsani o'chirmaydi, to'xtatmaydi, o'zgartirmaydi. Faqat $OUT papkasiga yozadi.
#
#   sudo bash incident-triage.sh
#   → $OUT/summary.txt ni chatga tashlang (.env yoki parollarni tashlamang).
set -u

OUT=/root/incident-$(date +%Y%m%d-%H%M)
mkdir -p "$OUT/files"
S="$OUT/summary.txt"
sec() { printf '\n===== %s =====\n' "$*" >>"$S"; }
run() { sec "$1"; shift; ( "$@" ) >>"$S" 2>&1; }

run "vaqt / uptime / host" sh -c 'date -u; uptime; hostname; uname -a'
run "kirishlar (last)" sh -c 'last -n 30 -F 2>/dev/null; echo "-- muvaffaqiyatsiz (lastb) --"; lastb -n 15 -F 2>/dev/null'
run "hozir kim tizimda" w
run "uid=0 va shell'li foydalanuvchilar" sh -c "awk -F: '\$3==0 || \$7 !~ /(nologin|false)\$/' /etc/passwd"
run "authorized_keys" sh -c 'for f in /root/.ssh/authorized_keys /home/*/.ssh/authorized_keys; do [ -f "$f" ] && { echo "## $f"; stat -c "%y" "$f"; awk "{print \$1, \$NF}" "$f"; }; done'
run "sshd sozlamalari" sh -c "grep -Ei '^(PermitRootLogin|PasswordAuthentication|PubkeyAuthentication|AuthorizedKeysFile)' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/* 2>/dev/null"

run "eng ko'p CPU yeyotgan jarayonlar" sh -c 'ps -eo pid,ppid,user,%cpu,%mem,lstart,cmd --sort=-%cpu | head -25'
run "o'chirilgan/vaqtinchalik joydan ishlayotgan jarayonlar" sh -c 'ls -l /proc/[0-9]*/exe 2>/dev/null | grep -E "deleted|/tmp/|/dev/shm|/var/tmp|Savora" '
run "ochiq portlar" ss -tulpn
run "tashqi ulanishlar" sh -c 'ss -tnp state established | grep -v "127.0.0.1" | head -60'
run "mayning pool portlariga ulanish" sh -c 'ss -tnp | grep -E ":(3333|4444|5555|7777|8888|9000|10128|14433|14444|45700)\b" || echo yoq'

run "crontab (barcha foydalanuvchilar)" sh -c 'for u in $(cut -d: -f1 /etc/passwd); do c=$(crontab -l -u "$u" 2>/dev/null); [ -n "$c" ] && { echo "## $u"; echo "$c"; }; done; echo "## /etc/crontab"; cat /etc/crontab; ls -la /etc/cron.d /var/spool/cron/crontabs 2>/dev/null'
run "systemd: oxirgi 30 kunda o'zgargan unit'lar" sh -c 'find /etc/systemd /lib/systemd/system /usr/lib/systemd/system ~/.config/systemd -type f -mtime -30 2>/dev/null'
run "systemd: ishlayotgan servislar" sh -c 'systemctl list-units --type=service --state=running --no-pager --plain | head -60'
run "rootkit belgilari" sh -c 'echo "## /etc/ld.so.preload"; cat /etc/ld.so.preload 2>/dev/null || echo yoq; echo "## rc.local"; cat /etc/rc.local 2>/dev/null || echo yoq; echo "## .bashrc/.profile oxiri"; tail -5 /root/.bashrc /root/.profile 2>/dev/null'

run "pm2 jarayonlari" sh -c 'pm2 list 2>/dev/null; pm2 jlist 2>/dev/null | python3 -c "import json,sys;[print(p[\"name\"],p[\"pm2_env\"].get(\"pm_exec_path\"),p[\"pm2_env\"].get(\"username\")) for p in json.load(sys.stdin)]" 2>/dev/null'
run "docker konteynerlar" sh -c 'docker ps -a --format "{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null'
run "nginx: domenlar va root'lar" sh -c "nginx -T 2>/dev/null | grep -E '^\s*(server_name|root|proxy_pass|listen)' | sort | uniq -c"

run "Savora repo holati" sh -c 'cd /root/Savora 2>/dev/null && { git log --oneline -3; git status --short | head -40; echo "## next versiyasi"; node -p "require(\"./web/node_modules/next/package.json\").version" 2>/dev/null; ls -la web/public web/.next/standalone/public 2>/dev/null | head -60; }'
run "boshqa loyihalarning next versiyalari" sh -c 'find / -path /proc -prune -o -name package.json -path "*node_modules/next/package.json" -print 2>/dev/null | grep -v "/node_modules/.*/node_modules/" | while read f; do echo "$f $(grep -m1 "\"version\"" "$f")"; done'

run "oxirgi 14 kunda o'zgargan bajariladigan/shubhali fayllar" sh -c 'find /root /home /tmp /var/tmp /dev/shm /usr/local/bin /usr/bin /etc -xdev -type f -mtime -14 \( -perm -u+x -o -name "*.js" -o -name "*.sh" -o -name "config.json" \) -not -path "*/node_modules/*" -not -path "*/.next/*" -not -path "*/.git/*" -not -path "/root/incident-*" -printf "%TY-%Tm-%Td %TH:%TM  %s  %p\n" 2>/dev/null | sort | tail -80'

run "nginx log: x.js / cmd= / config.json so'rovlari" sh -c 'zgrep -hE "x\.js|[?&]cmd=|/config\.json" /var/log/nginx/access.log* 2>/dev/null | awk "{print \$1, \$4, \$7, \$9}" | sort -k2 | head -40; echo "## IP soni"; zgrep -hE "x\.js|[?&]cmd=" /var/log/nginx/access.log* 2>/dev/null | awk "{print \$1}" | sort | uniq -c | sort -rn | head -15'
run "nginx log: shubhali POST (Next-Action / RSC)" sh -c 'zgrep -hiE "\"POST [^\"]*\" (200|303|500)" /var/log/nginx/access.log* 2>/dev/null | grep -viE "/api/(mobile|auth|telegram)" | awk "{print \$1, \$4, \$7, \$9}" | head -30'

# Shubhali fayllarni NUSXA qilamiz (asl joyida qoladi) — keyingi tahlil uchun
for f in /root/Savora/web/{flooder,xcu,core,javae,amp,aswd,NYOOIWa4,jld22zf7} /root/Savora/web/public/{x.js,config.json}; do
  [ -e "$f" ] && cp -p "$f" "$OUT/files/" 2>/dev/null
done
sec "nusxa olingan fayllar sha256"
( cd "$OUT/files" && sha256sum * 2>/dev/null ) >>"$S"

chmod -R go-rwx "$OUT"
echo "Tayyor: $S  ($(wc -l <"$S") qator)"
