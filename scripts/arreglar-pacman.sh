#!/usr/bin/env bash
# Rearma el .pacman que deja electron-builder para que TODO quede anotado como root (uid/gid 0), como hace makepkg.
# electron-builder (fpm) arma el índice .MTREE con el usuario que construye (1000): los archivos se instalan bien como
# root, pero «pacman -Qkk diarlinux» decía «166 archivos alterados». Uso: scripts/arreglar-pacman.sh dist/diarLinux-X.pacman
set -euo pipefail
PKG=$(readlink -f "$1")
T=$(mktemp -d "$(dirname "$PKG")/.rearmar-XXXX")
trap 'rm -rf "$T"' EXIT
bsdtar -xpf "$PKG" -C "$T"
cd "$T"
rm -f .MTREE
LANG=C bsdtar --uid 0 --gid 0 --uname root --gname root -czf .MTREE --format=mtree \
  --options='!all,use-set,type,uid,gid,mode,time,size,md5,sha256,link' .PKGINFO .INSTALL usr opt
LANG=C bsdtar --uid 0 --gid 0 --uname root --gname root -cf - .MTREE .PKGINFO .INSTALL usr opt | xz -T0 -6 > "$PKG.nuevo"
mv "$PKG.nuevo" "$PKG"
echo "rearmado: $PKG"
