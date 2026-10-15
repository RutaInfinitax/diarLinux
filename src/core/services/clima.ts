import { t } from '../../shared/i18n'
/**
 * Clima de una entrada con Open-Meteo (sin clave). Solo se envían las coordenadas de la ciudad
 * elegida y la fecha: nada del diario. Funciones puras (se prueban sin red); la consulta la hace main.
 */

/** Lo que se guarda en la entrada (weather_json). Temperaturas siempre en °C. */
export interface Clima {
  temp: number // a la hora de la entrada
  codigo: number // código WMO
  max: number | null
  min: number | null
  amanecer: string | null // HH:MM, hora local de la ciudad
  atardecer: string | null
  hora: string // HH:MM usada para la temperatura
  ciudad: string
}

export interface Ciudad {
  nombre: string
  region: string // provincia / estado
  pais: string
  lat: number
  lon: number
  zona: string // zona horaria IANA
}

export type IconoClima =
  'despejado' | 'algoNublado' | 'nublado' | 'niebla' | 'llovizna' | 'lluvia' | 'nieve' | 'tormenta'

/** Códigos WMO de Open-Meteo → texto en español e ícono. */
const WMO: Record<number, [string, IconoClima]> = {
  0: ['Despejado', 'despejado'],
  1: ['Mayormente despejado', 'algoNublado'],
  2: ['Parcialmente nublado', 'algoNublado'],
  3: ['Nublado', 'nublado'],
  45: ['Niebla', 'niebla'],
  48: ['Niebla con escarcha', 'niebla'],
  51: ['Llovizna ligera', 'llovizna'],
  53: ['Llovizna', 'llovizna'],
  55: ['Llovizna intensa', 'llovizna'],
  56: ['Llovizna helada', 'llovizna'],
  57: ['Llovizna helada intensa', 'llovizna'],
  61: ['Lluvia ligera', 'lluvia'],
  63: ['Lluvia', 'lluvia'],
  65: ['Lluvia intensa', 'lluvia'],
  66: ['Lluvia helada', 'lluvia'],
  67: ['Lluvia helada intensa', 'lluvia'],
  71: ['Nevada ligera', 'nieve'],
  73: ['Nevada', 'nieve'],
  75: ['Nevada intensa', 'nieve'],
  77: ['Granizo fino', 'nieve'],
  80: ['Chubascos ligeros', 'lluvia'],
  81: ['Chubascos', 'lluvia'],
  82: ['Chubascos fuertes', 'lluvia'],
  85: ['Chubascos de nieve', 'nieve'],
  86: ['Chubascos de nieve fuertes', 'nieve'],
  95: ['Tormenta', 'tormenta'],
  96: ['Tormenta con granizo', 'tormenta'],
  99: ['Tormenta con granizo fuerte', 'tormenta']
}

export function textoClima(codigo: number): string {
  return t(WMO[codigo]?.[0] ?? 'Desconocido')
}
export function iconoClima(codigo: number): IconoClima {
  return WMO[codigo]?.[1] ?? 'nublado'
}

export function temperatura(c: number, unidad: 'C' | 'F'): string {
  return unidad === 'F' ? `${Math.round((c * 9) / 5 + 32)} °F` : `${Math.round(c)} °C`
}

/** "18 °C, Parcialmente nublado" (como el chip de la captura escribir.png). */
export function resumenClima(c: Clima, unidad: 'C' | 'F'): string {
  return `${temperatura(c.temp, unidad)}, ${textoClima(c.codigo).toLowerCase()}`
}

const diasEntre = (a: string, b: string): number =>
  Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000)

export const BASES = {
  pronostico: 'https://api.open-meteo.com',
  archivo: 'https://archive-api.open-meteo.com',
  geo: 'https://geocoding-api.open-meteo.com'
}

/**
 * URL para el clima de `fecha` (AAAA-MM-DD). El pronóstico cubre de 92 días atrás a 15 adelante;
 * lo anterior sale del archivo histórico (ERA5, desde 1940). null si la fecha no tiene datos.
 */
export function urlClima(
  c: Pick<Ciudad, 'lat' | 'lon'>,
  fecha: string,
  hoy: string,
  bases = BASES
): string | null {
  const atras = diasEntre(fecha, hoy)
  if (atras < -15 || fecha < '1940-01-01') return null
  const base = atras <= 90 ? `${bases.pronostico}/v1/forecast` : `${bases.archivo}/v1/archive`
  const p = new URLSearchParams({
    latitude: c.lat.toFixed(4),
    longitude: c.lon.toFixed(4),
    hourly: 'temperature_2m,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset',
    timezone: 'auto',
    start_date: fecha,
    end_date: fecha
  })
  return `${base}?${p}`
}

interface RespuestaClima {
  hourly?: { time?: string[]; temperature_2m?: (number | null)[]; weather_code?: (number | null)[] }
  daily?: {
    weather_code?: (number | null)[]
    temperature_2m_max?: (number | null)[]
    temperature_2m_min?: (number | null)[]
    sunrise?: (string | null)[]
    sunset?: (string | null)[]
  }
}

const horaDe = (iso: string | null | undefined): string | null =>
  iso && /T\d{2}:\d{2}/.test(iso) ? iso.slice(11, 16) : null

/** Clima a la hora `hora` (HH:MM) de la respuesta de Open-Meteo; null si no trae datos. */
export function leerClima(json: unknown, hora: string, ciudad: string): Clima | null {
  const r = json as RespuestaClima
  const h = r?.hourly
  const d = r?.daily
  if (!h?.time?.length || !h.temperature_2m) return null
  const objetivo = Number(hora.slice(0, 2))
  // la hora pedida; si no tiene dato (archivo reciente), la más cercana que sí tenga
  let mejor = -1
  for (let i = 0; i < h.time.length; i++) {
    if (h.temperature_2m[i] == null) continue
    const hi = Number(h.time[i].slice(11, 13))
    if (
      mejor < 0 ||
      Math.abs(hi - objetivo) < Math.abs(Number(h.time[mejor].slice(11, 13)) - objetivo)
    )
      mejor = i
  }
  if (mejor < 0) return null
  const num = (x: number | null | undefined): number | null => (typeof x === 'number' ? x : null)
  return {
    temp: h.temperature_2m[mejor] as number,
    codigo: num(h.weather_code?.[mejor]) ?? num(d?.weather_code?.[0]) ?? 3,
    max: num(d?.temperature_2m_max?.[0]),
    min: num(d?.temperature_2m_min?.[0]),
    amanecer: horaDe(d?.sunrise?.[0]),
    atardecer: horaDe(d?.sunset?.[0]),
    hora: h.time[mejor].slice(11, 16),
    ciudad
  }
}

/** Resultados del buscador de ciudades de Open-Meteo. */
export function leerCiudades(json: unknown): Ciudad[] {
  const l = (json as { results?: Record<string, unknown>[] })?.results ?? []
  return l
    .filter((x) => typeof x.latitude === 'number' && typeof x.longitude === 'number')
    .map((x) => ({
      nombre: String(x.name ?? ''),
      region: String(x.admin1 ?? ''),
      pais: String(x.country ?? ''),
      lat: x.latitude as number,
      lon: x.longitude as number,
      zona: String(x.timezone ?? '')
    }))
}

export function urlCiudades(texto: string, bases = BASES): string {
  const p = new URLSearchParams({ name: texto, count: '10', language: 'es', format: 'json' })
  return `${bases.geo}/v1/search?${p}`
}
