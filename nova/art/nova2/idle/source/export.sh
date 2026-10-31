#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
ffmpeg -y -v error -framerate 60 -i frames/%04d.png -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 24 -auto-alt-ref 0 NOVA_Idle_Transparent.webm
ffmpeg -y -v error -framerate 60 -i frames/%04d.png -f lavfi -i color=c=0x172536:s=600x800:r=60 -filter_complex '[1:v][0:v]overlay=shortest=1:format=auto,format=yuv420p' -c:v libx264 -crf 18 -movflags +faststart NOVA_Idle_Preview.mp4
