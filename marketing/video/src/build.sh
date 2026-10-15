#!/usr/bin/env bash
# Render natijalariga audio qo'shish: ovozli (VO + ducked musiqa) va toza (faqat musiqa).
set -euo pipefail
cd "$(dirname "$0")/.."
P=savora-reels
A=$P/assets/audio
ffmpeg -y -v error -i $A/music.wav -i $A/vo.wav -filter_complex \
 "[1:a]aformat=channel_layouts=stereo,asplit=2[vo][sc];[0:a]volume=-7dB[m];[m][sc]sidechaincompress=threshold=0.03:ratio=8:attack=15:release=350:makeup=1[md];[md][vo]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.0:LRA=9[a]" \
 -map "[a]" -ar 48000 -ac 2 $A/mix_ovozli.wav
ffmpeg -y -v error -i $A/music.wav -af "loudnorm=I=-14:TP=-1.0:LRA=9" -ar 48000 -ac 2 $A/mix_toza.wav
ffmpeg -y -v error -i $P/renders/subs.mp4 -i $A/mix_ovozli.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart savora-reels-30s-ovozli.mp4
ffmpeg -y -v error -i $P/renders/clean.mp4 -i $A/mix_toza.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart savora-reels-30s-toza.mp4
ffmpeg -y -v error -ss 10.78 -i $P/renders/clean.mp4 -frames:v 1 savora-reels-cover.png
echo done
