/**
 * Lectura del formato de exportación de Joplin (JEX = .tar del formato RAW). Cada elemento es un .md:
 *   título \n\n cuerpo \n\n propiedades "clave: valor" (la última es type_)
 * type_: 1 nota, 2 libreta, 4 recurso (archivo en resources/<id>.<ext>), 5 etiqueta, 6 nota↔etiqueta.
 * En el cuerpo, los archivos se enlazan como ![](:/<id>) o [nombre](:/<id>). Funciones puras (con tests).
 */
import { Marked, type Tokens } from 'marked'

export const TIPO_JOPLIN = {
  nota: 1,
  libreta: 2,
  recurso: 4,
  etiqueta: 5,
  notaEtiqueta: 6
} as const

export interface ItemJoplin {
  tipo: number
  props: Record<string, string>
  titulo: string
  cuerpo: string
}

const PROP = /^([a-zA-Z0-9_]+):(.*)$/

/** Como BaseItem.unserialize de Joplin: las propiedades se leen de abajo hacia arriba. */
export function leerItem(texto: string): ItemJoplin {
  const lineas = texto.replace(/\r\n?/g, '\n').split('\n')
  const props: Record<string, string> = {}
  let i = lineas.length - 1
  while (i >= 0 && lineas[i].trim() === '') i-- // líneas vacías al final del archivo
  for (; i >= 0; i--) {
    const l = lineas[i].trim()
    if (l === '') break
    const m = PROP.exec(l)
    if (!m) break
    props[m[1]] = m[2].trim().replace(/\\n/g, '\n').replace(/\\r/g, '\r')
  }
  const resto = i >= 0 ? lineas.slice(0, i) : []
  return {
    tipo: Number(props.type_) || 0,
    props,
    titulo: (resto[0] ?? '').trim(),
    cuerpo: resto.slice(2).join('\n').replace(/\s+$/, '')
  }
}

/** Fecha y hora LOCALES (AAAA-MM-DD, HH:MM) de una fecha ISO de Joplin; null si no es válida. */
export function fechaHoraLocal(iso: string | undefined): { fecha: string; hora: string } | null {
  if (!iso) return null
  const d = /^\d{10,}$/.test(iso)
    ? new Date(Number(iso))
    : /^\d{4}-\d{2}-\d{2}T/.test(iso)
      ? new Date(iso)
      : null
  if (!d) return null
  if (Number.isNaN(d.getTime()) || d.getTime() <= 0) return null
  const p = (n: number): string => String(n).padStart(2, '0')
  return {
    fecha: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    hora: `${p(d.getHours())}:${p(d.getMinutes())}`
  }
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const REF = /^:\/([0-9a-fA-F]{32})(?:[#?].*)?$/

export interface Conversion {
  html: string
  /** ids de recursos enlazados, en orden de aparición y sin repetir */
  recursos: string[]
}

/**
 * Quita del HTML las imágenes y enlaces a recursos de Joplin (pasan a ser adjuntos): la imagen
 * desaparece del texto y el enlace deja solo su texto (no se pierde la frase).
 */
function sacarRecursosHtml(html: string, agregar: (id: string) => void): string {
  return html
    .replace(/<img\b[^>]*\bsrc\s*=\s*["']:\/([0-9a-fA-F]{32})["'][^>]*>/gi, (_m, id: string) => {
      agregar(id.toLowerCase())
      return ''
    })
    .replace(
      /<a\b[^>]*\bhref\s*=\s*["']:\/([0-9a-fA-F]{32})["'][^>]*>([\s\S]*?)<\/a>/gi,
      (_m, id: string, texto: string) => {
        agregar(id.toLowerCase())
        return texto
      }
    )
    .replace(/<a\b[^>]*\bhref\s*=\s*["']:\/([0-9a-fA-F]{32})["'][^>]*>/gi, (_m, id: string) => {
      // dentro de markdown, marked separa <a …>, el texto y </a>: queda solo el texto
      agregar(id.toLowerCase())
      return ''
    })
}

/**
 * Markdown de Joplin → HTML que entiende el editor (TipTap con títulos h2/h3, listas de tareas,
 * citas, código). Las tablas pasan a líneas de texto (el editor no tiene tablas: así no se pierden).
 * `esRecurso(id)` dice si un :/id es un archivo (si no, es un enlace a otra nota: queda el texto).
 */
export function markdownAHtml(md: string, esRecurso: (id: string) => boolean): Conversion {
  const recursos: string[] = []
  const agregar = (id: string): void => {
    if (esRecurso(id) && !recursos.includes(id)) recursos.push(id)
  }
  const m = new Marked({ gfm: true, breaks: false })
  m.use({
    renderer: {
      heading({ tokens, depth }) {
        const n = depth <= 2 ? 2 : 3
        return `<h${n}>${this.parser.parseInline(tokens)}</h${n}>\n`
      },
      image({ href, text }) {
        const id = REF.exec(href ?? '')?.[1]
        if (id) {
          agregar(id.toLowerCase())
          return ''
        }
        // imagen de internet: queda como enlace (no se descarga nada)
        return href ? `<a href="${esc(href)}">${esc(text || href)}</a>` : esc(text)
      },
      link({ href, tokens }) {
        const id = REF.exec(href ?? '')?.[1]
        if (!id) return false
        agregar(id.toLowerCase())
        return this.parser.parseInline(tokens)
      },
      table(t: Tokens.Table) {
        const fila = (celdas: Tokens.TableCell[]): string =>
          celdas.map((c) => this.parser.parseInline(c.tokens)).join(' · ')
        return (
          `<p><strong>${fila(t.header)}</strong></p>\n` +
          t.rows.map((r) => `<p>${fila(r)}</p>\n`).join('')
        )
      },
      list(t: Tokens.List) {
        if (!t.items.length || !t.items.every((i) => i.task)) return false
        return (
          '<ul data-type="taskList">' +
          t.items
            .map((i) => {
              const dentro = this.parser.parse(i.tokens, !!i.loose)
              const contenido = i.loose ? dentro : `<p>${dentro}</p>`
              return `<li data-type="taskItem" data-checked="${i.checked ? 'true' : 'false'}">${contenido}</li>`
            })
            .join('') +
          '</ul>\n'
        )
      },
      // casillas sueltas en listas mezcladas: el editor no tiene <input>, se guarda el estado como texto
      checkbox({ checked }) {
        return checked ? '☑' : '☐' // marked ya agrega el espacio
      },
      html({ text }) {
        return sacarRecursosHtml(text, agregar)
      }
    }
  })
  const html = (m.parse(md, { async: false }) as string).replace(/<p>\s*<\/p>\n?/g, '') // imagen sola
  // Archivos nombrados donde Markdown no los toma como enlace (p. ej. dentro de un bloque de código
  // mal cerrado): el texto queda tal cual, pero el archivo se adjunta igual para no perderlo.
  for (const r of md.matchAll(/\]\(:\/([0-9a-fA-F]{32})\)/g)) agregar(r[1].toLowerCase())
  return { html, recursos }
}

/** Nota en HTML (markup_language 2): solo se separan los recursos. */
export function htmlDeJoplin(html: string, esRecurso: (id: string) => boolean): Conversion {
  const recursos: string[] = []
  const limpio = sacarRecursosHtml(html, (id) => {
    if (esRecurso(id) && !recursos.includes(id)) recursos.push(id)
  })
  return { html: limpio.replace(/<p>\s*<\/p>/g, ''), recursos }
}

/** Nombre de archivo de un recurso: su título si tiene extensión; si no, título/id + extensión. */
export function nombreRecurso(r: ItemJoplin): string {
  const ext = (r.props.file_extension || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)
  const base = (r.titulo || r.props.filename || r.props.id || 'archivo').replace(/[/\\\0]/g, '_')
  if (!ext || base.toLowerCase().endsWith('.' + ext.toLowerCase())) return base.slice(0, 200)
  return `${base.slice(0, 190)}.${ext}`
}
