/**
 * Adjuntos cifrados: fotos (2A), archivos, audios y videos (2B).
 *
 *   <carpeta>/attachments/<id>.enc        el archivo (las fotos ya rotadas y comprimidas en la ventana)
 *   <carpeta>/thumbs/<id>-512.enc         miniatura grande (fotos y videos)
 *   <carpeta>/thumbs/<id>-128.enc         miniatura chica (calendario)
 *
 * Todo con la subllave "archivos" y el formato .enc por bloques (el id del archivo va en los datos
 * asociados: no se puede cambiar uno por otro). Se descifra en memoria para el protocolo diario://.
 * Los archivos y videos se leen del disco y se cifran POR PARTES (no se cargan enteros: pueden ser GB).
 * Primero se escriben los archivos y después la fila: un corte deja como mucho archivos sueltos,
 * que se borran al abrir el diario (limpiarHuerfanos).
 *
 * "Abrir" un archivo con otro programa obliga a dejarlo descifrado: va a una carpeta en RAM
 * (/run/user/UID/diarlinux, tmpfs: nunca toca el disco) que se borra al bloquear y al salir.
 */
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { dialog, shell, type BrowserWindow } from 'electron'
import * as enc from '../core/crypto/encfile'
import type { Adjunto, AdjuntoExtra, FotoNueva } from '../shared/tipos'
import { leerConfig } from './config'
import { diario, ErrorDiario } from './diario'
import { escribirAtomico, sincronizarCarpeta } from './fsutil'
import { nombreConExtension } from '../shared/archivos'
import { t } from '../shared/i18n'

const MIME_FOTO = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])
const MAX_FOTO = 200 * 1024 * 1024
const MAX_MINI = 5 * 1024 * 1024
const MAX_ARCHIVO = 8 * 1024 * 1024 * 1024 // 8 GB
const MAX_DATOS = 500 * 1024 * 1024 // grabaciones de audio y archivos pegados
export const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const dir = (sub: 'attachments' | 'thumbs'): string => path.join(leerConfig().carpeta, sub)
const rutaAdjunto = (id: string): string => path.join(dir('attachments'), `${id}.enc`)
const rutaMini = (id: string, tam: 128 | 512): string =>
  path.join(dir('thumbs'), `${id}-${tam}.enc`)

// Tipo de contenido por extensión (lo que diga la ventana no se usa para decidir cómo servirlo)
const MIMES: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  mov: 'video/quicktime',
  ogv: 'video/ogg',
  avi: 'video/x-msvideo',
  '3gp': 'video/3gpp',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  weba: 'audio/webm',
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  heic: 'image/heic',
  amr: 'audio/amr'
}
export function mimeDe(nombre: string): string {
  return MIMES[path.extname(nombre).slice(1).toLowerCase()] ?? 'application/octet-stream'
}
function tipoDe(mime: string, pedido: Adjunto['tipo']): Adjunto['tipo'] {
  if (pedido === 'video' && mime.startsWith('video/')) return 'video'
  if (pedido === 'audio' && mime.startsWith('audio/')) return 'audio'
  return 'file'
}

interface Fila {
  id: string
  kind: Adjunto['tipo']
  mime: string
  original_name: string
  size: number
  width: number | null
  height: number | null
  duration: number | null
}

const aAdjunto = (f: Fila): Adjunto => ({
  id: f.id,
  tipo: f.kind,
  mime: f.mime,
  nombre: f.original_name,
  tamano: f.size,
  ancho: f.width,
  alto: f.height,
  duracion: f.duration
})

export function listarAdjuntos(entradaId: string): Adjunto[] {
  return (
    diario.base
      .prepare(
        `SELECT id, kind, mime, original_name, size, width, height, duration FROM attachments
         WHERE entry_id = ? AND deleted_at IS NULL ORDER BY sort_order, created_at`
      )
      .all(entradaId) as Fila[]
  ).map(aAdjunto)
}

function bytes(
  x: unknown,
  max: number,
  error = 'La foto no es válida o es demasiado grande'
): Uint8Array {
  if (!(x instanceof Uint8Array) || x.length === 0 || x.length > max) throw new ErrorDiario(error)
  return x
}

function exigirEntrada(entradaId: string): void {
  if (!diario.base.prepare('SELECT 1 FROM entries WHERE id = ?').get(entradaId))
    throw new ErrorDiario('La entrada no existe')
  fs.mkdirSync(dir('attachments'), { recursive: true, mode: 0o700 })
  fs.mkdirSync(dir('thumbs'), { recursive: true, mode: 0o700 })
}

/** Miniaturas opcionales (videos) u obligatorias (fotos). */
async function guardarMinis(
  llave: CryptoKey,
  id: string,
  m512?: unknown,
  m128?: unknown
): Promise<void> {
  if (m512 === undefined && m128 === undefined) return
  escribirAtomico(
    rutaMini(id, 512),
    await enc.cifrar(
      llave,
      `${id}-512`,
      bytes(m512, MAX_MINI, 'La miniatura no es válida o es demasiado grande')
    )
  )
  escribirAtomico(
    rutaMini(id, 128),
    await enc.cifrar(
      llave,
      `${id}-128`,
      bytes(m128, MAX_MINI, 'La miniatura no es válida o es demasiado grande')
    )
  )
}

function insertar(entradaId: string, a: Adjunto): Adjunto {
  const db = diario.base
  const t = new Date().toISOString()
  const orden = (
    db
      .prepare('SELECT coalesce(max(sort_order), -1) + 1 AS n FROM attachments WHERE entry_id = ?')
      .get(entradaId) as { n: number }
  ).n
  db.prepare(
    `INSERT INTO attachments (id, entry_id, kind, mime, original_name, size, width, height, duration, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    a.id,
    entradaId,
    a.tipo,
    a.mime,
    a.nombre,
    a.tamano,
    a.ancho,
    a.alto,
    a.duracion,
    orden,
    t,
    t
  )
  db.prepare('UPDATE entries SET updated_at = ? WHERE id = ?').run(t, entradaId)
  return a
}

const numero = (x: unknown): number | null =>
  Number.isFinite(Number(x)) && Number(x) > 0 ? Number(x) : null

export async function agregarFoto(entradaId: string, f: FotoNueva): Promise<Adjunto> {
  exigirEntrada(entradaId)
  if (!MIME_FOTO.has(f.mime)) throw new ErrorDiario('Ese tipo de imagen no se puede agregar')
  const original = bytes(f.original, MAX_FOTO)
  const llave = await diario.llaveAdjuntos()
  const id = randomUUID()
  escribirAtomico(rutaAdjunto(id), await enc.cifrar(llave, id, original))
  await guardarMinis(llave, id, f.mini512, f.mini128)
  return insertar(entradaId, {
    id,
    tipo: 'photo',
    mime: f.mime,
    nombre: String(f.nombre || 'foto').slice(0, 255),
    tamano: original.length,
    ancho: Math.round(f.ancho) || null,
    alto: Math.round(f.alto) || null,
    duracion: null
  })
}

/** Archivo o video elegido en el disco: se lee y se cifra por partes (sin cargarlo entero). */
export async function agregarDesdeRuta(
  entradaId: string,
  ruta: string,
  extra: AdjuntoExtra
): Promise<Adjunto> {
  const st = fs.statSync(ruta)
  if (!st.isFile()) throw new ErrorDiario('Eso no es un archivo')
  return agregarDesdeRango(entradaId, ruta, 0, st.size, path.basename(ruta), extra)
}

/**
 * Una parte de un archivo (`tamano` bytes desde `desde`) como adjunto: así se importa un recurso que
 * está DENTRO de un .jex (tar) sin extraerlo sin cifrar al disco.
 */
export async function agregarDesdeRango(
  entradaId: string,
  ruta: string,
  desde: number,
  tamano: number,
  nombreOriginal: string,
  extra: AdjuntoExtra
): Promise<Adjunto> {
  exigirEntrada(entradaId)
  if (tamano > MAX_ARCHIVO) throw new ErrorDiario('El archivo es demasiado grande (máximo 8 GB)')
  const st = { size: tamano }
  const nombre = nombreOriginal.slice(0, 255)
  const mime = mimeDe(nombre)
  const tipo = tipoDe(mime, extra.tipo)
  const llave = await diario.llaveAdjuntos()
  const id = randomUUID()
  const destino = rutaAdjunto(id)
  const tmp = `${destino}.tmp`
  const fin = fs.openSync(ruta, 'r')
  const fout = fs.openSync(tmp, 'w', 0o600)
  try {
    await enc.cifrarPorPartes(
      llave,
      id,
      st.size,
      (pos, largo) => {
        const b = Buffer.alloc(largo)
        const n = fs.readSync(fin, b, 0, largo, desde + pos)
        return b.subarray(0, n)
      },
      (b) => void fs.writeSync(fout, b)
    )
    fs.fsyncSync(fout)
  } catch (e) {
    fs.closeSync(fout)
    fs.rmSync(tmp, { force: true })
    throw e
  } finally {
    fs.closeSync(fin)
  }
  fs.closeSync(fout)
  fs.renameSync(tmp, destino)
  sincronizarCarpeta(path.dirname(destino))
  if (tipo === 'video') await guardarMinis(llave, id, extra.mini512, extra.mini128)
  return insertar(entradaId, {
    id,
    tipo,
    mime,
    nombre,
    tamano: st.size,
    ancho: numero(extra.ancho),
    alto: numero(extra.alto),
    duracion: numero(extra.duracion)
  })
}

/** Datos ya en memoria (grabación de audio, archivo pegado). */
export async function agregarDatos(
  entradaId: string,
  nombre: string,
  datos: unknown,
  extra: AdjuntoExtra
): Promise<Adjunto> {
  exigirEntrada(entradaId)
  const b = bytes(datos, MAX_DATOS, 'El archivo no es válido o es demasiado grande')
  const n = String(nombre || 'archivo').slice(0, 255)
  const mime = extra.tipo === 'audio' && n.endsWith('.webm') ? 'audio/webm' : mimeDe(n)
  const tipo = tipoDe(mime, extra.tipo)
  const llave = await diario.llaveAdjuntos()
  const id = randomUUID()
  escribirAtomico(rutaAdjunto(id), await enc.cifrar(llave, id, b))
  if (tipo === 'video') await guardarMinis(llave, id, extra.mini512, extra.mini128)
  return insertar(entradaId, {
    id,
    tipo,
    mime,
    nombre: n,
    tamano: b.length,
    ancho: numero(extra.ancho),
    alto: numero(extra.alto),
    duracion: numero(extra.duracion)
  })
}

/** Copia un adjunto a otra entrada (Duplicar): se descifra y vuelve a cifrar por bloques, con id nuevo. */
export async function copiarAdjunto(id: string, entradaDestino: string): Promise<Adjunto> {
  exigirEntrada(entradaDestino)
  const f = filaDe(id)
  const llave = await diario.llaveAdjuntos()
  const nuevo = randomUUID()
  const fd = fs.openSync(rutaAdjunto(id), 'r')
  const tmp = `${rutaAdjunto(nuevo)}.tmp`
  const fo = fs.openSync(tmp, 'w', 0o600)
  try {
    const leer = (desde: number, largo: number): Uint8Array => {
      const b = Buffer.alloc(largo)
      const n = fs.readSync(fd, b, 0, largo, desde)
      return b.subarray(0, n)
    }
    const info = enc.leerCabecera(leer(0, enc.CABECERA))
    await enc.cifrarPorPartes(
      llave,
      nuevo,
      info.tamano,
      (pos, largo) => enc.descifrarRango(llave, id, info, pos, pos + largo - 1, leer),
      (b) => void fs.writeSync(fo, b)
    )
    fs.fsyncSync(fo)
  } catch (e) {
    fs.closeSync(fo)
    fs.rmSync(tmp, { force: true })
    throw e
  } finally {
    fs.closeSync(fd)
  }
  fs.closeSync(fo)
  fs.renameSync(tmp, rutaAdjunto(nuevo))
  // miniaturas (fotos y videos)
  for (const tam of [512, 128] as const) {
    const ruta = rutaMini(id, tam)
    if (!fs.existsSync(ruta)) continue
    const plano = await enc.descifrar(llave, `${id}-${tam}`, fs.readFileSync(ruta))
    escribirAtomico(rutaMini(nuevo, tam), await enc.cifrar(llave, `${nuevo}-${tam}`, plano))
  }
  return insertar(entradaDestino, {
    id: nuevo,
    tipo: f.kind,
    mime: f.mime,
    nombre: f.original_name,
    tamano: f.size,
    ancho: f.width,
    alto: f.height,
    duracion: f.duration
  })
}

/** Bytes cifrados que ocupan adjuntos y miniaturas (estadísticas). */
export function tamanoAdjuntos(): number {
  let total = 0
  for (const sub of ['attachments', 'thumbs']) {
    const dir = path.join(diario.carpeta, sub)
    if (!fs.existsSync(dir)) continue
    for (const n of fs.readdirSync(dir)) total += fs.statSync(path.join(dir, n)).size
  }
  return total
}

/** Borra todos los archivos de adjuntos (Restablecer diario). */
export function borrarTodosLosAdjuntos(): void {
  for (const sub of ['attachments', 'thumbs']) {
    const dir = path.join(diario.carpeta, sub)
    if (!fs.existsSync(dir)) continue
    for (const n of fs.readdirSync(dir))
      if (n.endsWith('.enc')) fs.rmSync(path.join(dir, n), { force: true })
  }
  vaciarCache()
}

// ── descifrar a un archivo (abrir con otro programa / guardar una copia) ──
export async function descifrarA(id: string, destino: string): Promise<void> {
  const llave = await diario.llaveAdjuntos()
  const fd = fs.openSync(rutaAdjunto(id), 'r')
  const tmp = `${destino}.parcial`
  const fo = fs.openSync(tmp, 'w', 0o600)
  try {
    const leer = (desde: number, largo: number): Uint8Array => {
      const b = Buffer.alloc(largo)
      return b.subarray(0, fs.readSync(fd, b, 0, largo, desde))
    }
    const info = enc.leerCabecera(leer(0, enc.CABECERA))
    for (let i = 0; i < info.bloques && info.tamano > 0; i++) {
      const a = i * info.bloque
      const b = Math.min(info.tamano, a + info.bloque) - 1
      fs.writeSync(fo, await enc.descifrarRango(llave, id, info, a, b, leer))
    }
    fs.fsyncSync(fo)
  } catch (e) {
    fs.rmSync(tmp, { force: true })
    throw e
  } finally {
    fs.closeSync(fd)
    fs.closeSync(fo)
  }
  fs.renameSync(tmp, destino)
}

/** Todo el adjunto descifrado en memoria (exportar: fotos para incrustar). */
export async function leerAdjunto(id: string): Promise<Buffer> {
  const llave = await diario.llaveAdjuntos()
  const fd = fs.openSync(rutaAdjunto(id), 'r')
  try {
    const leer = (desde: number, largo: number): Uint8Array => {
      const b = Buffer.alloc(largo)
      return b.subarray(0, fs.readSync(fd, b, 0, largo, desde))
    }
    const info = enc.leerCabecera(leer(0, enc.CABECERA))
    const partes: Uint8Array[] = []
    for (let i = 0; i < info.bloques && info.tamano > 0; i++) {
      const a = i * info.bloque
      const b = Math.min(info.tamano, a + info.bloque) - 1
      partes.push(await enc.descifrarRango(llave, id, info, a, b, leer))
    }
    return Buffer.concat(partes)
  } finally {
    fs.closeSync(fd)
  }
}

function filaDe(id: string): Fila {
  if (!ID.test(id)) throw new ErrorDiario('Dato inválido')
  const f = diario.base.prepare('SELECT * FROM attachments WHERE id = ?').get(id) as
    Fila | undefined
  if (!f) throw new ErrorDiario('El archivo ya no existe')
  return f
}

/** Carpeta temporal en RAM para abrir archivos con otro programa. */
export function carpetaTemporal(): string {
  const base =
    process.env.XDG_RUNTIME_DIR && fs.existsSync(process.env.XDG_RUNTIME_DIR)
      ? process.env.XDG_RUNTIME_DIR
      : os.tmpdir()
  // Las pruebas (diario temporal) usan su propia carpeta: nunca tocan la del diario real
  return path.join(
    base,
    process.env.DIARLINUX_DATA ? `diarlinux-abiertos-prueba-${process.pid}` : 'diarlinux-abiertos'
  )
}

export function borrarTemporales(): void {
  fs.rmSync(carpetaTemporal(), { recursive: true, force: true })
}

export async function abrirAdjunto(id: string): Promise<void> {
  const f = filaDe(id)
  const d = path.join(carpetaTemporal(), id.slice(0, 8))
  fs.mkdirSync(d, { recursive: true, mode: 0o700 })
  const destino = path.join(
    d,
    nombreConExtension(path.basename(f.original_name) || 'archivo', f.mime)
  )
  if (!fs.existsSync(destino)) await descifrarA(id, destino)
  if (process.env.DIARLINUX_OCULTA === '1') return // pruebas: no abrir programas en la pantalla
  const error = await shell.openPath(destino)
  if (error) throw new ErrorDiario('No hay ningún programa para abrir este archivo')
}

export async function guardarCopia(
  id: string,
  ventana: BrowserWindow | null
): Promise<string | null> {
  const f = filaDe(id)
  // pruebas: sin diálogo
  if (process.env.DIARLINUX_OCULTA === '1' && process.env.DIARLINUX_GUARDAR_EN) {
    await descifrarA(id, process.env.DIARLINUX_GUARDAR_EN)
    return process.env.DIARLINUX_GUARDAR_EN
  }
  const r = await dialog.showSaveDialog(ventana!, {
    title: t('Guardar una copia (sin cifrar)'),
    defaultPath: path.join(
      os.homedir(),
      'Descargas',
      nombreConExtension(path.basename(f.original_name), f.mime)
    )
  })
  if (r.canceled || !r.filePath) return null
  await descifrarA(id, r.filePath)
  return r.filePath
}

function borrarArchivos(id: string): void {
  for (const r of [rutaAdjunto(id), rutaMini(id, 512), rutaMini(id, 128)])
    fs.rmSync(r, { force: true })
  cache.delete(`${id}-512`)
  cache.delete(`${id}-128`)
}

export function eliminarAdjunto(id: string): void {
  if (!ID.test(id)) throw new ErrorDiario('Dato inválido')
  diario.base.prepare('DELETE FROM attachments WHERE id = ?').run(id) // primero la fila
  borrarArchivos(id)
}

/** Al eliminar una entrada: sus adjuntos (filas y archivos). */
export function eliminarAdjuntosDe(entradaId: string): void {
  const ids = (
    diario.base.prepare('SELECT id FROM attachments WHERE entry_id = ?').all(entradaId) as {
      id: string
    }[]
  ).map((f) => f.id)
  diario.base.prepare('DELETE FROM attachments WHERE entry_id = ?').run(entradaId)
  for (const id of ids) borrarArchivos(id)
}

/** Archivos .enc sin fila (por un corte justo al agregar): se borran al abrir el diario. */
export function limpiarHuerfanos(): void {
  const vivos = new Set(
    (diario.base.prepare('SELECT id FROM attachments').all() as { id: string }[]).map((f) => f.id)
  )
  for (const sub of ['attachments', 'thumbs'] as const) {
    const d = dir(sub)
    if (!fs.existsSync(d)) continue
    for (const n of fs.readdirSync(d)) {
      const id = n.slice(0, 36)
      if (n.endsWith('.tmp') || (ID.test(id) && !vivos.has(id)))
        fs.rmSync(path.join(d, n), { force: true })
    }
  }
}

// ── protocolo diario:// (solo con el diario abierto; todo se descifra en memoria) ──
// diario://adjunto/<id>       el archivo (con soporte de Range para audio y video)
// diario://mini/<id>/<512|128> miniatura webp
const cache = new Map<string, Uint8Array>() // miniaturas descifradas (LRU simple)
const CACHE_MAX = 600

export function vaciarCache(): void {
  cache.clear()
}

async function leerMini(id: string, tam: 128 | 512): Promise<Uint8Array> {
  const clave = `${id}-${tam}`
  const enCache = cache.get(clave)
  if (enCache) {
    cache.delete(clave)
    cache.set(clave, enCache)
    return enCache
  }
  const datos = await enc.descifrar(
    await diario.llaveAdjuntos(),
    clave,
    fs.readFileSync(rutaMini(id, tam))
  )
  cache.set(clave, datos)
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!)
  return datos
}

const noEncontrado = (): Response => new Response('No encontrado', { status: 404 })

export async function responderProtocolo(req: Request): Promise<Response> {
  if (!diario.abierto) return new Response('Bloqueado', { status: 403 })
  const u = new URL(req.url)
  const partes = u.pathname.split('/').filter(Boolean)
  try {
    if (u.host === 'mini') {
      const [id, tam] = partes
      if (!ID.test(id) || (tam !== '128' && tam !== '512')) return noEncontrado()
      const datos = await leerMini(id, Number(tam) as 128 | 512)
      return new Response(datos as unknown as BodyInit, {
        headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'no-store' }
      })
    }
    if (u.host === 'adjunto') {
      const [id] = partes
      if (!ID.test(id)) return noEncontrado()
      const fila = diario.base.prepare('SELECT mime FROM attachments WHERE id = ?').get(id) as
        { mime: string } | undefined
      if (!fila) return noEncontrado()
      return await responderArchivo(id, fila.mime, req.headers.get('Range'))
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return noEncontrado()
    console.error(
      '[diario://] no se pudo leer un adjunto:',
      (e as Error).name,
      process.env.DIARLINUX_OCULTA === '1' ? (e as Error).message : ''
    )
    return new Response('Error', { status: 500 })
  }
  return noEncontrado()
}

async function responderArchivo(id: string, mime: string, rango: string | null): Promise<Response> {
  const llave = await diario.llaveAdjuntos()
  const fd = fs.openSync(rutaAdjunto(id), 'r')
  try {
    const leer = (desde: number, largo: number): Uint8Array => {
      const b = Buffer.alloc(largo)
      const n = fs.readSync(fd, b, 0, largo, desde)
      return b.subarray(0, n)
    }
    const info = enc.leerCabecera(leer(0, enc.CABECERA))
    const comun = { 'Content-Type': mime, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' }
    const m = rango?.match(/^bytes=(\d*)-(\d*)$/)
    if (m && info.tamano > 0) {
      let a = m[1] ? Number(m[1]) : info.tamano - Number(m[2])
      let b = m[1] && m[2] ? Number(m[2]) : info.tamano - 1
      a = Math.max(0, a)
      b = Math.min(info.tamano - 1, b, a + 8 * 1024 * 1024 - 1) // como mucho 8 MB por pedido
      if (a > b)
        return new Response(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${info.tamano}` }
        })
      const datos = await enc.descifrarRango(llave, id, info, a, b, leer)
      return new Response(datos as unknown as BodyInit, {
        status: 206,
        headers: {
          ...comun,
          'Content-Range': `bytes ${a}-${b}/${info.tamano}`,
          'Content-Length': String(datos.length)
        }
      })
    }
    const todo = await enc.descifrar(llave, id, fs.readFileSync(rutaAdjunto(id)))
    return new Response(todo as unknown as BodyInit, {
      headers: { ...comun, 'Content-Length': String(todo.length) }
    })
  } finally {
    fs.closeSync(fd)
  }
}
