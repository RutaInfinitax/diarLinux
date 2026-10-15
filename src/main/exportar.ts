/**
 * Exportar (vista Exportar y "Exportar esta entrada"): Word, PDF, HTML, Markdown, texto y JSON.
 * Todo se arma acá en main. Lo exportado queda SIN cifrar (la ventana lo avisa antes).
 * Las fotos que van DENTRO del archivo (Word, PDF, HTML) se achican a 1600 px en JPEG con una
 * ventana oculta de Chromium (decodifica webp, avif, gif…; sharp no funciona dentro de Electron).
 * Con "adjuntos en archivos aparte" además se guardan los originales en la carpeta adjuntos/.
 */
import { app, BrowserWindow, dialog } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  TextRun,
  type ParagraphChild
} from 'docx'
import type { Adjunto, Entrada, OpcionesExportar, ResultadoExportar } from '../shared/tipos'
import { resumenClima } from '../core/services/clima'
import { faseDeFecha } from '../core/services/luna'
import {
  aBloques,
  bloquesAMarkdown,
  bloquesATexto,
  estrellas,
  nombreSeguro,
  nombreUnico,
  type Bloque,
  type Trozo
} from '../core/services/exportar'
import { carpetaTemporal, descifrarA, leerAdjunto, listarAdjuntos } from './adjuntos'
import { ajustesClima } from './clima'
import { nombreConExtension } from '../shared/archivos'
import { diario, ErrorDiario } from './diario'
import { escribirAtomico } from './fsutil'
import { idioma, locale, t } from '../shared/i18n'

const EXT = { docx: 'docx', pdf: 'pdf', html: 'html', md: 'md', txt: 'txt', json: 'json' }
const MAX_FOTO = 1600 // px del lado mayor de las fotos incrustadas

/** Una entrada lista para escribir en cualquier formato. */
interface Item {
  e: Entrada
  fechaLarga: string
  meta: string[] // líneas de datos (clima, luna, etiquetas…)
  bloques: Bloque[]
  adjuntos: { a: Adjunto; archivo: string | null; foto: FotoLista | null }[]
}
interface FotoLista {
  jpeg: Buffer
  ancho: number
  alto: number
}

// ── qué entradas ──

function entradasElegidas(o: OpcionesExportar): Entrada[] {
  const repo = diario.repo
  const ids = o.entradaId
    ? [o.entradaId]
    : repo
        .listar(o.desde, o.hasta)
        .reverse() // de la más vieja a la más nueva
        .map((r) => r.id)
  const lista: Entrada[] = []
  for (const id of ids) {
    const e = repo.obtener(id)
    if (!e) continue
    if (!o.entradaId && o.soloEtiquetas?.length) {
      if (!e.etiquetas.some((t) => o.soloEtiquetas!.includes(t.id))) continue
    }
    lista.push(e)
  }
  return lista
}

export function contarExportables(o: OpcionesExportar): number {
  return entradasElegidas(o).length
}

// ── textos ──

/** AAAA-MM-DD → DD/MM/AAAA (en inglés, MM/DD/YYYY) */
const dma = (f: string): string => {
  const [a, m, d] = f.split('-')
  return idioma() === 'en' ? `${m}/${d}/${a}` : `${d}/${m}/${a}`
}

function fechaLarga(e: Entrada): string {
  const [y, m, d] = e.fecha.split('-').map(Number)
  const f = new Date(y, m - 1, d).toLocaleDateString(locale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
  return f.charAt(0).toUpperCase() + f.slice(1) + (e.hora ? ` · ${e.hora}` : '')
}

function lineasMeta(e: Entrada, o: OpcionesExportar, unidad: 'C' | 'F'): string[] {
  const m: string[] = []
  const c = e.clima
  if (o.datos.clima && c) m.push(`${t('Clima')}: ${resumenClima(c, unidad)} (${c.ciudad})`)
  if (o.datos.sol && c?.amanecer && c.atardecer)
    m.push(`${t('Amanecer')}: ${c.amanecer} · ${t('Atardecer')}: ${c.atardecer}`)
  if (o.datos.luna) m.push(`${t('Fase lunar')}: ${t(faseDeFecha(e.fecha).nombre)}`)
  if (o.datos.calificacion && e.calificacion > 0)
    m.push(`${t('Calificación')}: ${estrellas(e.calificacion)}`)
  if (o.datos.etiquetas && e.etiquetas.length)
    m.push(`${t('Etiquetas')}: ${e.etiquetas.map((g) => g.nombre).join(', ')}`)
  if (o.datos.personas && e.personas.length)
    m.push(`${t('Personas')}: ${e.personas.map((g) => g.nombre).join(', ')}`)
  return m
}

const ICONO: Record<Adjunto['tipo'], string> = { photo: '🖼', video: '🎬', audio: '🎵', file: '📎' }
const TIPO: Record<Adjunto['tipo'], string> = {
  photo: 'Foto',
  video: 'Video',
  audio: 'Audio',
  file: 'Archivo'
}
function duracion(s: number | null): string {
  if (!s) return ''
  const seg = Math.round(s)
  return ` (${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')})`
}
const etiquetaAdjunto = (a: Adjunto): string =>
  `${ICONO[a.tipo]} ${t(TIPO[a.tipo])}: ${a.nombre}${duracion(a.duracion)}`

// ── fotos: achicar a JPEG con Chromium (ventana oculta, sin acceso a nada) ──

class Conversor {
  private v: BrowserWindow | null = null
  private async ventana(): Promise<BrowserWindow> {
    if (this.v && !this.v.isDestroyed()) return this.v
    this.v = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: true, contextIsolation: true, offscreen: true }
    })
    await this.v.loadURL('about:blank')
    return this.v
  }
  async jpeg(datos: Buffer): Promise<FotoLista | null> {
    const v = await this.ventana()
    const r = (await v.webContents.executeJavaScript(
      `(async () => {
        try {
          const b = Uint8Array.from(atob(${JSON.stringify(datos.toString('base64'))}), (c) => c.charCodeAt(0))
          const img = await createImageBitmap(new Blob([b]))
          const k = Math.min(1, ${MAX_FOTO} / Math.max(img.width, img.height))
          const w = Math.max(1, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k))
          const c = new OffscreenCanvas(w, h)
          const x = c.getContext('2d')
          x.fillStyle = '#fff'; x.fillRect(0, 0, w, h)
          x.drawImage(img, 0, 0, w, h)
          const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.85 })
          const u = new Uint8Array(await blob.arrayBuffer())
          let s = ''
          for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode(...u.subarray(i, i + 32768))
          return { b64: btoa(s), w, h }
        } catch (e) { return null }
      })()`
    )) as { b64: string; w: number; h: number } | null
    return r ? { jpeg: Buffer.from(r.b64, 'base64'), ancho: r.w, alto: r.h } : null
  }
  cerrar(): void {
    if (this.v && !this.v.isDestroyed()) this.v.destroy()
    this.v = null
  }
}

// ── HTML (también la base del PDF) ──

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function trozosHtml(t: Trozo[]): string {
  return t
    .map((x) => {
      if (x.t === '\n') return '<br>'
      let h = esc(x.t)
      if (x.code) h = `<code>${h}</code>`
      if (x.s) h = `<s>${h}</s>`
      if (x.u) h = `<u>${h}</u>`
      if (x.i) h = `<em>${h}</em>`
      if (x.b) h = `<strong>${h}</strong>`
      if (x.href) h = `<a href="${esc(x.href)}">${h}</a>`
      return h
    })
    .join('')
}

/** El HTML se arma de nuevo desde los bloques: así no pasa nada raro (scripts, estilos…). */
function bloquesHtml(bloques: Bloque[]): string {
  const out: string[] = []
  const abiertas: { tag: string; nivel: number }[] = []
  const cerrarHasta = (nivel: number): void => {
    while (abiertas.length && abiertas[abiertas.length - 1].nivel >= nivel)
      out.push(`</${abiertas.pop()!.tag}>`)
  }
  for (const b of bloques) {
    if (b.tipo !== 'li') cerrarHasta(0)
    if (b.tipo === 'li') {
      const tag = b.lista === 'ol' ? 'ol' : 'ul'
      const arriba = abiertas[abiertas.length - 1]
      if (arriba && arriba.nivel > b.nivel) cerrarHasta(b.nivel + 1)
      const mismo = abiertas[abiertas.length - 1]
      if (mismo && mismo.nivel === b.nivel && mismo.tag !== tag) cerrarHasta(b.nivel)
      if (!abiertas.length || abiertas[abiertas.length - 1].nivel < b.nivel) {
        out.push(`<${tag}${b.lista === 'tarea' ? ' class="tareas"' : ''}>`)
        abiertas.push({ tag, nivel: b.nivel })
      }
      const caja = b.lista === 'tarea' ? (b.hecho ? '☑ ' : '☐ ') : ''
      out.push(`<li>${caja}${trozosHtml(b.trozos)}</li>`)
    } else if (b.tipo === 'hr') out.push('<hr>')
    else if (b.tipo === 'codigo') out.push(`<pre>${esc(b.texto)}</pre>`)
    else if (b.tipo === 'cita') out.push(`<blockquote>${trozosHtml(b.trozos)}</blockquote>`)
    else out.push(`<${b.tipo}>${trozosHtml(b.trozos)}</${b.tipo}>`)
  }
  cerrarHasta(0)
  return out.join('\n')
}

const CSS = `
body { font-family: 'Noto Sans', 'Segoe UI', sans-serif; max-width: 780px; margin: 32px auto; padding: 0 20px; color: #222; line-height: 1.5; }
h1.diario { font-size: 26px; border-bottom: 2px solid #3d8ef0; padding-bottom: 6px; }
article { margin: 0 0 40px; page-break-inside: auto; }
.fecha { color: #3d8ef0; font-weight: 600; font-size: 14px; text-transform: none; margin: 0; }
article > h1 { font-size: 22px; margin: 2px 0 8px; }
.meta { color: #666; font-size: 13px; margin: 0 0 10px; }
.meta div { margin: 1px 0; }
blockquote { border-left: 3px solid #ccc; margin: 8px 0; padding: 2px 12px; color: #555; }
pre { background: #f4f4f6; padding: 8px 10px; border-radius: 6px; white-space: pre-wrap; }
code { background: #f4f4f6; padding: 0 3px; border-radius: 3px; }
ul.tareas { list-style: none; padding-left: 8px; }
.fotos { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0; }
.fotos img { max-width: 100%; max-height: 520px; border-radius: 6px; }
.adjuntos { font-size: 13px; color: #444; margin: 6px 0; }
hr.entre { border: 0; border-top: 1px solid #ddd; margin: 30px 0; }
`

function htmlDocumento(titulo: string, items: Item[], incrustar: boolean): string {
  const cuerpo = items
    .map((it) => {
      const fotos = it.adjuntos.filter((x) => x.a.tipo === 'photo')
      const otros = it.adjuntos.filter((x) => x.a.tipo !== 'photo' || (!x.foto && !x.archivo))
      const img = fotos
        .map((x) => {
          if (incrustar && x.foto)
            return `<img src="data:image/jpeg;base64,${x.foto.jpeg.toString('base64')}" alt="${esc(x.a.nombre)}">`
          if (!incrustar && x.archivo)
            return `<img src="${esc(encodeURI(x.archivo))}" alt="${esc(x.a.nombre)}">`
          return ''
        })
        .join('')
      const lista = otros
        .map((x) =>
          x.archivo
            ? `<div><a href="${esc(encodeURI(x.archivo))}">${esc(etiquetaAdjunto(x.a))}</a></div>`
            : `<div>${esc(etiquetaAdjunto(x.a))}</div>`
        )
        .join('')
      return `<article>
<p class="fecha">${esc(it.fechaLarga)}</p>
${it.e.titulo ? `<h1>${esc(it.e.titulo)}</h1>` : ''}
${it.meta.length ? `<div class="meta">${it.meta.map((m) => `<div>${esc(m)}</div>`).join('')}</div>` : ''}
${bloquesHtml(it.bloques)}
${img ? `<div class="fotos">${img}</div>` : ''}
${lista ? `<div class="adjuntos">${lista}</div>` : ''}
</article>`
    })
    .join('\n<hr class="entre">\n')
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title><style>${CSS}</style></head>
<body><h1 class="diario">${esc(titulo)}</h1>
${cuerpo}
</body></html>`
}

async function aPdf(html: string): Promise<Buffer> {
  // El HTML va a un archivo temporal en RAM (no a un data: URL, que tiene límite de tamaño)
  const dir = path.join(carpetaTemporal(), 'exportar')
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  const tmp = path.join(dir, `pdf-${process.pid}-${Date.now()}.html`)
  fs.writeFileSync(tmp, html, { mode: 0o600 })
  const v = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, javascript: false, offscreen: true }
  })
  try {
    await v.loadFile(tmp)
    return await v.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 }
    })
  } finally {
    v.destroy()
    fs.rmSync(tmp, { force: true })
  }
}

// ── Markdown y texto ──

function markdown(titulo: string, items: Item[]): string {
  const partes = [`# ${titulo}`]
  for (const it of items) {
    const p: string[] = [`## ${it.fechaLarga}${it.e.titulo ? ` — ${it.e.titulo}` : ''}`]
    if (it.meta.length) p.push(it.meta.map((m) => `*${m}*`).join('  \n'))
    const cuerpo = bloquesAMarkdown(it.bloques)
    if (cuerpo) p.push(cuerpo)
    const adj = it.adjuntos.map((x) => {
      if (!x.archivo) return `- ${etiquetaAdjunto(x.a)}`
      const url = encodeURI(x.archivo).replace(/[()]/g, encodeURIComponent)
      return x.a.tipo === 'photo'
        ? `![${x.a.nombre}](${url})`
        : `- [${etiquetaAdjunto(x.a)}](${url})`
    })
    if (adj.length) p.push(adj.join('\n'))
    partes.push(p.join('\n\n'))
  }
  return partes.join('\n\n---\n\n') + '\n'
}

function texto(titulo: string, items: Item[]): string {
  const raya = '='.repeat(60)
  const partes = [titulo, raya]
  for (const it of items) {
    const p: string[] = [it.fechaLarga + (it.e.titulo ? `\n${it.e.titulo}` : '')]
    if (it.meta.length) p.push(it.meta.join('\n'))
    const cuerpo = bloquesATexto(it.bloques)
    if (cuerpo) p.push(cuerpo)
    const adj = it.adjuntos.map((x) => etiquetaAdjunto(x.a) + (x.archivo ? ` → ${x.archivo}` : ''))
    if (adj.length) p.push(adj.join('\n'))
    partes.push(p.join('\n\n'), '-'.repeat(60))
  }
  return partes.join('\n\n') + '\n'
}

function json(items: Item[]): string {
  return JSON.stringify(
    {
      app: 'diarLinux',
      exportado: new Date().toISOString(),
      entradas: items.map((it) => ({
        fecha: it.e.fecha,
        hora: it.e.hora,
        titulo: it.e.titulo,
        html: it.e.html,
        texto: it.e.texto,
        calificacion: it.e.calificacion,
        clima: it.e.clima,
        etiquetas: it.e.etiquetas.map((t) => t.nombre),
        personas: it.e.personas.map((t) => t.nombre),
        creada: it.e.creada,
        modificada: it.e.modificada,
        datos: it.meta,
        adjuntos: it.adjuntos.map((x) => ({
          tipo: x.a.tipo,
          nombre: x.a.nombre,
          mime: x.a.mime,
          tamano: x.a.tamano,
          ancho: x.a.ancho,
          alto: x.a.alto,
          duracion: x.a.duracion,
          archivo: x.archivo
        }))
      }))
    },
    null,
    2
  )
}

// ── Word ──

function trozosDocx(t: Trozo[]): ParagraphChild[] {
  return t.map((x) => {
    const run = new TextRun({
      text: x.t === '\n' ? '' : x.t,
      break: x.t === '\n' ? 1 : undefined,
      bold: x.b,
      italics: x.i,
      underline: x.u || x.href ? {} : undefined,
      strike: x.s,
      font: x.code ? 'Courier New' : undefined,
      color: x.href ? '1F5FBF' : undefined
    })
    return x.href ? new ExternalHyperlink({ link: x.href, children: [run] }) : run
  })
}

async function word(titulo: string, items: Item[]): Promise<Buffer> {
  const hijos: Paragraph[] = [new Paragraph({ text: titulo, heading: HeadingLevel.TITLE })]
  let instancia = 0
  for (const [n, it] of items.entries()) {
    if (n > 0) hijos.push(new Paragraph({ text: '' }))
    hijos.push(
      new Paragraph({
        children: [new TextRun({ text: it.fechaLarga, bold: true, color: '2F6FDB' })]
      })
    )
    if (it.e.titulo)
      hijos.push(new Paragraph({ text: it.e.titulo, heading: HeadingLevel.HEADING_1 }))
    for (const m of it.meta)
      hijos.push(
        new Paragraph({
          children: [new TextRun({ text: m, italics: true, color: '666666', size: 20 })]
        })
      )
    let listaPrevia: string | null = null
    for (const b of it.bloques) {
      if (b.tipo === 'li') {
        if (b.nivel === 0 && listaPrevia !== b.lista) instancia++
        listaPrevia = b.lista
      } else listaPrevia = null
      if (b.tipo === 'hr')
        hijos.push(
          new Paragraph({
            text: '',
            border: { bottom: { style: 'single', size: 6, color: 'CCCCCC', space: 1 } }
          })
        )
      else if (b.tipo === 'codigo')
        hijos.push(
          new Paragraph({
            children: b.texto
              .split('\n')
              .map(
                (l, i) =>
                  new TextRun({ text: l, font: 'Courier New', size: 20, break: i ? 1 : undefined })
              )
          })
        )
      else if (b.tipo === 'li') {
        const nivel = Math.min(b.nivel, 8)
        const caja = b.lista === 'tarea' ? [new TextRun(b.hecho ? '☑ ' : '☐ ')] : []
        hijos.push(
          new Paragraph({
            children: [...caja, ...trozosDocx(b.trozos)],
            ...(b.lista === 'ol'
              ? { numbering: { reference: 'numerada', level: nivel, instance: instancia } }
              : b.lista === 'ul'
                ? { bullet: { level: nivel } }
                : { indent: { left: 360 * (nivel + 1) } })
          })
        )
      } else
        hijos.push(
          new Paragraph({
            children: trozosDocx(b.trozos),
            heading:
              b.tipo === 'h2'
                ? HeadingLevel.HEADING_2
                : b.tipo === 'h3'
                  ? HeadingLevel.HEADING_3
                  : undefined,
            ...(b.tipo === 'cita'
              ? {
                  indent: { left: 567 },
                  border: { left: { style: 'single', size: 12, color: 'CCCCCC', space: 8 } }
                }
              : {})
          })
        )
    }
    for (const x of it.adjuntos) {
      if (x.a.tipo === 'photo' && x.foto) {
        // ancho máximo ~16 cm (600 px a 96 ppp)
        const k = Math.min(1, 600 / x.foto.ancho)
        hijos.push(
          new Paragraph({
            children: [
              new ImageRun({
                type: 'jpg',
                data: x.foto.jpeg,
                transformation: {
                  width: Math.round(x.foto.ancho * k),
                  height: Math.round(x.foto.alto * k)
                },
                altText: { name: x.a.nombre, description: x.a.nombre, title: x.a.nombre }
              })
            ]
          })
        )
      } else {
        const t = new TextRun({
          text: etiquetaAdjunto(x.a),
          size: 20,
          color: x.archivo ? '1F5FBF' : '444444',
          underline: x.archivo ? {} : undefined
        })
        hijos.push(
          new Paragraph({
            children: [
              x.archivo ? new ExternalHyperlink({ link: encodeURI(x.archivo), children: [t] }) : t
            ]
          })
        )
      }
    }
  }
  const niveles = Array.from({ length: 9 }, (_, level) => ({
    level,
    format: LevelFormat.DECIMAL,
    text: `%${level + 1}.`,
    alignment: AlignmentType.START,
    style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } }
  }))
  const doc = new Document({
    creator: 'diarLinux',
    title: titulo,
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    numbering: { config: [{ reference: 'numerada', levels: niveles }] },
    sections: [{ children: hijos }]
  })
  return Packer.toBuffer(doc)
}

// ── dónde guardar ──

async function elegirDestino(
  o: OpcionesExportar,
  enCarpeta: boolean,
  nombre: string,
  v: BrowserWindow | null
): Promise<string | null> {
  // pruebas: sin diálogo
  if (process.env.DIARLINUX_OCULTA === '1' && process.env.DIARLINUX_EXPORTAR_EN)
    return process.env.DIARLINUX_EXPORTAR_EN
  const inicio = app.getPath('documents')
  if (enCarpeta) {
    const r = await dialog.showOpenDialog(v!, {
      title: t('Carpeta donde crear la exportación'),
      defaultPath: inicio,
      properties: ['openDirectory', 'createDirectory']
    })
    return r.canceled ? null : r.filePaths[0]
  }
  const r = await dialog.showSaveDialog(v!, {
    title: t('Exportar (el archivo queda SIN cifrar)'),
    defaultPath: path.join(inicio, `${nombre}.${EXT[o.formato]}`),
    filters: [{ name: o.formato.toUpperCase(), extensions: [EXT[o.formato]] }]
  })
  return r.canceled || !r.filePath ? null : r.filePath
}

const ahoraNombre = (): string => {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}-${p(d.getMinutes())}`
}

// ── exportar ──

export async function exportar(
  o: OpcionesExportar,
  v: BrowserWindow | null,
  avance: (hechas: number, total: number) => void
): Promise<ResultadoExportar | null> {
  const entradas = entradasElegidas(o)
  if (!entradas.length) throw new ErrorDiario('No hay entradas para exportar con esas opciones')

  // Título con las fechas reales (primera y última entrada); el nombre del archivo, en AAAA-MM-DD
  const primera = entradas[0].fecha
  const ultima = entradas[entradas.length - 1].fecha
  const titulo =
    primera === ultima
      ? `diarLinux ${dma(primera)}`
      : `diarLinux ${t('{desde} a {hasta}', { desde: dma(primera), hasta: dma(ultima) })}`
  const nombre =
    primera === ultima
      ? `diarLinux ${primera}`
      : `diarLinux ${t('{desde} a {hasta}', { desde: primera, hasta: ultima })}`
  const enCarpeta = o.porFecha || (o.adjuntosAparte && o.datos.adjuntos)
  const elegido = await elegirDestino(o, enCarpeta, nombreSeguro(nombre), v)
  if (!elegido) return null

  // En carpeta: se crea una subcarpeta nueva (nunca se mezcla con lo que ya había)
  let carpeta = path.dirname(elegido)
  const archivoUnico = elegido
  if (enCarpeta) {
    const usados = new Set(
      fs.existsSync(elegido) ? fs.readdirSync(elegido).map((n) => n.toLowerCase()) : []
    )
    carpeta = path.join(
      elegido,
      nombreUnico(
        nombreSeguro(`${nombre} (${t('exportado {cuando}', { cuando: ahoraNombre() })})`),
        usados
      )
    )
    fs.mkdirSync(carpeta, { recursive: true })
  }

  const unidad = ajustesClima().unidad
  const conversor = new Conversor()
  const avisos: string[] = []
  const usadosAdj = new Set<string>()
  let adjuntosEscritos = 0
  const incrustar =
    o.formato === 'docx' || o.formato === 'pdf' || (o.formato === 'html' && !o.adjuntosAparte)

  const items: Item[] = []
  try {
    for (const [n, e] of entradas.entries()) {
      const adjuntos: Item['adjuntos'] = []
      if (o.datos.adjuntos) {
        for (const a of listarAdjuntos(e.id)) {
          let archivo: string | null = null
          if (enCarpeta && o.adjuntosAparte) {
            // fotos guardadas antes con la extensión vieja (foto.png que en verdad es JPEG)
            const real = nombreConExtension(a.nombre, a.mime)
            const nombre = nombreUnico(nombreSeguro(`${e.fecha} ${real}`), usadosAdj)
            fs.mkdirSync(path.join(carpeta, 'adjuntos'), { recursive: true })
            await descifrarA(a.id, path.join(carpeta, 'adjuntos', nombre))
            archivo = `adjuntos/${nombre}`
            adjuntosEscritos++
          }
          let foto: FotoLista | null = null
          if (a.tipo === 'photo' && incrustar) {
            foto = await conversor.jpeg(await leerAdjunto(a.id))
            if (!foto)
              avisos.push(
                t('No se pudo incluir la foto «{nombre}» del {fecha} (formato no compatible)', {
                  nombre: a.nombre,
                  fecha: dma(e.fecha)
                })
              )
          }
          adjuntos.push({ a, archivo, foto })
        }
      }
      items.push({
        e,
        fechaLarga: fechaLarga(e),
        meta: lineasMeta(e, o, unidad),
        bloques: aBloques(e.html),
        adjuntos
      })
      avance(n + 1, entradas.length)
    }
  } finally {
    conversor.cerrar()
  }

  // Grupos: todo junto, o uno por fecha
  const grupos = new Map<string, Item[]>()
  for (const it of items) {
    const k = o.porFecha ? it.e.fecha : ''
    grupos.set(k, [...(grupos.get(k) ?? []), it])
  }

  let archivos = 0
  for (const [fecha, grupo] of grupos) {
    const tit = fecha ? `diarLinux ${dma(fecha)}` : titulo
    let datos: Buffer | string
    if (o.formato === 'html') datos = htmlDocumento(tit, grupo, incrustar)
    else if (o.formato === 'pdf') datos = await aPdf(htmlDocumento(tit, grupo, true))
    else if (o.formato === 'md') datos = markdown(tit, grupo)
    else if (o.formato === 'txt') datos = texto(tit, grupo)
    else if (o.formato === 'json') datos = json(grupo)
    else datos = await word(tit, grupo)
    const destino = enCarpeta
      ? path.join(carpeta, `${fecha || t('diario')}.${EXT[o.formato]}`)
      : archivoUnico
    escribirAtomico(destino, datos)
    archivos++
  }
  return {
    ruta: enCarpeta ? carpeta : archivoUnico,
    entradas: items.length,
    archivos,
    adjuntos: adjuntosEscritos,
    avisos
  }
}
