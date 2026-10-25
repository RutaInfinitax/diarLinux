import { describe, expect, it } from 'vitest'
import { claveMedia, leerDiarium, repartirMedia } from '../diarium'

describe('Diarium (exportación JSON)', () => {
  it('carpeta de media según la fecha (con y sin fracción de segundo)', () => {
    expect(claveMedia('2024-07-01T17:04:55.0508163')).toBe('2024-07-01_170455050')
    expect(claveMedia('2024-10-03T01:04:48.87')).toBe('2024-10-03_010448870')
    expect(claveMedia('2024-08-04T18:38:00')).toBe('2024-08-04_183800000')
    expect(claveMedia('ayer')).toBeNull()
  })

  it('lee entradas con fecha, hora, título, etiquetas y personas, ordenadas', () => {
    const r = leerDiarium([
      {
        date: '2024-07-02T09:00:00.1',
        heading: ' Segunda ',
        html: '<p>b</p>',
        tags: ['sueños🥱'],
        people: ['Maria 🌱', 'Mush 🍄', 'Maria 🌱'],
        tracker: []
      },
      { date: '2024-07-01T17:04:55.0508163', heading: '', html: '<p>a</p>', tags: [], people: [] },
      { date: 'mal', heading: 'x', html: '' }
    ])
    expect(r.invalidas).toBe(1)
    expect(r.entradas.map((e) => [e.fecha, e.hora, e.titulo])).toEqual([
      ['2024-07-01', '17:04', ''],
      ['2024-07-02', '09:00', 'Segunda']
    ])
    expect(r.entradas[1].etiquetas).toEqual(['sueños🥱'])
    expect(r.entradas[1].personas).toEqual(['Maria 🌱', 'Mush 🍄'])
    expect(() => leerDiarium({})).toThrow()
  })

  it('reparte los archivos: por fecha exacta, o a la entrada más cercana del mismo día', () => {
    const { entradas } = leerDiarium([
      { date: '2024-08-04T09:00:00.5', heading: 'mañana', html: '' },
      { date: '2024-08-04T18:37:59.9', heading: 'tarde', html: '' },
      { date: '2024-08-05T10:00:00.000', heading: 'otro', html: '' }
    ])
    const r = repartirMedia(entradas, [
      'media/2024-08-04_090000500/a.jpg',
      'media/2024-08-04_183800000/b.jpg', // sin coincidencia exacta → la de las 18:37
      'media/2024-08-05_100000000/c.m4a',
      'media/2024-09-01_100000000/d.jpg', // ese día no hay entradas
      'Diarium.json'
    ])
    expect(r.porEntrada.get('2024-08-04T09:00:00.5')).toEqual(['media/2024-08-04_090000500/a.jpg'])
    expect(r.porEntrada.get('2024-08-04T18:37:59.9')).toEqual(['media/2024-08-04_183800000/b.jpg'])
    expect(r.porEntrada.get('2024-08-05T10:00:00.000')).toEqual([
      'media/2024-08-05_100000000/c.m4a'
    ])
    expect(r.sinEntrada).toEqual(['media/2024-09-01_100000000/d.jpg'])
  })
})
