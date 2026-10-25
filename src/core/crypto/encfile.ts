/**
 * Formato .enc — archivos cifrados por bloques (fotos, audios, videos, miniaturas).
 *
 * Cabecera (32 bytes):
 *   0  "DIAR"            magia
 *   4  versión (1)       = 1
 *   5  reservado (3)     = 0
 *   8  tamaño de bloque  uint32 LE (por defecto 1 MiB)
 *   12 nonce base (12)   al azar, uno por archivo
 *   24 tamaño original   uint64 LE
 * Después, cada bloque: AES-256-GCM(texto) + etiqueta de 16 bytes.
 *
 * - Nonce del bloque i = nonce base con XOR de i en los últimos 4 bytes.
 * - Datos asociados (AAD) de cada bloque = cabecera completa + id del archivo + índice + "¿es el
 *   último?". Así no se puede cambiar la cabecera, intercambiar bloques entre archivos,
 *   reordenarlos ni cortar el archivo sin que el descifrado falle.
 * - Como cada bloque se descifra solo, se puede leer un rango (cabecera Range) sin descifrar todo.
 */
import { ab, concat, randomBytes, te } from './bytes'

export const MAGIA = te.encode('DIAR')
export const VERSION = 1
export const CABECERA = 32
export const ETIQUETA = 16
export const BLOQUE_DEFECTO = 1024 * 1024

export class ArchivoDanado extends Error {
  constructor(msg = 'El archivo cifrado está dañado o no corresponde') {
    super(msg)
    this.name = 'ArchivoDanado'
  }
}

export interface InfoEnc {
  bloque: number
  nonceBase: Uint8Array
  tamano: number
  bloques: number
  cabecera: Uint8Array
}

export function importarLlave(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', ab(raw), 'AES-GCM', false, ['encrypt', 'decrypt'])
}

function nonceDe(base: Uint8Array, i: number): Uint8Array {
  // OJO: copia REAL. En un Buffer de Node, .slice() es una vista (no copia): se modificaría el nonce
  // base leído del archivo y desde el tercer bloque no se podría descifrar (bug del mp3 de 4 MB).
  const n = new Uint8Array(base)
  const v = new DataView(n.buffer, n.byteOffset, n.byteLength)
  v.setUint32(8, v.getUint32(8, false) ^ i, false)
  return n
}

function aadDe(cabecera: Uint8Array, id: string, i: number, ultimo: boolean): Uint8Array {
  const extra = new Uint8Array(5)
  new DataView(extra.buffer).setUint32(0, i, false)
  extra[4] = ultimo ? 1 : 0
  return concat(cabecera, te.encode(id), extra)
}

export function leerCabecera(entrada: Uint8Array): InfoEnc {
  const c = new Uint8Array(entrada.subarray(0, CABECERA)) // copia propia (la entrada puede ser un Buffer)
  if (c.length < CABECERA) throw new ArchivoDanado()
  for (let i = 0; i < 4; i++)
    if (c[i] !== MAGIA[i]) throw new ArchivoDanado('No es un archivo cifrado del diario')
  if (c[4] !== VERSION) throw new ArchivoDanado('Versión de archivo cifrado desconocida')
  const v = new DataView(c.buffer, c.byteOffset, CABECERA)
  const bloque = v.getUint32(8, true)
  const tamano = Number(v.getBigUint64(24, true))
  if (bloque < 1024 || bloque > 64 * 1024 * 1024 || !Number.isSafeInteger(tamano))
    throw new ArchivoDanado()
  return {
    bloque,
    nonceBase: c.slice(12, 24),
    tamano,
    bloques: Math.max(1, Math.ceil(tamano / bloque)),
    cabecera: c.slice(0, CABECERA)
  }
}

/** Tamaño en disco del archivo cifrado para `tamano` bytes originales. */
export function tamanoCifrado(tamano: number, bloque = BLOQUE_DEFECTO): number {
  return CABECERA + Math.max(1, Math.ceil(tamano / bloque)) * ETIQUETA + tamano
}

function cabeceraNueva(
  tamano: number,
  bloque: number
): { cabecera: Uint8Array; nonceBase: Uint8Array } {
  const cabecera = new Uint8Array(CABECERA)
  cabecera.set(MAGIA, 0)
  cabecera[4] = VERSION
  const v = new DataView(cabecera.buffer)
  v.setUint32(8, bloque, true)
  const nonceBase = randomBytes(12)
  cabecera.set(nonceBase, 12)
  v.setBigUint64(24, BigInt(tamano), true)
  return { cabecera, nonceBase }
}

/**
 * Cifra por partes, sin tener el archivo entero en memoria (videos de varios GB):
 * `leer(desde, largo)` da los bytes originales y `escribir` recibe la cabecera y cada bloque cifrado.
 */
export async function cifrarPorPartes(
  llave: CryptoKey,
  id: string,
  tamano: number,
  leer: (desde: number, largo: number) => Promise<Uint8Array> | Uint8Array,
  escribir: (b: Uint8Array) => Promise<void> | void,
  bloque = BLOQUE_DEFECTO
): Promise<void> {
  const { cabecera, nonceBase } = cabeceraNueva(tamano, bloque)
  await escribir(cabecera)
  const n = Math.max(1, Math.ceil(tamano / bloque))
  for (let i = 0; i < n; i++) {
    const largo = Math.min(bloque, tamano - i * bloque)
    const trozo = await leer(i * bloque, largo)
    if (trozo.length !== largo) throw new ArchivoDanado('El archivo cambió mientras se leía')
    const ct = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: ab(nonceDe(nonceBase, i)),
        additionalData: ab(aadDe(cabecera, id, i, i === n - 1))
      },
      llave,
      ab(trozo)
    )
    await escribir(new Uint8Array(ct))
  }
}

export async function cifrar(
  llave: CryptoKey,
  id: string,
  datos: Uint8Array,
  bloque = BLOQUE_DEFECTO
): Promise<Uint8Array> {
  const partes: Uint8Array[] = []
  await cifrarPorPartes(
    llave,
    id,
    datos.length,
    (d, l) => datos.subarray(d, d + l),
    (b) => void partes.push(b),
    bloque
  )
  return concat(...partes)
}

/** Descifra el bloque i. `leer(desde, largo)` devuelve bytes del archivo cifrado. */
async function bloqueN(
  llave: CryptoKey,
  id: string,
  info: InfoEnc,
  i: number,
  leer: (desde: number, largo: number) => Promise<Uint8Array> | Uint8Array
): Promise<Uint8Array> {
  const largoPlano = i === info.bloques - 1 ? info.tamano - i * info.bloque : info.bloque
  const desde = CABECERA + i * (info.bloque + ETIQUETA)
  const ct = await leer(desde, largoPlano + ETIQUETA)
  if (ct.length !== largoPlano + ETIQUETA) throw new ArchivoDanado()
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: ab(nonceDe(info.nonceBase, i)),
          additionalData: ab(aadDe(info.cabecera, id, i, i === info.bloques - 1))
        },
        llave,
        ab(ct)
      )
    )
  } catch {
    throw new ArchivoDanado()
  }
}

export async function descifrar(
  llave: CryptoKey,
  id: string,
  enc: Uint8Array
): Promise<Uint8Array> {
  const info = leerCabecera(enc.subarray(0, CABECERA))
  if (enc.length !== tamanoCifrado(info.tamano, info.bloque)) throw new ArchivoDanado()
  const leer = (d: number, l: number): Uint8Array => enc.subarray(d, d + l)
  const partes: Uint8Array[] = []
  for (let i = 0; i < info.bloques; i++) partes.push(await bloqueN(llave, id, info, i, leer))
  return concat(...partes)
}

/**
 * Descifra solo los bytes [inicio, fin] (incluido) del original, leyendo únicamente los
 * bloques necesarios. Para responder pedidos con cabecera Range (audio y video).
 */
export async function descifrarRango(
  llave: CryptoKey,
  id: string,
  info: InfoEnc,
  inicio: number,
  fin: number,
  leer: (desde: number, largo: number) => Promise<Uint8Array> | Uint8Array
): Promise<Uint8Array> {
  if (inicio < 0 || fin < inicio || fin >= info.tamano)
    throw new RangeError('Rango fuera del archivo')
  const b0 = Math.floor(inicio / info.bloque)
  const b1 = Math.floor(fin / info.bloque)
  const partes: Uint8Array[] = []
  for (let i = b0; i <= b1; i++) partes.push(await bloqueN(llave, id, info, i, leer))
  const todo = concat(...partes)
  const off = inicio - b0 * info.bloque
  return todo.slice(off, off + (fin - inicio + 1))
}
