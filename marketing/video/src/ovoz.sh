#!/usr/bin/env bash
# Jonli ovoz bilan qayta yig'ish: ./src/ovoz.sh <yozuv-fayli> [loyiha=savora-reel-01]
# Natija: <loyiha>-jonli-ovoz.mp4 (marketing/video/ ichida)
set -euo pipefail
cd "$(dirname "$0")/.."
REC="$1"; P="${2:-savora-reel-01}"
.venv/bin/python src/real_voice.py "$REC" "$P"
(cd "$P" && npx --yes hyperframes@0.8.185 render -o renders/jonli-ovoz.mp4 --fps 30 --quality delivery >/dev/null)
cp "$P/renders/jonli-ovoz.mp4" "$P-jonli-ovoz.mp4"
echo "tayyor: $P-jonli-ovoz.mp4"
