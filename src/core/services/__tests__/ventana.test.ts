import { describe, expect, it } from 'vitest'
import { ubicarVentana } from '../ventana'

const monitor = [{ x: 0, y: 0, width: 2560, height: 1400 }]
const e = { x: 100, y: 80, ancho: 1200, alto: 800, maximizada: true }

describe('ubicar la ventana como quedó', () => {
  it('sin nada guardado: tamaño por defecto', () => {
    expect(ubicarVentana(undefined, monitor)).toEqual({ width: 1000, height: 700 })
  })
  it('usa el tamaño y la posición guardados', () => {
    expect(ubicarVentana(e, monitor)).toEqual({ width: 1200, height: 800, x: 100, y: 80 })
  })
  it('nunca más chica que el mínimo', () => {
    expect(ubicarVentana({ ...e, ancho: 200, alto: 100 }, monitor)).toMatchObject({
      width: 640,
      height: 460
    })
  })
  it('si quedó fuera de las pantallas (otro monitor), la centra el sistema', () => {
    expect(ubicarVentana({ ...e, x: 4000 }, monitor)).toEqual({ width: 1200, height: 800 })
    // segundo monitor a la derecha: ahí sí se ve
    expect(
      ubicarVentana({ ...e, x: 3000 }, [...monitor, { x: 2560, y: 0, width: 1920, height: 1080 }])
    ).toMatchObject({ x: 3000 })
  })
  it('datos rotos: por defecto', () => {
    expect(ubicarVentana({ ...e, x: NaN }, monitor)).toEqual({ width: 1000, height: 700 })
  })
})
