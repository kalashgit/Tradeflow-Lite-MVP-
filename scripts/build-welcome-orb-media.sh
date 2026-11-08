#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v ffmpeg >/dev/null
command -v ffprobe >/dev/null
source_asset="public/orb-concept-b/reference.gif"
target="public/assets"
mkdir -p "$target"
test -s "$source_asset"
mp4="$target/tradeflow_orb_smooth_60_frames.mp4"
gif="$target/tradeflow_orb_60_frames.gif"
# CI builds 60 displayed frames using motion-compensated interpolation of the
# source TradeFlow reference asset. No independent redesign or texture mixing.
# Set 30 fps, 2 seconds, and retain black background, central T and cyan weave.
ffmpeg -hide_banner -loglevel error -y -stream_loop -1 -i "$source_asset" \
  -vf "scale=512:512:flags=lanczos,minterpolate=fps=30:mi_mode=mci:mc_mode=obmc:me_mode=bidir:vsbmc=1,format=yuv420p" \
  -frames:v 60 -an -c:v libx264 -preset medium -crf 17 \
  -movflags +faststart -pix_fmt yuv420p "$mp4"
# The same 60 decoded video frames form the animated GIF fallback.
ffmpeg -hide_banner -loglevel error -y -i "$mp4" \
  -vf "fps=30,split[s0][s1];[s0]palettegen=max_colors=128:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4" \
  -frames:v 60 "$gif"
test -s "$mp4";test -s "$gif"
actual_frames="$(ffprobe -v error -select_streams v:0 -count_frames -show_entries stream=nb_read_frames -of default=noprint_wrappers=1:nokey=1 "$mp4")"
test "$actual_frames" = "60" || { echo "Expected 60 video frames, got $actual_frames" >&2; exit 1; }
echo "PASS: 60 frame MP4 and GIF generated, bytes $(wc -c < "$mp4") / $(wc -c < "$gif")"
