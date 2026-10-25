#!/usr/bin/env bash
# Genera los archivos que usa scripts/e2e-medios.mjs. Uso: scripts/medios-prueba.sh <carpeta>
# (ffmpeg: el -t va ANTES de cada -i lavfi; si no, la fuente no termina nunca)
set -euo pipefail
d="${1:?carpeta}"
mkdir -p "$d" && cd "$d"
ff() { ffmpeg -loglevel error -y "$@"; }
ff -f lavfi -t 6 -i testsrc=size=640x360:rate=25 -f lavfi -t 6 -i sine=frequency=440 -c:v libvpx -c:a libopus video-prueba.webm
ff -f lavfi -t 4 -i sine=frequency=330 -c:a libopus audio-prueba.ogg
echo "notas de prueba" > notas.txt
ff -f lavfi -i color=c=red:s=300x300 -frames:v 1 tapa.png
ff -f lavfi -t 180 -i sine=frequency=500 -i tapa.png -map 0 -map 1 -c:a libmp3lame -b:a 128k -c:v png \
  -id3v2_version 3 -metadata title=Prueba -disposition:v attached_pic real.mp3
ff -f lavfi -t 2 -i sine=frequency=600 nota.wav
echo "listo: $d"
