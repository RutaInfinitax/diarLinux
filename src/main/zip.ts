/**
 * Lector mínimo de .zip (exportación de Diarium): índice desde el directorio central y lectura de
 * un archivo descomprimiéndolo en memoria (sin extraer nada al disco). Métodos: guardado (0) y
 * deflate (8). Sin ZIP64 (archivos de hasta 4 GB, de sobra para una exportación).
 */
import fs from 'node:fs'
import zlib from 'node:zlib'

export interface EntradaZip {
  nombre: string
  metodo: number
  comprimido: number
  tamano: number
  cabecera: number // posición de la cabecera local
}

export function indexarZip(ruta: string): Map<string, EntradaZip> {
  const fd = fs.openSync(ruta, 'r')
  try {
    const total = fs.fstatSync(fd).size
    const cola = Buffer.alloc(Math.min(total, 65_557))
    fs.readSync(fd, cola, 0, cola.length, total - cola.length)
    let eocd = -1
    for (let i = cola.length - 22; i >= 0; i--)
      if (cola.readUInt32LE(i) === 0x06054b50) {
        eocd = i
        break
      }
    if (eocd < 0) throw new Error('No es un archivo .zip válido')
    const cuantos = cola.readUInt16LE(eocd + 10)
    const tam = cola.readUInt32LE(eocd + 12)
    const desde = cola.readUInt32LE(eocd + 16)
    if (desde === 0xffffffff || cuantos === 0xffff)
      throw new Error('El .zip es demasiado grande (ZIP64)')
    const dir = Buffer.alloc(tam)
    fs.readSync(fd, dir, 0, tam, desde)
    const indice = new Map<string, EntradaZip>()
    let p = 0
    for (let n = 0; n < cuantos && p + 46 <= dir.length; n++) {
      if (dir.readUInt32LE(p) !== 0x02014b50) throw new Error('El .zip está dañado')
      const largoNombre = dir.readUInt16LE(p + 28)
      const extra = dir.readUInt16LE(p + 30)
      const comentario = dir.readUInt16LE(p + 32)
      const nombre = dir.toString('utf8', p + 46, p + 46 + largoNombre)
      if (!nombre.endsWith('/'))
        indice.set(nombre, {
          nombre,
          metodo: dir.readUInt16LE(p + 10),
          comprimido: dir.readUInt32LE(p + 20),
          tamano: dir.readUInt32LE(p + 24),
          cabecera: dir.readUInt32LE(p + 42)
        })
      p += 46 + largoNombre + extra + comentario
    }
    return indice
  } finally {
    fs.closeSync(fd)
  }
}

export function leerZip(ruta: string, e: EntradaZip, max = 600 * 1024 * 1024): Buffer {
  if (e.tamano > max) throw new Error('Ese archivo es demasiado grande para leerlo de una vez')
  const fd = fs.openSync(ruta, 'r')
  try {
    const h = Buffer.alloc(30)
    fs.readSync(fd, h, 0, 30, e.cabecera)
    if (h.readUInt32LE(0) !== 0x04034b50) throw new Error('El .zip está dañado')
    const datos = e.cabecera + 30 + h.readUInt16LE(26) + h.readUInt16LE(28)
    const b = Buffer.alloc(e.comprimido)
    fs.readSync(fd, b, 0, e.comprimido, datos)
    if (e.metodo === 0) return b
    if (e.metodo === 8) return zlib.inflateRawSync(b, { maxOutputLength: Math.max(e.tamano, 1) })
    throw new Error('Ese .zip usa una compresión que no se puede leer')
  } finally {
    fs.closeSync(fd)
  }
}
