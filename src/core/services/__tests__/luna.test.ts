import { describe, expect, it } from 'vitest'
import { elongacion, faseDelDia } from '../luna'

/** Instante (por bisección) en que la elongación pasa por `objetivo` cerca de `aprox`. */
function instante(aprox: Date, objetivo: number): Date {
  const dif = (t: number): number => ((elongacion(new Date(t)) - objetivo + 540) % 360) - 180
  let a = aprox.getTime() - 2 * 86_400_000
  let b = aprox.getTime() + 2 * 86_400_000
  for (let i = 0; i < 60; i++) {
    const m = (a + b) / 2
    if (dif(a) * dif(m) <= 0) b = m
    else a = m
  }
  return new Date((a + b) / 2)
}

const minutos = (a: Date, b: Date): number => Math.abs(a.getTime() - b.getTime()) / 60_000
const diaUTC = (y: number, m: number, d: number): [Date, Date] => [
  new Date(Date.UTC(y, m - 1, d)),
  new Date(Date.UTC(y, m - 1, d + 1))
]

// Fases publicadas (USNO / NASA), en UTC
const EVENTOS: [string, number, FaseNombre][] = [
  ['2000-01-06T18:14Z', 0, 'nueva'],
  ['2000-01-21T04:40Z', 180, 'llena'],
  ['2024-01-11T11:57Z', 0, 'nueva'],
  ['2024-01-18T03:52Z', 90, 'cuartoCreciente'],
  ['2024-01-25T17:54Z', 180, 'llena'],
  ['2024-02-02T23:18Z', 270, 'cuartoMenguante']
]
type FaseNombre = 'nueva' | 'llena' | 'cuartoCreciente' | 'cuartoMenguante'

describe('fase lunar', () => {
  it.each(EVENTOS)('%s: el instante calculado difiere menos de 20 minutos', (iso, grados) => {
    const real = new Date(iso.replace('Z', ':00Z'))
    expect(minutos(instante(real, grados), real)).toBeLessThan(20)
  })

  it.each(EVENTOS)('%s: ese día (UTC) lleva el nombre de la fase', (iso, _g, fase) => {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
    expect(faseDelDia(...diaUTC(y, m, d)).fase).toBe(fase)
  })

  it('días intermedios e iluminación', () => {
    const creciente = faseDelDia(...diaUTC(2024, 1, 14))
    expect(creciente.fase).toBe('creciente')
    expect(creciente.iluminacion).toBeGreaterThan(0.05)
    expect(creciente.iluminacion).toBeLessThan(0.5)
    expect(faseDelDia(...diaUTC(2024, 1, 21)).fase).toBe('gibosaCreciente')
    expect(faseDelDia(...diaUTC(2024, 1, 29)).fase).toBe('gibosaMenguante')
    expect(faseDelDia(...diaUTC(2024, 2, 6)).fase).toBe('menguante')
    expect(faseDelDia(...diaUTC(2024, 1, 25)).iluminacion).toBeGreaterThan(0.99)
  })

  it('cada fase principal ocupa un solo día por ciclo', () => {
    const cuenta: Record<string, number> = {}
    for (let d = 1; d <= 29; d++) {
      const f = faseDelDia(...diaUTC(2024, 3, d)).fase
      cuenta[f] = (cuenta[f] ?? 0) + 1
    }
    for (const f of ['nueva', 'cuartoCreciente', 'llena', 'cuartoMenguante'])
      expect(cuenta[f]).toBe(1)
  })
})
