/**
 * Exportación JSON de Diarium (formato de la exportación de Diarium):
 * un .zip con `<nombre>.json` (lista de entradas) y `media/<AAAA-MM-DD_HHMMSSmmm>/<archivo>`.
 * Cada entrada: { date: '2024-07-01T17:04:55.0508163' (hora local, sin zona), heading, html,
 * tags: string[], people: string[], tracker: [] }. La carpeta de media lleva la fecha y hora de su
 * entrada hasta los milisegundos (si la fecha no tiene fracción, mmm = 000).
 * Funciones puras (con tests).
 */

export interface EntradaDiarium {
  idExterno: string // la fecha completa (única por entrada)
  fecha: string // AAAA-MM-DD
  hora: string // HH:MM
  titulo: string
  html: string
  etiquetas: string[]
  personas: string[]
  clave: string // nombre de su carpeta en media/
}

const FECHA = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/

/** '2024-07-01T17:04:55.0508163' → '2024-07-01_170455050' (nombre de la carpeta de media). */
export function claveMedia(date: string): string | null {
  const m = FECHA.exec(date.trim())
  if (!m) return null
  const ms = (m[5] ?? '').padEnd(3, '0').slice(0, 3)
  return `${m[1]}_${m[2]}${m[3]}${m[4]}${ms}`
}

const lista = (v: unknown): string[] =>
  Array.isArray(v)
    ? [...new Set(v.map((x) => String(x).trim()).filter(Boolean))]
    : typeof v === 'string' && v.trim()
      ? [v.trim()]
      : []

/** Lee el JSON de Diarium. Las entradas sin fecha válida se descartan (se cuentan en `invalidas`). */
export function leerDiarium(json: unknown): { entradas: EntradaDiarium[]; invalidas: number } {
  if (!Array.isArray(json)) throw new Error('Ese JSON no es una exportación de Diarium')
  const entradas: EntradaDiarium[] = []
  let invalidas = 0
  for (const x of json) {
    const e = (x ?? {}) as Record<string, unknown>
    const date = String(e.date ?? '')
    const m = FECHA.exec(date.trim())
    if (!m) {
      invalidas++
      continue
    }
    entradas.push({
      idExterno: date.trim(),
      fecha: m[1],
      hora: `${m[2]}:${m[3]}`,
      titulo: String(e.heading ?? '').trim(),
      html: String(e.html ?? ''),
      etiquetas: lista(e.tags),
      personas: lista(e.people),
      clave: claveMedia(date)!
    })
  }
  // de la más vieja a la más nueva (así quedan en ese orden también dentro de cada día)
  entradas.sort((a, b) => a.idExterno.localeCompare(b.idExterno))
  return { entradas, invalidas }
}

/**
 * Reparte los archivos de media/ entre las entradas. Una carpeta cuya fecha y hora no coincide con
 * ninguna entrada va a la entrada del MISMO día con la hora más cercana (no se pierde nada); si ese
 * día no tiene entradas, queda en `sinEntrada`.
 */
export function repartirMedia(
  entradas: EntradaDiarium[],
  archivos: string[] // rutas dentro del zip: media/<clave>/<nombre>
): { porEntrada: Map<string, string[]>; sinEntrada: string[] } {
  const porEntrada = new Map<string, string[]>()
  const porClave = new Map(entradas.map((e) => [e.clave, e]))
  const sinEntrada: string[] = []
  const minutos = (clave: string): number => {
    const h = clave.slice(11)
    return Number(h.slice(0, 2)) * 3600 + Number(h.slice(2, 4)) * 60 + Number(h.slice(4, 6))
  }
  for (const a of [...archivos].sort()) {
    const m = /^media\/([^/]+)\/[^/]+$/.exec(a)
    if (!m) continue
    let e = porClave.get(m[1])
    if (!e) {
      const dia = m[1].slice(0, 10)
      const delDia = entradas.filter((x) => x.fecha === dia)
      e = delDia.sort(
        (x, y) =>
          Math.abs(minutos(x.clave) - minutos(m[1])) - Math.abs(minutos(y.clave) - minutos(m[1]))
      )[0]
    }
    if (!e) {
      sinEntrada.push(a)
      continue
    }
    porEntrada.set(e.idExterno, [...(porEntrada.get(e.idExterno) ?? []), a])
  }
  return { porEntrada, sinEntrada }
}
