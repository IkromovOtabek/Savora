#!/bin/sh
# Lokal test xizmatlari (faqat dev): MongoDB 27019 va Redis 6390.
# Ishlamayotgan bo'lsa fonda ko'taradi, ishlayotgan bo'lsa tegmaydi.
# Ma'lumot ~/.savora/localdb da — /tmp emas (macOS /tmp ni vaqti-vaqti bilan tozalaydi).
DATA="$HOME/.savora"
mkdir -p "$DATA/localdb"

if ! lsof -nP -iTCP:27019 -sTCP:LISTEN >/dev/null 2>&1; then
  nohup mongod --dbpath "$DATA/localdb" --port 27019 --bind_ip 127.0.0.1 \
    --logpath "$DATA/localdb.log" --logappend >/dev/null 2>&1 &
fi

if ! lsof -nP -iTCP:6390 -sTCP:LISTEN >/dev/null 2>&1; then
  nohup redis-server --port 6390 --bind 127.0.0.1 --save '' --appendonly no --dir "$DATA" >/dev/null 2>&1 &
fi

# MongoDB tayyor bo'lishini kutish (eng ko'pi 15 s)
i=0
while [ $i -lt 15 ] && ! lsof -nP -iTCP:27019 -sTCP:LISTEN >/dev/null 2>&1; do
  sleep 1
  i=$((i + 1))
done
