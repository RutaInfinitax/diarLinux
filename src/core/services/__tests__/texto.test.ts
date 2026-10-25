import { describe, expect, it } from 'vitest'
import { contarPalabras } from '../texto'

describe('contarPalabras', () => {
  it('cuenta palabras en español, números y signos', () => {
    expect(contarPalabras('')).toBe(0)
    expect(contarPalabras('   \n ')).toBe(0)
    expect(contarPalabras('Hoy fui al río con Martín.')).toBe(6)
    expect(contarPalabras('¿Qué tal? ¡Muy bien! — dijo él')).toBe(6)
    expect(contarPalabras('Son las 10:30 y gasté 1.500 pesos')).toBe(7)
    expect(contarPalabras('e-mail, dámelo; l’eau')).toBe(3)
    expect(contarPalabras('uno\ndos\tttres')).toBe(3)
    expect(contarPalabras('fin.Otra frase, 3,5 kilos')).toBe(5) // "fin.Otra" son dos palabras
  })
})
