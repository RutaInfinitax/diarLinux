import fs from 'node:fs'
import path from 'node:path'

/** Escribe completo o nada: archivo temporal + fsync + rename + fsync de la carpeta. */
export function escribirAtomico(ruta: string, datos: Uint8Array | string, modo = 0o600): void {
  const tmp = `${ruta}.tmp-${process.pid}`
  const fd = fs.openSync(tmp, 'w', modo)
  try {
    fs.writeSync(fd, typeof datos === 'string' ? Buffer.from(datos, 'utf8') : datos)
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
  fs.renameSync(tmp, ruta)
  sincronizarCarpeta(path.dirname(ruta))
}

export function sincronizarCarpeta(dir: string): void {
  try {
    const fd = fs.openSync(dir, 'r')
    try {
      fs.fsyncSync(fd)
    } finally {
      fs.closeSync(fd)
    }
  } catch {
    /* algunos sistemas de archivos no lo permiten: no es grave */
  }
}
