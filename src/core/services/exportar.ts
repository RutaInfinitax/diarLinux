/**
 * Exportar: el HTML de una entrada (TipTap o importado de Joplin) se pasa a una lista de bloques
 * simples (párrafos, títulos, listas, citas, código) con trozos de texto con formato. Con eso se
 * arman el Markdown, el texto plano y el Word. Sin Electron, para poder probarlo.
 */
import { parse, HTMLElement, Node, NodeType, TextNode } from 'node-html-parser'

export interface Trozo {
  t: string // '\n' = salto de línea dentro del bloque
  b?: boolean
  i?: boolean
  u?: boolean
  s?: boolean
  code?: boolean
  href?: string
}

export type Bloque =
  | { tipo: 'p' | 'h2' | 'h3' | 'cita'; trozos: Trozo[] }
  | { tipo: 'codigo'; texto: string }
  | { tipo: 'hr' }
  | {
      tipo: 'li'
      lista: 'ul' | 'ol' | 'tarea'
      nivel: number // 0 = primer nivel
      n: number // número (listas numeradas)
      hecho: boolean // tareas
      trozos: Trozo[]
    }

type Formato = Omit<Trozo, 't'>

const BLOQUES = new Set([
  'p',
  'div',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'pre',
  'ul',
  'ol',
  'li',
  'hr',
  'table',
  'tr',
  'section',
  'article',
  'header',
  'footer',
  'figure'
])
const NO_VA = new Set(['script', 'style', 'head', 'title', 'img', 'video', 'audio', 'iframe'])

const decodificar = (s: string): string =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')

const esElemento = (n: Node): n is HTMLElement => n.nodeType === NodeType.ELEMENT_NODE
const etiqueta = (n: HTMLElement): string => (n.rawTagName || '').toLowerCase()

/** Une trozos vecinos con el mismo formato y limpia espacios de los bordes. */
function compactar(trozos: Trozo[]): Trozo[] {
  const r: Trozo[] = []
  for (const x of trozos) {
    const t = x.t.replace(/[ \t\r\n]+/g, (m) => (m.includes('\n') && x.t === '\n' ? '\n' : ' '))
    if (!t) continue
    const ult = r[r.length - 1]
    const igual =
      ult &&
      ult.b === x.b &&
      ult.i === x.i &&
      ult.u === x.u &&
      ult.s === x.s &&
      ult.code === x.code &&
      ult.href === x.href
    if (igual && t !== '\n' && ult.t !== '\n') ult.t += t
    else r.push({ ...x, t })
  }
  // espacios al principio y al final del bloque
  while (r.length && !r[0].t.trim() && r[0].t !== ' ') r.shift()
  while (r.length && !r[r.length - 1].t.trim()) r.pop()
  if (r.length) {
    r[0].t = r[0].t.replace(/^ +/, '')
    r[r.length - 1].t = r[r.length - 1].t.replace(/ +$/, '')
  }
  return r
}

/** HTML de una entrada → bloques. */
export function aBloques(html: string): Bloque[] {
  const raiz = parse(html, { comment: false, blockTextElements: {} })
  const out: Bloque[] = []
  let actual: Trozo[] = []
  let tipoActual: 'p' | 'h2' | 'h3' | 'cita' = 'p'

  const cerrar = (): void => {
    const t = compactar(actual)
    if (t.length) out.push({ tipo: tipoActual, trozos: t })
    actual = []
  }

  const enLinea = (n: Node, f: Formato, dest: Trozo[]): void => {
    if (n.nodeType === NodeType.TEXT_NODE) {
      dest.push({ ...f, t: decodificar((n as TextNode).rawText) })
      return
    }
    if (!esElemento(n)) return
    const tag = etiqueta(n)
    if (NO_VA.has(tag)) return
    if (tag === 'br') return void dest.push({ ...f, t: '\n' })
    const g: Formato = { ...f }
    if (tag === 'strong' || tag === 'b') g.b = true
    if (tag === 'em' || tag === 'i') g.i = true
    if (tag === 'u') g.u = true
    if (tag === 's' || tag === 'del' || tag === 'strike') g.s = true
    if (tag === 'code') g.code = true
    if (tag === 'a') {
      const href = n.getAttribute('href') ?? ''
      if (/^(https?:|mailto:)/i.test(href)) g.href = href
    }
    for (const h of n.childNodes) enLinea(h, g, dest)
  }

  const lista = (n: HTMLElement, nivel: number): void => {
    const tipo: 'ul' | 'ol' | 'tarea' =
      n.getAttribute('data-type') === 'taskList' ? 'tarea' : etiqueta(n) === 'ol' ? 'ol' : 'ul'
    let num = Number(n.getAttribute('start')) || 1
    for (const li of n.childNodes) {
      if (!esElemento(li) || etiqueta(li) !== 'li') continue
      const hecho = li.getAttribute('data-checked') === 'true'
      const trozos: Trozo[] = []
      const sub: HTMLElement[] = []
      const juntar = (x: Node): void => {
        if (esElemento(x)) {
          const t = etiqueta(x)
          if (t === 'ul' || t === 'ol') return void sub.push(x)
          if (t === 'label' || t === 'input') return // la casilla de la tarea
          if (BLOQUES.has(t) && t !== 'li') {
            if (trozos.length) trozos.push({ t: '\n' })
            for (const h of x.childNodes) juntar(h)
            return
          }
        }
        enLinea(x, {}, trozos)
      }
      for (const h of li.childNodes) juntar(h)
      out.push({ tipo: 'li', lista: tipo, nivel, n: num++, hecho, trozos: compactar(trozos) })
      for (const s of sub) lista(s, nivel + 1)
    }
  }

  const bloque = (n: Node, cita: boolean): void => {
    if (!esElemento(n)) return void enLinea(n, {}, actual)
    const tag = etiqueta(n)
    if (NO_VA.has(tag)) return
    if (!tag || !BLOQUES.has(tag)) return void enLinea(n, {}, actual)
    cerrar()
    if (tag === 'hr') return void out.push({ tipo: 'hr' })
    if (tag === 'pre') {
      out.push({ tipo: 'codigo', texto: decodificar(n.textContent ?? n.text).replace(/\n$/, '') })
      return
    }
    if (tag === 'ul' || tag === 'ol') return lista(n, 0)
    if (tag === 'blockquote') {
      for (const h of n.childNodes) bloque(h, true)
      cerrar()
      return
    }
    if (tag === 'tr') {
      const celdas = n.childNodes.filter(esElemento).map((c) => c.text.trim())
      out.push({ tipo: cita ? 'cita' : 'p', trozos: [{ t: celdas.join(' | ') }] })
      return
    }
    tipoActual = cita
      ? 'cita'
      : tag === 'h1' || tag === 'h2'
        ? 'h2'
        : /^h[3-6]$/.test(tag)
          ? 'h3'
          : 'p'
    const tienenBloques = n.childNodes.some((h) => esElemento(h) && BLOQUES.has(etiqueta(h)))
    for (const h of n.childNodes) tienenBloques ? bloque(h, cita) : enLinea(h, {}, actual)
    cerrar()
    tipoActual = 'p'
  }

  for (const n of raiz.childNodes) bloque(n, false)
  cerrar()
  return out
}

// ── Markdown ──

const escMd = (s: string): string => s.replace(/([\\`*_[\]#<>|])/g, '\\$1')

function trozosMd(trozos: Trozo[]): string {
  return trozos
    .map((x) => {
      if (x.t === '\n') return '  \n'
      if (x.code) return '`' + x.t.replace(/`/g, 'ˋ') + '`'
      let t = escMd(x.t)
      const borde = t.match(/^(\s*)(.*?)(\s*)$/s)!
      let c = borde[2]
      if (!c) return t
      if (x.s) c = `~~${c}~~`
      if (x.i) c = `*${c}*`
      if (x.b) c = `**${c}**`
      if (x.u) c = `<u>${c}</u>`
      if (x.href) c = `[${c}](${x.href.replace(/[()\s]/g, encodeURIComponent)})`
      t = borde[1] + c + borde[3]
      return t
    })
    .join('')
}

export function bloquesAMarkdown(bloques: Bloque[]): string {
  const lineas: string[] = []
  let previo: Bloque['tipo'] | null = null
  let listaPrevia: string | null = null
  for (const b of bloques) {
    // entre dos listas distintas también va una línea en blanco (si no, se juntan)
    const otraLista =
      b.tipo === 'li' && b.nivel === 0 && listaPrevia !== null && listaPrevia !== b.lista
    if ((previo && !(previo === 'li' && b.tipo === 'li')) || otraLista) lineas.push('')
    previo = b.tipo
    listaPrevia = b.tipo === 'li' ? b.lista : null
    if (b.tipo === 'hr') lineas.push('---')
    else if (b.tipo === 'codigo') lineas.push('```', b.texto, '```')
    else if (b.tipo === 'li') {
      const sangria = '   '.repeat(b.nivel)
      const marca =
        b.lista === 'ol' ? `${b.n}.` : b.lista === 'tarea' ? `- [${b.hecho ? 'x' : ' '}]` : '-'
      lineas.push(
        sangria + marca + ' ' + trozosMd(b.trozos).replace(/ {2}\n/g, '  \n' + sangria + '   ')
      )
    } else {
      const t = trozosMd(b.trozos)
      if (b.tipo === 'h2') lineas.push('## ' + t)
      else if (b.tipo === 'h3') lineas.push('### ' + t)
      else if (b.tipo === 'cita') lineas.push(...t.split('\n').map((l) => '> ' + l))
      else lineas.push(t)
    }
  }
  return lineas.join('\n')
}

// ── texto plano ──

export function bloquesATexto(bloques: Bloque[]): string {
  const lineas: string[] = []
  let previo: Bloque['tipo'] | null = null
  const plano = (t: Trozo[]): string =>
    t.map((x) => (x.href && x.href !== x.t ? `${x.t} (${x.href})` : x.t)).join('')
  for (const b of bloques) {
    if (previo && !(previo === 'li' && b.tipo === 'li')) lineas.push('')
    previo = b.tipo
    if (b.tipo === 'hr') lineas.push('* * *')
    else if (b.tipo === 'codigo') lineas.push(...b.texto.split('\n').map((l) => '    ' + l))
    else if (b.tipo === 'li') {
      const marca =
        b.lista === 'ol' ? `${b.n}.` : b.lista === 'tarea' ? (b.hecho ? '[x]' : '[ ]') : '•'
      const sangria = '  '.repeat(b.nivel)
      lineas.push(sangria + marca + ' ' + plano(b.trozos).replace(/\n/g, '\n' + sangria + '  '))
    } else {
      const t = plano(b.trozos)
      if (b.tipo === 'cita') lineas.push(...t.split('\n').map((l) => '│ ' + l))
      else if (b.tipo === 'h2') lineas.push(t.toUpperCase())
      else lineas.push(t)
    }
  }
  return lineas.join('\n')
}

// ── nombres de archivo ──

/** Nombre seguro para un archivo (sin barras ni caracteres raros), sin cambiar acentos. */
export function nombreSeguro(n: string, max = 80): string {
  const limpio = n
    // eslint-disable-next-line no-control-regex -- quitar caracteres de control del nombre
    .replace(/[/\\:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
  if (!limpio) return 'archivo'
  if (limpio.length <= max) return limpio
  const ext = limpio.match(/(\.[A-Za-z0-9]{1,8})$/)?.[1] ?? ''
  return limpio.slice(0, max - ext.length) + ext
}

/** Devuelve un nombre que no esté en `usados` (agrega " (2)", " (3)"… antes de la extensión). */
export function nombreUnico(n: string, usados: Set<string>): string {
  let r = n
  const m = n.match(/^(.*?)(\.[^.]+)?$/)!
  for (let i = 2; usados.has(r.toLowerCase()); i++) r = `${m[1]} (${i})${m[2] ?? ''}`
  usados.add(r.toLowerCase())
  return r
}

export const estrellas = (n: number): string => '★'.repeat(n) + '☆'.repeat(5 - n)
