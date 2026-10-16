#!/usr/bin/env bash
# Converts the Playwright recording (video/session.webm) into assets/demo.gif: 12 fps, 960 px wide, global palette.
# Needs ffmpeg and gifsicle. Usage: make-gif.sh <session.webm> <out.gif>
set -euo pipefail
IN="${1:-video/session.webm}"
OUT="${2:-demo.gif}"
RAW="$(mktemp -t bdboard-demo).gif"
ffmpeg -v error -y -i "$IN" \
  -vf "trim=0.8:24.2,setpts=PTS-STARTPTS,fps=12,scale=960:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=256:stats_mode=full[p];[b][p]paletteuse=dither=bayer:bayer_scale=3" \
  "$RAW"
gifsicle -O3 --lossy=30 "$RAW" -o "$OUT"
rm -f "$RAW"
echo "wrote $OUT"
