/**
 * Entradas y etiquetas sobre la base cifrada. Todo sincrónico (better-sqlite3).
 * Las entradas borradas se eliminan de verdad (sin sincronización no hacen falta "lápidas",
 * y así no queda texto borrado guardado).
 */
import { randomUUID } from 'node:crypto'
import type {
  DiaCalendario,
  Entrada,
  Clima,
  Etiqueta,
  Estadisticas,
  FiltrosBusqueda,
  GuardarEntrada,
  Plantilla,
  ResumenEntrada,
  TipoGrupo
} from '../../shared/tipos'
import type { DB } from './db'
import { contarPalabras } from '../../core/services/texto'

const GRUPOS = {
  etiqueta: { tabla: 'tags', union: 'entry_tags', col: 'tag_id' },
  persona: { tabla: 'people', union: 'entry_people', col: 'person_id' }
} as const

const ahora = (): string => new Date().toISOString()
const FECHA = /^\d{4}-\d{2}-\d{2}$/
const HORA = /^\d{2}:\d{2}$/

const ENTIDADES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  '#39': "'",
  nbsp: ' '
}

/** Texto plano del HTML del editor (para búsqueda, extractos y estadísticas). */
export function htmlATexto(html: string): string {
  return html
    .replace(/<(br|\/p|\/h\d|\/li|\/blockquote|\/div)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(
      /&(#?\w+);/g,
      (m, e: string) =>
        ENTIDADES[e] ??
        (e.startsWith('#') ? String.fromCodePoint(parseInt(e.slice(1).replace(/^x/, '0x'))) : m)
    )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
}

function leerJson<T>(s: string | null): T | null {
  if (!s) return null
  try {
    return JSON.parse(s) as T
  } catch {
    return null
  }
}

/**
 * Texto del buscador → consulta FTS5 segura: cada palabra entre comillas (sin operadores ni
 * sintaxis del usuario) y como prefijo ("cami" encuentra "camino"). Todas las palabras deben estar.
 */
export function consultaFts(texto: string): string | null {
  const palabras = texto
    .normalize('NFC')
    .split(/\s+/)
    .filter((p) => /[\p{L}\p{N}]/u.test(p))
    .slice(0, 16)
  if (!palabras.length) return null
  return palabras.map((p) => `"${p.replace(/"/g, '""')}"*`).join(' ')
}

/** Racha actual (hasta hoy o ayer) y racha más larga de días seguidos con entrada. */
export function rachas(
  dias: string[],
  hoy = new Date()
): { rachaActual: number; rachaMaxima: number } {
  const n = (f: string): number => Math.round(Date.parse(f + 'T00:00:00Z') / 86_400_000)
  let max = 0
  let corrida = 0
  let anterior = NaN
  for (const d of dias) {
    const x = n(d)
    corrida = x === anterior + 1 ? corrida + 1 : 1
    max = Math.max(max, corrida)
    anterior = x
  }
  const p = (v: number): string => String(v).padStart(2, '0')
  const hoyN = n(`${hoy.getFullYear()}-${p(hoy.getMonth() + 1)}-${p(hoy.getDate())}`)
  const actual = dias.length && hoyN - anterior <= 1 ? corrida : 0
  return { rachaActual: actual, rachaMaxima: max }
}

const bisiesto = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0

function extracto(texto: string): string {
  const t = texto.replace(/\s+/g, ' ').trim()
  return t.length > 320 ? t.slice(0, 320) + '…' : t
}

interface FilaEntrada {
  id: string
  date: string
  time: string | null
  title: string
  body_html: string
  body_text: string
  rating: number
  weather_json: string | null
  created_at: string
  updated_at: string
}

export class Repo {
  constructor(private db: DB) {}

  // ── etiquetas y personas (mismo modelo: tabla propia + tabla de unión con las entradas) ──
  private grupoDe(tipo: TipoGrupo, ids: string[]): Map<string, Etiqueta[]> {
    const g = GRUPOS[tipo]
    const mapa = new Map<string, Etiqueta[]>()
    if (!ids.length) return mapa
    const filas = this.db
      .prepare(
        `SELECT u.entry_id, t.id, t.name, t.color FROM ${g.union} u JOIN ${g.tabla} t ON t.id = u.${g.col}
         WHERE t.deleted_at IS NULL AND u.entry_id IN (SELECT value FROM json_each(?))
         ORDER BY t.name COLLATE NOCASE`
      )
      .all(JSON.stringify(ids)) as {
      entry_id: string
      id: string
      name: string
      color: string | null
    }[]
    for (const f of filas) {
      const l = mapa.get(f.entry_id) ?? []
      l.push({ id: f.id, nombre: f.name, color: f.color })
      mapa.set(f.entry_id, l)
    }
    return mapa
  }

  listarGrupo(tipo: TipoGrupo): Etiqueta[] {
    const g = GRUPOS[tipo]
    return (
      this.db
        .prepare(
          `SELECT t.id, t.name, t.color, count(e.id) AS n FROM ${g.tabla} t
           LEFT JOIN ${g.union} u ON u.${g.col} = t.id
           LEFT JOIN entries e ON e.id = u.entry_id AND e.deleted_at IS NULL
           WHERE t.deleted_at IS NULL GROUP BY t.id ORDER BY t.name COLLATE NOCASE`
        )
        .all() as { id: string; name: string; color: string | null; n: number }[]
    )
      .map((f) => ({ id: f.id, nombre: f.name, color: f.color, cantidad: f.n }))
      .sort((x, y) => x.nombre.localeCompare(y.nombre, 'es', { sensitivity: 'base' }))
  }

  crearEnGrupo(tipo: TipoGrupo, nombre: string): Etiqueta {
    const g = GRUPOS[tipo]
    const limpio = nombre.replace(/\s+/g, ' ').trim().slice(0, 60)
    if (!limpio)
      throw new Error(
        tipo === 'etiqueta' ? 'La etiqueta necesita un nombre' : 'La persona necesita un nombre'
      )
    const existe = this.db
      .prepare(
        `SELECT id, name, color FROM ${g.tabla} WHERE minus(name) = minus(?) AND deleted_at IS NULL`
      )
      .get(limpio) as { id: string; name: string; color: string | null } | undefined
    if (existe) return { id: existe.id, nombre: existe.name, color: existe.color }
    const t = ahora()
    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO ${g.tabla} (id, name, color, created_at, updated_at) VALUES (?, ?, NULL, ?, ?)`
      )
      .run(id, limpio, t, t)
    return { id, nombre: limpio, color: null }
  }

  asignarEnGrupo(tipo: TipoGrupo, entradaId: string, ids: string[]): Etiqueta[] {
    const g = GRUPOS[tipo]
    this.db.transaction(() => {
      this.db.prepare(`DELETE FROM ${g.union} WHERE entry_id = ?`).run(entradaId)
      const ins = this.db.prepare(
        `INSERT OR IGNORE INTO ${g.union} (entry_id, ${g.col}) VALUES (?, ?)`
      )
      for (const t of new Set(ids)) ins.run(entradaId, t)
      this.db.prepare('UPDATE entries SET updated_at = ? WHERE id = ?').run(ahora(), entradaId)
    })()
    return this.grupoDe(tipo, [entradaId]).get(entradaId) ?? []
  }

  private nombreGrupo(tipo: TipoGrupo): string {
    return tipo === 'etiqueta' ? 'La etiqueta' : 'La persona'
  }

  renombrarEnGrupo(tipo: TipoGrupo, id: string, nombre: string): void {
    const g = GRUPOS[tipo]
    const limpio = nombre.replace(/\s+/g, ' ').trim().slice(0, 60)
    if (!limpio) throw new Error(`${this.nombreGrupo(tipo)} necesita un nombre`)
    const otra = this.db
      .prepare(
        `SELECT 1 FROM ${g.tabla} WHERE minus(name) = minus(?) AND id <> ? AND deleted_at IS NULL`
      )
      .get(limpio, id)
    if (otra)
      throw new Error(
        `Ya existe ${tipo === 'etiqueta' ? 'una etiqueta' : 'una persona'} con ese nombre (puedes fusionarlas)`
      )
    const r = this.db
      .prepare(`UPDATE ${g.tabla} SET name = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`)
      .run(limpio, ahora(), id)
    if (!r.changes) throw new Error(`${this.nombreGrupo(tipo)} ya no existe`)
  }

  /** Color propio (#rrggbb) o null para volver al predeterminado. */
  colorearEnGrupo(tipo: TipoGrupo, id: string, color: string | null): void {
    if (color !== null && !/^#[0-9a-f]{6}$/i.test(color)) throw new Error('El color no es válido')
    this.db
      .prepare(`UPDATE ${GRUPOS[tipo].tabla} SET color = ?, updated_at = ? WHERE id = ?`)
      .run(color?.toLowerCase() ?? null, ahora(), id)
  }

  /** Pasa todas las entradas de `origen` a `destino` y borra `origen`. */
  fusionarEnGrupo(tipo: TipoGrupo, origen: string, destino: string): void {
    if (origen === destino) throw new Error('Elige otra para fusionar')
    const g = GRUPOS[tipo]
    this.db.transaction(() => {
      const existe = this.db
        .prepare(`SELECT 1 FROM ${g.tabla} WHERE id = ? AND deleted_at IS NULL`)
        .get(destino)
      if (!existe) throw new Error(`${this.nombreGrupo(tipo)} de destino ya no existe`)
      this.db
        .prepare(
          `INSERT OR IGNORE INTO ${g.union} (entry_id, ${g.col})
           SELECT entry_id, ? FROM ${g.union} WHERE ${g.col} = ?`
        )
        .run(destino, origen)
      this.db.prepare(`DELETE FROM ${g.union} WHERE ${g.col} = ?`).run(origen)
      this.db.prepare(`DELETE FROM ${g.tabla} WHERE id = ?`).run(origen)
    })()
  }

  /** La quita de todas las entradas y la borra (las entradas no se tocan). */
  eliminarDeGrupo(tipo: TipoGrupo, id: string): void {
    const g = GRUPOS[tipo]
    this.db.transaction(() => {
      this.db.prepare(`DELETE FROM ${g.union} WHERE ${g.col} = ?`).run(id)
      this.db.prepare(`DELETE FROM ${g.tabla} WHERE id = ?`).run(id)
    })()
  }

  /** Entradas con esa etiqueta o persona, de la más nueva a la más vieja. */
  entradasDeGrupo(tipo: TipoGrupo, id: string): ResumenEntrada[] {
    const g = GRUPOS[tipo]
    const filas = this.db
      .prepare(
        `SELECT e.* FROM entries e JOIN ${g.union} u ON u.entry_id = e.id
         WHERE u.${g.col} = ? AND e.deleted_at IS NULL
         ORDER BY e.date DESC, coalesce(e.time, '99:99') DESC, e.created_at DESC`
      )
      .all(id) as FilaEntrada[]
    return this.resumenes(filas)
  }

  // ── entradas ──
  private resumenes(filas: FilaEntrada[]): ResumenEntrada[] {
    const ids = filas.map((f) => f.id)
    const et = this.grupoDe('etiqueta', ids)
    const pe = this.grupoDe('persona', ids)
    const fotos = this.primerasFotos(ids)
    return filas.map((f) => ({
      id: f.id,
      foto: fotos.get(f.id) ?? null,
      fecha: f.date,
      hora: f.time,
      titulo: f.title,
      extracto: extracto(f.body_text),
      calificacion: f.rating,
      etiquetas: et.get(f.id) ?? [],
      personas: pe.get(f.id) ?? []
    }))
  }

  /** Primera foto de cada entrada (para la miniatura). */
  private primerasFotos(ids: string[]): Map<string, string> {
    const m = new Map<string, string>()
    if (!ids.length) return m
    const filas = this.db
      .prepare(
        `SELECT entry_id, id FROM attachments WHERE kind = 'photo' AND deleted_at IS NULL
         AND entry_id IN (SELECT value FROM json_each(?)) ORDER BY sort_order DESC, created_at DESC`
      )
      .all(JSON.stringify(ids)) as { entry_id: string; id: string }[]
    for (const f of filas) m.set(f.entry_id, f.id) // la última asignación = la de menor orden
    return m
  }

  listar(desde?: string, hasta?: string): ResumenEntrada[] {
    const filas = this.db
      .prepare(
        `SELECT * FROM entries WHERE deleted_at IS NULL AND date >= ? AND date <= ?
         ORDER BY date DESC, coalesce(time, '99:99') DESC, created_at DESC`
      )
      .all(desde ?? '0000-00-00', hasta ?? '9999-99-99') as FilaEntrada[]
    return this.resumenes(filas)
  }

  delDia(fecha: string): ResumenEntrada[] {
    return this.listar(fecha, fecha).reverse()
  }

  /** Días del año con entrada y la primera foto de cualquier entrada de ese día (calendario). */
  diasConEntrada(anio: number): DiaCalendario[] {
    return this.db
      .prepare(
        `SELECT e.date AS fecha,
             (SELECT a.id FROM attachments a JOIN entries e2 ON e2.id = a.entry_id
              WHERE e2.date = e.date AND e2.deleted_at IS NULL AND a.kind = 'photo' AND a.deleted_at IS NULL
              ORDER BY e2.created_at, a.sort_order LIMIT 1) AS foto
           FROM entries e WHERE e.deleted_at IS NULL AND e.date LIKE ? GROUP BY e.date ORDER BY e.date`
      )
      .all(`${anio}-%`) as DiaCalendario[]
  }

  rangoAnios(): { min: number; max: number } {
    const f = this.db
      .prepare(`SELECT min(date) AS a, max(date) AS b FROM entries WHERE deleted_at IS NULL`)
      .get() as { a: string | null; b: string | null }
    const hoy = new Date().getFullYear()
    return {
      min: f.a ? Math.min(+f.a.slice(0, 4), hoy) : hoy,
      max: f.b ? Math.max(+f.b.slice(0, 4), hoy) : hoy
    }
  }

  obtener(id: string): Entrada | null {
    const f = this.db
      .prepare('SELECT * FROM entries WHERE id = ? AND deleted_at IS NULL')
      .get(id) as FilaEntrada | undefined
    if (!f) return null
    return {
      id: f.id,
      fecha: f.date,
      hora: f.time,
      titulo: f.title,
      html: f.body_html,
      texto: f.body_text,
      calificacion: f.rating,
      clima: leerJson<Clima>(f.weather_json),
      creada: f.created_at,
      modificada: f.updated_at,
      etiquetas: this.grupoDe('etiqueta', [f.id]).get(f.id) ?? [],
      personas: this.grupoDe('persona', [f.id]).get(f.id) ?? []
    }
  }

  guardar(e: GuardarEntrada): Entrada {
    if (!FECHA.test(e.fecha)) throw new Error('Fecha inválida')
    if (e.hora && !HORA.test(e.hora)) throw new Error('Hora inválida')
    const t = ahora()
    const html = String(e.html ?? '')
    const titulo = String(e.titulo ?? '').slice(0, 500)
    const rating = Math.max(0, Math.min(5, Math.round(e.calificacion ?? 0)))
    let id = e.id
    if (id && this.db.prepare('SELECT 1 FROM entries WHERE id = ?').get(id)) {
      this.db
        .prepare(
          `UPDATE entries SET date = ?, time = ?, title = ?, body_html = ?, body_text = ?, rating = ?, updated_at = ?,
             weather_json = CASE WHEN date = ? THEN weather_json ELSE NULL END -- otra fecha: otro clima
           WHERE id = ?`
        )
        .run(e.fecha, e.hora ?? null, titulo, html, htmlATexto(html), rating, t, e.fecha, id)
    } else {
      id = id && /^[0-9a-f-]{36}$/.test(id) ? id : randomUUID()
      this.db
        .prepare(
          `INSERT INTO entries (id, date, time, title, body_html, body_text, rating, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(id, e.fecha, e.hora ?? null, titulo, html, htmlATexto(html), rating, t, t)
    }
    return this.obtener(id)!
  }

  eliminar(id: string): void {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM entry_tags WHERE entry_id = ?').run(id)
      this.db.prepare('DELETE FROM entry_people WHERE entry_id = ?').run(id)
      this.db.prepare('DELETE FROM attachments WHERE entry_id = ?').run(id)
      this.db.prepare('DELETE FROM entries WHERE id = ?').run(id)
    })()
  }

  /** Fecha del día con entrada más cercano antes (-1) o después (1) de `fecha`. */
  vecina(fecha: string, sentido: -1 | 1): string | null {
    const sql =
      sentido < 0
        ? `SELECT max(date) AS d FROM entries WHERE deleted_at IS NULL AND date < ?`
        : `SELECT min(date) AS d FROM entries WHERE deleted_at IS NULL AND date > ?`
    return (this.db.prepare(sql).get(fecha) as { d: string | null }).d
  }

  guardarClima(id: string, clima: Clima | null): void {
    this.db
      .prepare('UPDATE entries SET weather_json = ?, updated_at = ? WHERE id = ?')
      .run(clima ? JSON.stringify(clima) : null, ahora(), id)
  }

  /** Fecha, hora y creación de una entrada (para pedir su clima). */
  datosParaClima(id: string): { fecha: string; hora: string | null; creada: string } | null {
    const f = this.db
      .prepare('SELECT date, time, created_at FROM entries WHERE id = ? AND deleted_at IS NULL')
      .get(id) as { date: string; time: string | null; created_at: string } | undefined
    return f ? { fecha: f.date, hora: f.time, creada: f.created_at } : null
  }

  // ── búsqueda y "En este día" ──
  buscar(f: FiltrosBusqueda): ResumenEntrada[] {
    const cond = ['e.deleted_at IS NULL']
    const args: unknown[] = []
    if (f.desde && FECHA.test(f.desde)) {
      cond.push('e.date >= ?')
      args.push(f.desde)
    }
    if (f.hasta && FECHA.test(f.hasta)) {
      cond.push('e.date <= ?')
      args.push(f.hasta)
    }
    for (const [ids, tipo] of [
      [f.etiquetas, 'etiqueta'],
      [f.personas, 'persona']
    ] as const) {
      if (!ids?.length) continue
      const g = GRUPOS[tipo]
      cond.push(
        `EXISTS (SELECT 1 FROM ${g.union} u WHERE u.entry_id = e.id AND u.${g.col} IN (SELECT value FROM json_each(?)))`
      )
      args.push(JSON.stringify(ids))
    }
    if (f.calificacionMin && f.calificacionMin > 0) {
      cond.push('e.rating >= ?')
      args.push(Math.min(5, Math.round(f.calificacionMin)))
    }
    for (const k of new Set(f.con ?? [])) {
      if (!['photo', 'video', 'audio', 'file'].includes(k)) continue
      cond.push(
        'EXISTS (SELECT 1 FROM attachments a WHERE a.entry_id = e.id AND a.kind = ? AND a.deleted_at IS NULL)'
      )
      args.push(k)
    }
    const orden = `ORDER BY e.date DESC, coalesce(e.time, '99:99') DESC, e.created_at DESC LIMIT 500`
    const fts = consultaFts(f.texto ?? '')
    if (!fts) {
      if (cond.length === 1) return [] // ni texto ni filtros: no se lista todo el diario
      const filas = this.db
        .prepare(`SELECT e.* FROM entries e WHERE ${cond.join(' AND ')} ${orden}`)
        .all(...args) as FilaEntrada[]
      return this.resumenes(filas)
    }
    const filas = this.db
      .prepare(
        `SELECT e.*, highlight(entries_fts, 0, char(1), char(2)) AS r_titulo,
                snippet(entries_fts, 1, char(1), char(2), '…', 40) AS r_texto
         FROM entries_fts JOIN entries e ON e.rowid = entries_fts.rowid
         WHERE entries_fts MATCH ? AND ${cond.join(' AND ')} ${orden}`
      )
      .all(fts, ...args) as (FilaEntrada & { r_titulo: string; r_texto: string })[]
    const res = this.resumenes(filas)
    return res.map((r, i) => ({
      ...r,
      resaltado: {
        titulo: filas[i].r_titulo ?? '',
        extracto: (filas[i].r_texto ?? '').replace(/\s+/g, ' ')
      }
    }))
  }

  enEsteDia(fecha: string): ResumenEntrada[] {
    if (!FECHA.test(fecha)) throw new Error('Fecha inválida')
    const y = Number(fecha.slice(0, 4))
    const dias = [fecha.slice(5)]
    if (dias[0] === '02-28' && !bisiesto(y)) dias.push('02-29') // el 29/2 se recuerda el 28
    const filas = this.db
      .prepare(
        `SELECT * FROM entries WHERE deleted_at IS NULL AND date < ?
           AND substr(date, 6, 5) IN (SELECT value FROM json_each(?))
         ORDER BY date DESC, coalesce(time, '99:99') DESC, created_at DESC`
      )
      .all(`${y}-01-01`, JSON.stringify(dias)) as FilaEntrada[]
    return this.resumenes(filas)
  }

  // ── plantillas ──
  listarPlantillas(): Plantilla[] {
    return (
      this.db
        .prepare(
          'SELECT id, name, body_html FROM templates WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE'
        )
        .all() as { id: string; name: string; body_html: string }[]
    )
      .map((f) => ({ id: f.id, nombre: f.name, html: f.body_html }))
      .sort((x, y) => x.nombre.localeCompare(y.nombre, 'es', { sensitivity: 'base' }))
  }

  guardarPlantilla(p: { id?: string; nombre: string; html: string }): Plantilla {
    const nombre = String(p.nombre ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80)
    if (!nombre) throw new Error('La plantilla necesita un nombre')
    const html = String(p.html ?? '').slice(0, 2_000_000)
    const t = ahora()
    if (p.id && this.db.prepare('SELECT 1 FROM templates WHERE id = ?').get(p.id)) {
      this.db
        .prepare('UPDATE templates SET name = ?, body_html = ?, updated_at = ? WHERE id = ?')
        .run(nombre, html, t, p.id)
      return { id: p.id, nombre, html }
    }
    const id = randomUUID()
    this.db
      .prepare(
        'INSERT INTO templates (id, name, body_html, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run(id, nombre, html, t, t)
    return { id, nombre, html }
  }

  eliminarPlantilla(id: string): void {
    this.db.prepare('DELETE FROM templates WHERE id = ?').run(id)
    if (this.ajuste<string | null>('plantillaDefecto', null) === id)
      this.guardarAjuste('plantillaDefecto', null)
  }

  // ── duplicar (texto, etiquetas, personas, clima; los adjuntos los copia adjuntos.ts) ──
  duplicar(id: string): string {
    const f = this.db.prepare('SELECT * FROM entries WHERE id = ?').get(id) as
      FilaEntrada | undefined
    if (!f) throw new Error('La entrada ya no existe')
    const nueva = randomUUID()
    const t = ahora()
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO entries (id, date, time, title, body_html, body_text, rating, weather_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          nueva,
          f.date,
          f.time,
          f.title ? `${f.title} (copia)` : '(copia)',
          f.body_html,
          f.body_text,
          f.rating,
          f.weather_json,
          t,
          t
        )
      for (const g of Object.values(GRUPOS))
        this.db
          .prepare(
            `INSERT INTO ${g.union} (entry_id, ${g.col}) SELECT ?, ${g.col} FROM ${g.union} WHERE entry_id = ?`
          )
          .run(nueva, id)
    })()
    return nueva
  }

  // ── estadísticas (Configuración → Estadísticas) ──
  estadisticas(): Omit<Estadisticas, 'tamanoBase' | 'tamanoAdjuntos'> {
    const uno = <T>(sql: string): T => this.db.prepare(sql).get() as T
    const entradas = uno<{ n: number }>(
      'SELECT count(*) AS n FROM entries WHERE deleted_at IS NULL'
    ).n
    const porTipo = this.db
      .prepare(
        `SELECT a.kind, count(*) AS n FROM attachments a JOIN entries e ON e.id = a.entry_id
         WHERE a.deleted_at IS NULL AND e.deleted_at IS NULL GROUP BY a.kind`
      )
      .all() as { kind: string; n: number }[]
    const tipo = (k: string): number => porTipo.find((x) => x.kind === k)?.n ?? 0
    const cal = uno<{ prom: number | null; n: number }>(
      'SELECT avg(rating) AS prom, count(*) AS n FROM entries WHERE deleted_at IS NULL AND rating > 0'
    )
    // palabras: con la misma regla que el contador del editor
    const palabras = (
      this.db.prepare('SELECT body_text, title FROM entries WHERE deleted_at IS NULL').all() as {
        body_text: string
        title: string
      }[]
    ).map((f) => contarPalabras(f.body_text))
    const total = palabras.reduce((a, b) => a + b, 0)
    const mas = (g: (typeof GRUPOS)[TipoGrupo]): { nombre: string; cantidad: number } | null => {
      const f = this.db
        .prepare(
          `SELECT t.name AS nombre, count(*) AS cantidad FROM ${g.union} u
           JOIN ${g.tabla} t ON t.id = u.${g.col} JOIN entries e ON e.id = u.entry_id
           WHERE e.deleted_at IS NULL GROUP BY t.id ORDER BY cantidad DESC, t.name LIMIT 1`
        )
        .get() as { nombre: string; cantidad: number } | undefined
      return f ?? null
    }
    const dias = (
      this.db
        .prepare('SELECT DISTINCT date FROM entries WHERE deleted_at IS NULL ORDER BY date')
        .all() as { date: string }[]
    ).map((f) => f.date)
    return {
      entradas,
      dias: dias.length,
      primera: dias[0] ?? null,
      adjuntos: porTipo.reduce((a, b) => a + b.n, 0),
      fotos: tipo('photo'),
      videos: tipo('video'),
      audios: tipo('audio'),
      archivos: tipo('file'),
      calificacionPromedio: cal.prom,
      calificadas: cal.n,
      palabras: total,
      palabrasMin: palabras.length ? palabras.reduce((a, b) => Math.min(a, b)) : 0,
      palabrasMax: palabras.reduce((a, b) => Math.max(a, b), 0),
      palabrasPromedio: palabras.length ? total / palabras.length : 0,
      etiquetaMasUsada: mas(GRUPOS.etiqueta),
      personaMasEtiquetada: mas(GRUPOS.persona),
      ...rachas(dias)
    }
  }

  /** Borra TODO el contenido (entradas, etiquetas, personas, plantillas). La contraseña y los ajustes quedan. */
  vaciar(): void {
    this.db.transaction(() => {
      for (const t of [
        'entry_tags',
        'entry_people',
        'attachments',
        'entries',
        'tags',
        'people',
        'templates',
        'importados'
      ])
        this.db.prepare(`DELETE FROM ${t}`).run()
    })()
    this.db.exec(`INSERT INTO entries_fts(entries_fts) VALUES ('rebuild')`)
    this.guardarAjuste('plantillaDefecto', null) // las plantillas ya no existen
    this.db.exec('VACUUM') // devuelve el espacio al disco
  }

  // ── ajustes guardados DENTRO de la base cifrada (ciudad del clima, plantillas, etc.) ──
  ajuste<T>(clave: string, defecto: T): T {
    const f = this.db.prepare('SELECT value_json FROM settings WHERE key = ?').get(clave) as
      { value_json: string } | undefined
    return f ? (JSON.parse(f.value_json) as T) : defecto
  }

  guardarAjuste(clave: string, valor: unknown): void {
    this.db
      .prepare(
        'INSERT INTO settings (key, value_json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json'
      )
      .run(clave, JSON.stringify(valor))
  }
}
