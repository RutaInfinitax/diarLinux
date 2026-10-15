import { describe, expect, it } from 'vitest'
import { diaLocal, horaValida, tocaRecordar } from '../recordatorio'

const a = (h: number, m: number): Date => new Date(2026, 9, 14, h, m)

describe('recordatorio diario', () => {
  it('no avisa antes de la hora', () => {
    expect(tocaRecordar(a(20, 59), '21:00', null)).toBe(false)
  })
  it('avisa desde la hora (también si la app se abre más tarde)', () => {
    expect(tocaRecordar(a(21, 0), '21:00', null)).toBe(true)
    expect(tocaRecordar(a(23, 40), '21:00', '2026-10-13')).toBe(true)
  })
  it('solo una vez por día', () => {
    expect(tocaRecordar(a(22, 0), '21:00', '2026-10-14')).toBe(false)
  })
  it('día local y horas válidas', () => {
    expect(diaLocal(a(0, 5))).toBe('2026-10-14')
    expect(horaValida('07:30')).toBe(true)
    expect(horaValida('24:00')).toBe(false)
    expect(horaValida('7:30')).toBe(false)
    expect(tocaRecordar(a(23, 0), 'xx', null)).toBe(false)
  })
})
