#!/usr/bin/env bash
# Savora — uzilishsiz (rolling) deploy va rollback. Serverda web/ papkasidan ishga tushiring.
#
#   ./deploy/deploy.sh                 # git pull + build + navbatma-navbat yangilash
#   ./deploy/deploy.sh --no-pull       # joriy kod bilan (git pull'siz)
#   ./deploy/deploy.sh rollback        # oldingi relizga qaytish
#   ./deploy/deploy.sh rollback abc1234  # aniq relizga (image tegi = git qisqa SHA)
#   ./deploy/deploy.sh status          # holat
#
# Talab: docker compose v2, curl. Har reliz `savora:<sha>` image sifatida saqlanadi,
# ro'yxat — deploy/.releases (oxirgisi — joriy).
set -euo pipefail

cd "$(dirname "$0")/.."
RELEASES=deploy/.releases
SERVICES=("app_b:3002" "app_a:3001")   # avval B, keyin A — bittasi doim ishlab turadi
HEALTH_TRIES=45                         # 45 × 2 s = 90 s

log() { printf '\033[1;34m[deploy]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[deploy] XATO:\033[0m %s\n' "$*" >&2; exit 1; }

wait_healthy() {
  local port=$1 i
  for ((i = 1; i <= HEALTH_TRIES; i++)); do
    if curl -fsS --max-time 3 "http://127.0.0.1:${port}/api/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

roll_to() {
  local tag=$1 svc name port
  export APP_IMAGE="savora:${tag}" APP_VERSION="${tag}"
  docker image inspect "$APP_IMAGE" >/dev/null 2>&1 || die "image topilmadi: $APP_IMAGE"
  for svc in "${SERVICES[@]}"; do
    name=${svc%%:*}; port=${svc##*:}
    log "$name → $APP_IMAGE (port $port)"
    docker compose up -d --no-deps --no-build "$name"
    if ! wait_healthy "$port"; then
      docker compose logs --tail=80 "$name" || true
      die "$name sog'liq tekshiruvidan o'tmadi (http://127.0.0.1:${port}/api/health). Ikkinchi nusxa eski versiyada ishlayapti. Rollback: ./deploy/deploy.sh rollback"
    fi
    log "$name sog'lom"
  done
  # Keyingi oddiy `docker compose up -d` ham shu versiyani ishlatsin
  docker image tag "$APP_IMAGE" savora:latest
}

cmd=${1:-deploy}

case "$cmd" in
  status)
    docker compose ps
    for svc in "${SERVICES[@]}"; do
      port=${svc##*:}
      printf '%s: ' "${svc%%:*}"; curl -fsS --max-time 3 "http://127.0.0.1:${port}/api/health" || echo "javob yo'q"
      echo
    done
    [ -f "$RELEASES" ] && { echo "Oxirgi relizlar:"; tail -n 5 "$RELEASES"; }
    ;;

  rollback)
    [ -f "$RELEASES" ] || die "$RELEASES yo'q — avval kamida 2 marta deploy qilingan bo'lishi kerak"
    target=${2:-}
    if [ -z "$target" ]; then
      target=$(tail -n 2 "$RELEASES" | head -n 1 | awk '{print $1}')
      current=$(tail -n 1 "$RELEASES" | awk '{print $1}')
      [ "$target" != "$current" ] || die "oldingi reliz topilmadi"
    fi
    log "Rollback → $target"
    roll_to "$target"
    echo "$target $(date -u +%FT%TZ) rollback" >> "$RELEASES"
    log "Tayyor. Joriy: savora:$target"
    ;;

  deploy|--no-pull)
    if [ "$cmd" != "--no-pull" ] && [ "${2:-}" != "--no-pull" ]; then
      log "git pull --ff-only"
      git pull --ff-only
    fi
    [ -f .env ] || die ".env topilmadi (docs/DEPLOY.md → 5-qadam)"
    tag=$(git rev-parse --short HEAD)
    export APP_IMAGE="savora:${tag}" APP_VERSION="${tag}"
    log "Build: $APP_IMAGE"
    docker compose build app_a
    docker compose up -d mongo
    roll_to "$tag"
    echo "$tag $(date -u +%FT%TZ) deploy" >> "$RELEASES"
    # Eski image'larni tozalash (oxirgi 5 ta reliz qoladi)
    keep=$(tail -n 5 "$RELEASES" | awk '{print "savora:"$1}' | sort -u)
    for img in $(docker images savora --format '{{.Repository}}:{{.Tag}}' | grep -vE ':(latest)$' || true); do
      grep -qx "$img" <<<"$keep" || docker image rm "$img" >/dev/null 2>&1 || true
    done
    log "Tayyor: $APP_IMAGE"
    ;;

  *)
    die "noma'lum buyruq: $cmd (deploy | --no-pull | rollback [sha] | status)"
    ;;
esac
