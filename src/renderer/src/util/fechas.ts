import { es } from '../i18n'
import { idioma } from '../../../shared/i18n'

const p2 = (n: number): string => String(n).padStart(2, '0')

/** Fecha local AAAA-MM-DD (sin pasar por UTC: evita saltos de día). */
export function iso(d: Date): string {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}

export function desdeIso(s: string): Date {
  const [a, m, d] = s.split('-').map(Number)
  return new Date(a, m - 1, d)
}

export const hoyIso = (): string => iso(new Date())

export function sumarDias(s: string, n: number): string {
  const d = desdeIso(s)
  d.setDate(d.getDate() + n)
  return iso(d)
}

/** DD/MM/AAAA (en inglés, MM/DD/YYYY) */
export function corta(s: string): string {
  const [a, m, d] = s.split('-')
  return idioma() === 'en' ? `${m}/${d}/${a}` : `${d}/${m}/${a}`
}

/** "Mié, 24/07/2019" */
export function conDia(s: string): string {
  return `${es.diasCortos[desdeIso(s).getDay()]}, ${corta(s)}`
}

export function nombreMes(anio: number, mes: number): string {
  return `${es.meses[mes]} ${anio}`.toUpperCase()
}

export function diasDelMes(anio: number, mes: number): number {
  return new Date(anio, mes + 1, 0).getDate()
}
