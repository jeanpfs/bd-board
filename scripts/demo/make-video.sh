#!/usr/bin/env bash
# Turns the screen capture from record.mjs into the README video: 1920x1080, 60 fps, H.264, fast start.
# Upload the result by dragging it into the README editor on github.com; GitHub returns a
# https://github.com/user-attachments/assets/... URL that renders as a player.
# Needs ffmpeg. Usage: make-video.sh <screen.mov> <out.mp4> [crf]
set -euo pipefail
IN="${1:-video/screen.mov}"
OUT="${2:-demo.mp4}"
CRF="${3:-18}"
ffmpeg -v error -y -i "$IN" \
  -vf "fps=60,scale=1920:1080:flags=lanczos" \
  -c:v libx264 -preset slow -crf "$CRF" -tune animation -pix_fmt yuv420p -movflags +faststart -an \
  "$OUT"
echo "wrote $OUT ($(du -h "$OUT" | cut -f1))"
