/**
 * Importar desde Joplin (JEX o carpeta RAW) y desde Diarium (.zip con JSON + media/).
 * Nada se extrae sin cifrar al disco: el .jex (tar sin comprimir) se lee en su lugar y los recursos
 * se cifran por partes desde su posición; los del .zip se descomprimen en memoria y se cifran.
 * La ventana dirige la importación nota por nota (fotos y videos se procesan allá, como al
 * agregarlos a mano) y main entrega los datos y guarda los adjuntos.
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  fechaHoraLocal,
  htmlDeJoplin,
  leerItem,
  markdownAHtml,
  nombreRecurso,
  TIPO_JOPLIN,
  type ItemJoplin
} from '../core/services/joplin'
import type {
  Adjunto,
  AdjuntoExtra,
  NotaImportar,
  RecursoImportar,
  ResumenImportacion,
  TipoAdjunto
} from '../shared/tipos'
import { leerDiarium, repartirMedia, type EntradaDiarium } from '../core/services/diarium'
import { agregarDatos, agregarDesdeRango, mimeDe } from './adjuntos'
import { indexarZip, leerZip, type EntradaZip } from './zip'
import { diario, ErrorDiario } from './diario'

interface Pedazo {
  ruta: string // archivo en el disco (el .jex o el archivo suelto de la carpeta RAW)
  desde: number
  tamano: number
}

/** Índice de un tar (ustar, con nombres largos pax / GNU): nombre → posición del contenido. */
export function indexarTar(ruta: string): Map<string, Pedazo> {
  const fd = fs.openSync(ruta, 'r')
  const indice = new Map<string, Pedazo>()
  try {
    const total = fs.fstatSync(fd).size
    const h = Buffer.alloc(512)
    let pos = 0
    let nombreLargo: string | null = null
    while (pos + 512 <= total) {
      fs.readSync(fd, h, 0, 512, pos)
      if (h.every((b) => b === 0)) break
      const texto = (a: number, b: number): string => h.toString('utf8', a, b).replace(/\0.*$/s, '')
      const tamano = parseInt(texto(124, 136).trim() || '0', 8)
      const tipo = String.fromCharCode(h[156] || 48)
      const prefijo = h.toString('utf8', 257, 263).startsWith('ustar') ? texto(345, 500) : ''
      let nombre = nombreLargo ?? (prefijo ? `${prefijo}/${texto(0, 100)}` : texto(0, 100))
      const datos = pos + 512
      if (tipo === 'x' || tipo === 'L') {
        const b = Buffer.alloc(tamano)
        fs.readSync(fd, b, 0, tamano, datos)
        if (tipo === 'L') nombreLargo = b.toString('utf8').replace(/\0.*$/s, '')
        else {
          const m = /\d+ path=([^\n]*)\n/.exec(b.toString('utf8'))
          nombreLargo = m ? m[1] : null
        }
      } else {
        nombreLargo = null
        nombre = nombre.replace(/^\.\//, '')
        if (tipo === '0' || tipo === '\0' || tipo === '7')
          indice.set(nombre, { ruta, desde: datos, tamano })
      }
      pos = datos + Math.ceil(tamano / 512) * 512
    }
  } finally {
    fs.closeSync(fd)
  }
  return indice
}

/** Carpeta RAW: los mismos nombres que dentro del .jex. */
function indexarCarpeta(dir: string): Map<string, Pedazo> {
  const indice = new Map<string, Pedazo>()
  const agregar = (rel: string): void => {
    const ruta = path.join(dir, rel)
    const st = fs.statSync(ruta)
    if (st.isFile()) indice.set(rel, { ruta, desde: 0, tamano: st.size })
  }
  for (const n of fs.readdirSync(dir)) if (n.endsWith('.md')) agregar(n)
  const rec = path.join(dir, 'resources')
  if (fs.existsSync(rec)) for (const n of fs.readdirSync(rec)) agregar(`resources/${n}`)
  return indice
}

function leerPedazo(p: Pedazo, max = 50 * 1024 * 1024): Buffer {
  if (p.tamano > max)
    throw new ErrorDiario('Ese archivo es demasiado grande para leerlo de una vez')
  const fd = fs.openSync(p.ruta, 'r')
  try {
    const b = Buffer.alloc(p.tamano)
    fs.readSync(fd, b, 0, p.tamano, p.desde)
    return b
  } finally {
    fs.closeSync(fd)
  }
}

interface Recurso {
  id: string
  nombre: string
  mime: string
  tipo: TipoAdjunto
  pedazo: Pedazo | null // Joplin: posición dentro del .jex (o archivo suelto)
  zip?: EntradaZip // Diarium: archivo comprimido dentro del .zip
}

type Origen = 'joplin' | 'diarium'

interface Sesion {
  origen: Origen
  ruta: string
  diarium?: EntradaDiarium[]
  mediaDe?: Map<string, string[]> // Diarium: idExterno → rutas en el zip
  notas: ItemJoplin[] // ya filtradas (sin papelera, cifradas ni conflictos), de la más vieja a la más nueva
  recursos: Map<string, Recurso>
  libretas: Map<string, ItemJoplin>
  etiquetasDe: Map<string, string[]>
}

let sesion: Sesion | null = null

const IMAGENES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])

function tipoDeMime(mime: string): TipoAdjunto {
  if (IMAGENES.has(mime)) return 'photo'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  return 'file'
}

function yaImportada(origen: Origen, idExterno: string): string | null {
  const f = diario.base
    .prepare(
      `SELECT i.entry_id FROM importados i JOIN entries e ON e.id = i.entry_id
       WHERE i.origen = ? AND i.id_externo = ? AND e.deleted_at IS NULL`
    )
    .get(origen, idExterno) as { entry_id: string } | undefined
  return f?.entry_id ?? null
}

const fechaDe = (n: ItemJoplin): string =>
  n.props.user_created_time || n.props.created_time || n.props.user_updated_time || ''

export function analizarJoplin(ruta: string): ResumenImportacion {
  const st = fs.statSync(ruta)
  const indice = st.isDirectory() ? indexarCarpeta(ruta) : indexarTar(ruta)
  const items: ItemJoplin[] = []
  for (const [nombre, p] of indice)
    if (/^[0-9a-f]{32}\.md$/.test(nombre)) items.push(leerItem(leerPedazo(p).toString('utf8')))
  if (!items.length)
    throw new ErrorDiario(
      'Eso no parece una exportación de Joplin (JEX o carpeta RAW): no tiene notas'
    )

  const recursos = new Map<string, Recurso>()
  const libretas = new Map<string, ItemJoplin>()
  const etiquetas = new Map<string, string>()
  const notas: ItemJoplin[] = []
  const omitidas = { papelera: 0, cifradas: 0, conflictos: 0 }
  let conUbicacion = 0
  const enlaces: { nota: string; etiqueta: string }[] = []
  for (const it of items) {
    const id = it.props.id
    if (it.tipo === TIPO_JOPLIN.libreta) libretas.set(id, it)
    else if (it.tipo === TIPO_JOPLIN.etiqueta) etiquetas.set(id, it.titulo)
    else if (it.tipo === TIPO_JOPLIN.notaEtiqueta)
      enlaces.push({ nota: it.props.note_id, etiqueta: it.props.tag_id })
    else if (it.tipo === TIPO_JOPLIN.recurso) {
      const nombre = nombreRecurso(it)
      const mime = it.props.mime || mimeDe(nombre)
      const ext = it.props.file_extension
      const pedazo =
        indice.get(`resources/${id}${ext ? '.' + ext : ''}`) ??
        [...indice.entries()].find(([n]) => n.startsWith(`resources/${id}`))?.[1] ??
        null
      recursos.set(id, { id, nombre, mime, tipo: tipoDeMime(mime), pedazo })
    } else if (it.tipo === TIPO_JOPLIN.nota) {
      if (it.props.deleted_time && it.props.deleted_time !== '0') omitidas.papelera++
      else if (it.props.encryption_applied === '1') omitidas.cifradas++
      else if (it.props.is_conflict === '1') omitidas.conflictos++
      else {
        notas.push(it)
        if (Number(it.props.latitude) || Number(it.props.longitude)) conUbicacion++
      }
    }
  }
  const etiquetasDe = new Map<string, string[]>()
  for (const e of enlaces) {
    const nombre = etiquetas.get(e.etiqueta)
    if (!nombre) continue
    const l = etiquetasDe.get(e.nota) ?? []
    if (!l.includes(nombre)) l.push(nombre)
    etiquetasDe.set(e.nota, l)
  }
  notas.sort((a, b) => fechaDe(a).localeCompare(fechaDe(b)))
  sesion = { origen: 'joplin', ruta, notas, recursos, libretas, etiquetasDe }

  // recursos usados por las notas a importar
  const usados = new Set<string>()
  let faltantes = 0
  for (const n of notas)
    for (const id of convertir(n).recursos) {
      usados.add(id)
      if (!recursos.get(id)?.pedazo) faltantes++
    }
  const cuenta = { photo: 0, video: 0, audio: 0, file: 0 }
  let bytes = 0
  for (const id of usados) {
    const r = recursos.get(id)
    if (!r?.pedazo) continue
    cuenta[r.tipo]++
    bytes += r.pedazo.tamano
  }
  const fechas = notas.map((n) => fechaHoraLocal(fechaDe(n))?.fecha).filter(Boolean) as string[]
  const porLibreta = new Map<string, number>()
  for (const n of notas) {
    const t = libretas.get(n.props.parent_id)?.titulo ?? '(sin libreta)'
    porLibreta.set(t, (porLibreta.get(t) ?? 0) + 1)
  }
  return {
    ruta,
    notas: notas.length,
    yaImportadas: notas.filter((n) => yaImportada('joplin', n.props.id)).length,
    libretas: [...porLibreta].map(([nombre, cantidad]) => ({ nombre, cantidad })),
    etiquetas: new Set([...etiquetasDe.values()].flat()).size,
    fotos: cuenta.photo,
    videos: cuenta.video,
    audios: cuenta.audio,
    archivos: cuenta.file,
    bytes,
    faltantes,
    sinUsar: [...recursos.keys()].filter((id) => !usados.has(id)).length,
    desde: fechas[0] ?? null,
    hasta: fechas[fechas.length - 1] ?? null,
    omitidas,
    conUbicacion
  }
}

function convertir(n: ItemJoplin): { html: string; recursos: string[] } {
  const esRecurso = (id: string): boolean => sesion!.recursos.has(id)
  return n.props.markup_language === '2'
    ? htmlDeJoplin(n.cuerpo, esRecurso)
    : markdownAHtml(n.cuerpo, esRecurso)
}

function exigirSesion(origen?: Origen): Sesion {
  if (!sesion || (origen && sesion.origen !== origen))
    throw new ErrorDiario('Primero elige la exportación a importar')
  return sesion
}

const escHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Nota `i` lista para guardar (la ventana sanea el HTML con DOMPurify antes de guardarla). */
export function notaJoplin(i: number, libretasComoEtiquetas: boolean): NotaImportar {
  const s = exigirSesion('joplin')
  const n = s.notas[i]
  if (!n) throw new ErrorDiario('Esa nota no existe')
  const { html, recursos } = convertir(n)
  const cuando = fechaHoraLocal(fechaDe(n)) ?? fechaHoraLocal(new Date().toISOString())!
  const etiquetas = [...(s.etiquetasDe.get(n.props.id) ?? [])]
  if (libretasComoEtiquetas) {
    const lib = s.libretas.get(n.props.parent_id)?.titulo
    if (lib && !etiquetas.some((e) => e.toLowerCase() === lib.toLowerCase())) etiquetas.push(lib)
  }
  // Tarea de Joplin: se conserva como casilla al principio (hecha o no)
  const tarea =
    n.props.is_todo === '1'
      ? `<ul data-type="taskList"><li data-type="taskItem" data-checked="${
          n.props.todo_completed && n.props.todo_completed !== '0' ? 'true' : 'false'
        }"><p>${escHtml(n.titulo || 'Tarea')}</p></li></ul>`
      : ''
  return {
    idExterno: n.props.id,
    titulo: n.titulo,
    fecha: cuando.fecha,
    hora: cuando.hora,
    html: tarea + html,
    etiquetas,
    personas: [],
    recursos: recursos
      .map((id) => s.recursos.get(id))
      .filter((r): r is Recurso => !!r?.pedazo)
      .map(aImportar),
    yaImportada: !!yaImportada('joplin', n.props.id)
  }
}

const aImportar = (r: Recurso): RecursoImportar => ({
  id: r.id,
  nombre: r.nombre,
  mime: r.mime,
  tipo: r.tipo,
  tamano: r.zip ? r.zip.tamano : r.pedazo!.tamano
})

// ── Diarium ──

/** Lee el .zip exportado de Diarium (formato JSON con los adjuntos aparte). */
export function analizarDiarium(ruta: string): ResumenImportacion {
  let indice: Map<string, EntradaZip>
  try {
    indice = indexarZip(ruta)
  } catch (e) {
    throw new ErrorDiario((e as Error).message)
  }
  const json = [...indice.values()].find(
    (e) => !e.nombre.includes('/') && e.nombre.endsWith('.json')
  )
  if (!json)
    throw new ErrorDiario(
      'Ese .zip no parece una exportación de Diarium: en Diarium exporta en formato JSON'
    )
  let datos: ReturnType<typeof leerDiarium>
  try {
    datos = leerDiarium(JSON.parse(leerZip(ruta, json, 200 * 1024 * 1024).toString('utf8')))
  } catch {
    throw new ErrorDiario('No se pudo leer la exportación de Diarium (¿el .zip está completo?)')
  }
  const { entradas } = datos
  const media = [...indice.keys()].filter((n) => n.startsWith('media/'))
  const { porEntrada, sinEntrada } = repartirMedia(entradas, media)
  const recursos = new Map<string, Recurso>()
  for (const n of media) {
    const nombre = n.split('/').pop()!
    const mime = mimeDe(nombre)
    recursos.set(n, {
      id: n,
      nombre,
      mime,
      tipo: tipoDeMime(mime),
      pedazo: null,
      zip: indice.get(n)!
    })
  }
  sesion = {
    origen: 'diarium',
    ruta,
    diarium: entradas,
    mediaDe: porEntrada,
    notas: [],
    recursos,
    libretas: new Map(),
    etiquetasDe: new Map()
  }
  const cuenta = { photo: 0, video: 0, audio: 0, file: 0 }
  let bytes = 0
  for (const l of porEntrada.values())
    for (const n of l) {
      const r = recursos.get(n)!
      cuenta[r.tipo]++
      bytes += r.zip!.tamano
    }
  return {
    ruta,
    notas: entradas.length,
    yaImportadas: entradas.filter((e) => yaImportada('diarium', e.idExterno)).length,
    libretas: [],
    etiquetas: new Set(entradas.flatMap((e) => e.etiquetas)).size,
    personas: new Set(entradas.flatMap((e) => e.personas)).size,
    fotos: cuenta.photo,
    videos: cuenta.video,
    audios: cuenta.audio,
    archivos: cuenta.file,
    bytes,
    faltantes: 0,
    sinUsar: sinEntrada.length,
    invalidas: datos.invalidas,
    desde: entradas[0]?.fecha ?? null,
    hasta: entradas[entradas.length - 1]?.fecha ?? null,
    omitidas: { papelera: 0, cifradas: 0, conflictos: 0 },
    conUbicacion: 0
  }
}

export function notaDiarium(i: number): NotaImportar {
  const s = exigirSesion('diarium')
  const e = s.diarium![i]
  if (!e) throw new ErrorDiario('Esa entrada no existe')
  return {
    idExterno: e.idExterno,
    titulo: e.titulo,
    fecha: e.fecha,
    hora: e.hora,
    html: e.html,
    etiquetas: e.etiquetas,
    personas: e.personas,
    recursos: (s.mediaDe!.get(e.idExterno) ?? []).map((n) => aImportar(s.recursos.get(n)!)),
    yaImportada: !!yaImportada('diarium', e.idExterno)
  }
}

/** Bytes de un recurso (fotos, y videos/audios para sacar miniatura y duración). */
export function leerRecurso(id: string): Uint8Array {
  const s = exigirSesion()
  const r = s.recursos.get(id)
  if (r?.zip) return leerZip(s.ruta, r.zip)
  if (!r?.pedazo) throw new ErrorDiario('Ese archivo no está en la exportación')
  return leerPedazo(r.pedazo, 600 * 1024 * 1024)
}

/** Guarda un recurso como adjunto: por partes desde el .jex, o descomprimido del .zip. */
export async function adjuntarRecurso(
  entradaId: string,
  id: string,
  extra: AdjuntoExtra
): Promise<Adjunto> {
  const s = exigirSesion()
  const r = s.recursos.get(id)
  if (r?.zip) return agregarDatos(entradaId, r.nombre, leerZip(s.ruta, r.zip), extra)
  if (!r?.pedazo) throw new ErrorDiario('Ese archivo no está en la exportación')
  return agregarDesdeRango(
    entradaId,
    r.pedazo.ruta,
    r.pedazo.desde,
    r.pedazo.tamano,
    r.nombre,
    extra
  )
}

export function marcarImportada(idExterno: string, entradaId: string): void {
  const origen = exigirSesion().origen
  diario.base
    .prepare(
      `INSERT INTO importados (origen, id_externo, entry_id, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(origen, id_externo) DO UPDATE SET entry_id = excluded.entry_id`
    )
    .run(origen, idExterno, entradaId, new Date().toISOString())
}

export function terminarImportacion(): void {
  sesion = null
}
