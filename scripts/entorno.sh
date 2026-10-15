# Uso: source scripts/entorno.sh   (antes de npm install / npm run ...)
# Deja TODAS las descargas y compilaciones dentro de diarLinux/.cache (nada en ~/.cache ni ~/.electron-gyp).
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export electron_config_cache="$RAIZ/.cache/electron"
export ELECTRON_BUILDER_CACHE="$RAIZ/.cache/electron-builder"
export npm_config_devdir="$RAIZ/.cache/gyp"
export npm_config_cache="$RAIZ/.cache/npm"
