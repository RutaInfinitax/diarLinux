import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { en } from '../en'
import { elegirIdioma, fijarIdioma, t, tn } from '../i18n'

/** Todos los textos literales pasados a t(…) / tn(…) en el código. */
function textosDelCodigo(): Set<string> {
  const raiz = path.resolve(__dirname, '../..')
  const salida = new Set<string>()
  const recorrer = (d: string): void => {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name)
      if (f.isDirectory()) {
        if (f.name !== '__tests__' && f.name !== 'node_modules') recorrer(p)
      } else if (/\.(ts|tsx)$/.test(f.name) && f.name !== 'en.ts') {
        // sin comentarios (los ejemplos de la documentación no cuentan)
        const s = fs
          .readFileSync(p, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^\s*\/\/.*$/gm, '')
        // t('…') o t("…"), y los dos textos de tn(n, '…', '…')
        for (const m of s.matchAll(/\bt\(\s*(['"])((?:\\.|(?!\1).)*)\1/g))
          salida.add(m[2].replace(/\\(['"\\])/g, '$1'))
        for (const m of s.matchAll(
          /\btn\([^,]+,\s*(['"])((?:\\.|(?!\1).)*)\1\s*,\s*(['"])((?:\\.|(?!\3).)*)\3/g
        )) {
          salida.add(m[2].replace(/\\(['"\\])/g, '$1'))
          salida.add(m[4].replace(/\\(['"\\])/g, '$1'))
        }
      }
    }
  }
  recorrer(raiz)
  return salida
}

describe('i18n', () => {
  it('cada texto de t()/tn() tiene traducción al inglés', () => {
    const faltan = [...textosDelCodigo()].filter((s) => !(s in en))
    expect(faltan).toEqual([])
  })

  it('las traducciones conservan las mismas {variables}', () => {
    const vars = (s: string): string =>
      [...s.matchAll(/\{(\w+)\}/g)]
        .map((m) => m[1])
        .sort()
        .join(',')
    const mal = Object.entries(en).filter(([k, v]) => vars(k) !== vars(v))
    expect(mal).toEqual([])
  })

  it('elige el idioma del sistema', () => {
    expect(elegirIdioma('auto', ['es-AR', 'en-US'])).toBe('es')
    expect(elegirIdioma('auto', ['en-GB'])).toBe('en')
    expect(elegirIdioma('auto', ['de-DE'])).toBe('en')
    expect(elegirIdioma(undefined, [])).toBe('es')
    expect(elegirIdioma('en', ['es-ES'])).toBe('en')
  })

  it('traduce, interpola y cae al español si falta', () => {
    fijarIdioma('en')
    expect(t('Texto que no existe {x}', { x: 1 })).toBe('Texto que no existe 1')
    fijarIdioma('es')
    expect(tn(3, '1 entrada', '{n} entradas')).toBe('3 entradas')
  })
})
