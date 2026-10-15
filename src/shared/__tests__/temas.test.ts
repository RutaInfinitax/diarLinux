import { describe, expect, it } from 'vitest'
import {
  ACENTOS,
  SKINS,
  calcularApariencia,
  contraste,
  luminancia,
  type OpcionesApariencia
} from '../temas'
const base: OpcionesApariencia = {
  tema: 'oscuro',
  skin: 'clasico',
  acento: 'skin',
  barra: 'color',
  lateralTinte: false,
  fondoTinte: false
}

describe('skins', () => {
  it('ids únicos y que no choquen con los especiales', () => {
    const ids = SKINS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).not.toContain('clasico')
  })

  for (const s of SKINS) {
    it(`${s.nombre}: el texto se lee bien`, () => {
      for (const tintes of [false, true]) {
        const { oscuro, vars } = calcularApariencia(
          { ...base, skin: s.id, lateralTinte: tintes, fondoTinte: tintes },
          false
        )
        expect(oscuro).toBe(!s.claro)
        expect(contraste(vars['--texto'], vars['--fondo'])).toBeGreaterThan(7)
        expect(contraste(vars['--texto'], vars['--lateral-medio'])).toBeGreaterThan(4.5)
        expect(contraste(vars['--texto-suave'], vars['--fondo'])).toBeGreaterThan(3.5)
        expect(contraste(vars['--acento-texto'], vars['--acento'])).toBeGreaterThan(3)
        expect(contraste(vars['--chip-texto'], vars['--chip'])).toBeGreaterThan(3.5)
        expect(contraste(vars['--acento-claro'], vars['--fondo'])).toBeGreaterThan(2.2)
      }
    })
  }

  it('cualquier acento sobre cualquier skin: los íconos se distinguen del fondo', () => {
    for (const s of SKINS)
      for (const a of ACENTOS) {
        const { vars } = calcularApariencia({ ...base, skin: s.id, acento: a.id }, false)
        expect(contraste(vars['--acento-texto'], vars['--acento'])).toBeGreaterThan(3)
      }
  })

  it('clásico: solo el acento (los colores siguen siendo los de tema.css)', () => {
    const { oscuro, vars } = calcularApariencia({ ...base, acento: 'salvia' }, false)
    expect(oscuro).toBe(true)
    expect(vars['--fondo']).toBeUndefined()
    expect(vars['--acento']).toBe('#5f7a63')
    const claro = calcularApariencia({ ...base, tema: 'sistema', acento: 'skin' }, false)
    expect(claro.oscuro).toBe(false)
    expect(claro.vars['--acento']).toBe(ACENTOS[0].acento)
  })
})

describe('días con entrada', () => {
  it('el número se lee sobre el color del día en todos los skins y acentos', () => {
    for (const s of SKINS)
      for (const ac of ['skin', ...ACENTOS.map((a) => a.id)]) {
        const { vars } = calcularApariencia({ ...base, skin: s.id, acento: ac }, false)
        expect(contraste(vars['--acento-dia-texto'], vars['--acento-dia'])).toBeGreaterThan(3)
      }
  })
})

describe('luz y calidez del fondo, suavidad del texto', () => {
  const todos = ['clasico', ...SKINS.map((s) => s.id)]
  for (const skin of todos)
    for (const tema of ['oscuro', 'claro'] as const) {
      if (skin !== 'clasico' && tema === 'claro') continue // el skin ya decide claro/oscuro
      it(`${skin}${skin === 'clasico' ? ' ' + tema : ''}: siempre se lee`, () => {
        for (const fondoLuz of [-100, -50, 0, 50, 100])
          for (const fondoCalidez of [-100, 0, 100])
            for (const textoSuave of [0, 100]) {
              const { vars } = calcularApariencia(
                { ...base, skin, tema, fondoLuz, fondoCalidez, textoSuave },
                false
              )
              const f = vars['--fondo'] ?? (tema === 'oscuro' ? '#2b2b2b' : '#f4f4f6')
              const t = vars['--texto'] ?? (tema === 'oscuro' ? '#e8e8e8' : '#1e1e20')
              expect(
                contraste(t, f),
                `${fondoLuz}/${fondoCalidez}/${textoSuave}`
              ).toBeGreaterThanOrEqual(4.5)
              if (vars['--texto-suave'])
                expect(contraste(vars['--texto-suave'], f)).toBeGreaterThanOrEqual(2.9)
            }
      })
    }

  it('aclarar un tema oscuro lo aclara de verdad (pero no lo vuelve blanco)', () => {
    const f = (fondoLuz: number): number =>
      luminancia(calcularApariencia({ ...base, fondoLuz }, false).vars['--fondo'])
    expect(f(100)).toBeGreaterThan(f(50))
    expect(f(50)).toBeGreaterThan(luminancia('#2b2b2b'))
    expect(f(100)).toBeLessThan(0.25)
    expect(f(-100)).toBeLessThan(luminancia('#2b2b2b'))
  })

  it('oscurecer un tema claro le saca lo blanco', () => {
    const f = (fondoLuz: number): number =>
      luminancia(calcularApariencia({ ...base, tema: 'claro', fondoLuz }, false).vars['--fondo'])
    expect(f(-100)).toBeLessThan(f(-50))
    expect(f(-50)).toBeLessThan(luminancia('#f4f4f6'))
  })

  it('la calidez tiñe el fondo hacia el sepia o el azul', () => {
    const c = (h: string): number[] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
    const r = (h: string): number => c(h)[0]
    const b = (h: string): number => c(h)[2]
    const calido = calcularApariencia({ ...base, fondoCalidez: 100 }, false).vars['--fondo']
    const frio = calcularApariencia({ ...base, fondoCalidez: -100 }, false).vars['--fondo']
    expect(r(calido) > b(calido)).toBe(true)
    expect(b(frio) > r(frio)).toBe(true)
  })
})
