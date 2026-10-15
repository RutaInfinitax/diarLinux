#!/usr/bin/env bash
# Abre diarLinux desde el código (compila la interfaz si hace falta). Todo queda dentro de esta carpeta.
#   ./iniciar.sh         Wayland nativo si la sesión es Wayland (si no, X11)
#   ./iniciar.sh --x11   fuerza X11 (XWayland)
cd "$(dirname "$(readlink -f "$0")")" || exit 1
source scripts/entorno.sh
EXTRA=(--ozone-platform-hint=auto)
case "$1" in
  --x11) EXTRA=(--ozone-platform=x11); shift ;;
  --wayland) EXTRA=(--ozone-platform=wayland); shift ;;
esac
if [ ! -f out/main/index.js ] || [ -n "$(find src -newer out/main/index.js -print -quit)" ]; then
  echo "Compilando diarLinux…"
  npx electron-vite build >/dev/null || { echo "No se pudo compilar"; exit 1; }
fi
exec ./node_modules/.bin/electron "${EXTRA[@]}" . "$@"
