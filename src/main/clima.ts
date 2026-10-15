/**
 * Clima con Open-Meteo desde main (la ventana no tiene acceso a la red: CSP connect-src 'self').
 * Solo viajan las coordenadas de la ciudad elegida y fechas; nunca contenido del diario.
 * Los ajustes (ciudad, unidades…) se guardan DENTRO de la base cifrada.
 */
import { net } from 'electron'
import {
  BASES,
  leerCiudades,
  leerClima,
  urlCiudades,
  urlClima,
  type Ciudad,
  type Clima
} from '../core/services/clima'
import type { AjustesClima } from '../shared/tipos'
import { diario, ErrorDiario } from './diario'

const POR_DEFECTO: AjustesClima = { ciudad: null, auto: true, unidad: 'C', cielo: true }

// En las pruebas (ventana oculta) se puede apuntar a un servidor falso local: nunca sale a internet
function bases(): typeof BASES {
  const falso = process.env.DIARLINUX_OCULTA === '1' ? process.env.DIARLINUX_OPENMETEO : undefined
  return falso
    ? { pronostico: `${falso}/api`, archivo: `${falso}/archivo`, geo: `${falso}/geo` }
    : BASES
}

async function pedir(url: string): Promise<unknown> {
  let r: Response
  try {
    r = await net.fetch(url, {
      signal: AbortSignal.timeout(12_000),
      headers: { 'User-Agent': 'diarLinux (diario personal)' }
    })
  } catch {
    throw new ErrorDiario('Sin conexión: no se pudo consultar el clima')
  }
  if (!r.ok) throw new ErrorDiario('El servicio del clima no respondió (intenta más tarde)')
  return r.json()
}

const dosCifras = (n: number): string => String(n).padStart(2, '0')
const fechaLocal = (d: Date): string =>
  `${d.getFullYear()}-${dosCifras(d.getMonth() + 1)}-${dosCifras(d.getDate())}`
const horaLocal = (d: Date): string => `${dosCifras(d.getHours())}:${dosCifras(d.getMinutes())}`

export function ajustesClima(): AjustesClima {
  return { ...POR_DEFECTO, ...diario.repo.ajuste<Partial<AjustesClima>>('clima', {}) }
}

export function guardarAjustesClima(a: Partial<AjustesClima>): AjustesClima {
  const actual = ajustesClima()
  const limpio: AjustesClima = { ...actual }
  if (typeof a.auto === 'boolean') limpio.auto = a.auto
  if (typeof a.cielo === 'boolean') limpio.cielo = a.cielo
  if (a.unidad === 'C' || a.unidad === 'F') limpio.unidad = a.unidad
  if (a.ciudad === null) limpio.ciudad = null
  else if (a.ciudad) {
    const c = a.ciudad
    const lat = Number(c.lat)
    const lon = Number(c.lon)
    if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) throw new ErrorDiario('Ciudad inválida')
    const txt = (x: unknown): string => String(x ?? '').slice(0, 120)
    limpio.ciudad = {
      nombre: txt(c.nombre),
      region: txt(c.region),
      pais: txt(c.pais),
      lat,
      lon,
      zona: txt(c.zona)
    }
  }
  diario.repo.guardarAjuste('clima', limpio)
  return limpio
}

export async function buscarCiudad(texto: string): Promise<Ciudad[]> {
  const t = texto.trim()
  if (t.length < 2) return []
  return leerCiudades(await pedir(urlCiudades(t.slice(0, 80), bases())))
}

/**
 * Hora para la temperatura: la de la entrada; si no tiene, la hora en que se creó (si fue ese mismo
 * día) o, si se escribe hoy, la actual; si no, el mediodía.
 */
function horaDeEntrada(d: { fecha: string; hora: string | null; creada: string }): string {
  if (d.hora) return d.hora
  const ahora = new Date()
  if (d.fecha === fechaLocal(ahora)) return horaLocal(ahora)
  const creada = new Date(d.creada)
  if (fechaLocal(creada) === d.fecha) return horaLocal(creada)
  return '12:00'
}

export async function climaParaEntrada(id: string): Promise<Clima | null> {
  const { ciudad } = ajustesClima()
  if (!ciudad) throw new ErrorDiario('Elige tu ciudad en Configuración → Clima')
  const d = diario.repo.datosParaClima(id)
  if (!d) throw new ErrorDiario('La entrada ya no existe')
  const url = urlClima(ciudad, d.fecha, fechaLocal(new Date()), bases())
  if (!url) return null // fecha sin datos (muy en el futuro o antes de 1940)
  const clima = leerClima(await pedir(url), horaDeEntrada(d), ciudad.nombre)
  // La entrada pudo cambiar de fecha mientras se consultaba: solo se guarda si sigue igual
  const ahora = diario.repo.datosParaClima(id)
  if (clima && ahora?.fecha === d.fecha) diario.repo.guardarClima(id, clima)
  return clima
}
