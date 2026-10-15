import { describe, expect, it } from 'vitest'
import { nombreConExtension } from '../archivos'

describe('nombreConExtension', () => {
  it('corrige la extensión según el tipo real', () => {
    expect(nombreConExtension('foto.png', 'image/jpeg')).toBe('foto.jpg')
    expect(nombreConExtension('foto.JPEG', 'image/jpeg')).toBe('foto.JPEG')
    expect(nombreConExtension('sin extension', 'image/jpeg')).toBe('sin extension.jpg')
    expect(nombreConExtension('a.b.heic', 'image/jpeg')).toBe('a.b.jpg')
    expect(nombreConExtension('doc.pdf', 'application/pdf')).toBe('doc.pdf')
  })
})
