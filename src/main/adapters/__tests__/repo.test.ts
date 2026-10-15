import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { randomBytes } from '../../../core/crypto/bytes'
import { abrirDb, type DB } from '../db'
import { Repo } from '../repo'

let dir: string
let db: DB
let repo: Repo

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diarlinux-repo-'))
  db = abrirDb(path.join(dir, 'diario.db'), randomBytes(32))
  repo = new Repo(db)
})
afterEach(() => {
  db.close()
  fs.rmSync(dir, { recursive: true, force: true })
})

const entrada = (fecha: string): string => repo.guardar({ fecha, titulo: 't', html: '<p>x</p>' }).id

describe('etiquetas y personas', () => {
  it('cuenta, renombra y no deja nombres repetidos', () => {
    const a = repo.crearEnGrupo('persona', 'Lucía')
    expect(repo.crearEnGrupo('persona', 'lucía').id).toBe(a.id)
    const b = repo.crearEnGrupo('persona', 'Martín')
    repo.asignarEnGrupo('persona', entrada('2026-01-01'), [a.id])
    repo.asignarEnGrupo('persona', entrada('2026-01-02'), [a.id, b.id])
    expect(repo.listarGrupo('persona').map((p) => [p.nombre, p.cantidad])).toEqual([
      ['Lucía', 2],
      ['Martín', 1]
    ])
    expect(() => repo.renombrarEnGrupo('persona', b.id, 'LUCÍA')).toThrow(/^Ya existe/)
    repo.renombrarEnGrupo('persona', b.id, 'Martín G.')
    expect(repo.listarGrupo('persona')[1].nombre).toBe('Martín G.')
  })

  it('color: acepta #rrggbb o null y rechaza otra cosa', () => {
    const t = repo.crearEnGrupo('etiqueta', 'viajes')
    repo.colorearEnGrupo('etiqueta', t.id, '#4A6B8A')
    expect(repo.listarGrupo('etiqueta')[0].color).toBe('#4a6b8a')
    expect(() => repo.colorearEnGrupo('etiqueta', t.id, 'red; x')).toThrow()
    repo.colorearEnGrupo('etiqueta', t.id, null)
    expect(repo.listarGrupo('etiqueta')[0].color).toBeNull()
  })

  it('fusionar pasa las entradas (sin duplicar) y borra la de origen', () => {
    const a = repo.crearEnGrupo('etiqueta', 'música')
    const b = repo.crearEnGrupo('etiqueta', 'musica')
    const e1 = entrada('2026-02-01')
    const e2 = entrada('2026-02-02')
    repo.asignarEnGrupo('etiqueta', e1, [a.id, b.id])
    repo.asignarEnGrupo('etiqueta', e2, [b.id])
    repo.fusionarEnGrupo('etiqueta', b.id, a.id)
    expect(repo.listarGrupo('etiqueta').map((t) => [t.nombre, t.cantidad])).toEqual([['música', 2]])
    expect(repo.obtener(e1)!.etiquetas.map((t) => t.nombre)).toEqual(['música'])
    expect(repo.entradasDeGrupo('etiqueta', a.id).map((e) => e.fecha)).toEqual([
      '2026-02-02',
      '2026-02-01'
    ])
  })

  it('eliminar la quita de las entradas sin borrarlas', () => {
    const p = repo.crearEnGrupo('persona', 'Sofía')
    const e = entrada('2026-03-01')
    repo.asignarEnGrupo('persona', e, [p.id])
    repo.eliminarDeGrupo('persona', p.id)
    expect(repo.listarGrupo('persona')).toEqual([])
    expect(repo.obtener(e)!.personas).toEqual([])
  })
})

describe('buscar', () => {
  const crear = (fecha: string, titulo: string, texto: string, rating = 0): string =>
    repo.guardar({ fecha, titulo, html: `<p>${texto}</p>`, calificacion: rating }).id

  it('sin acentos ni mayúsculas, por prefijo, todas las palabras y con resaltado', () => {
    const a = crear('2026-01-05', 'Canción nueva', 'Escuché una CANCIÓN en el camino a casa', 4)
    crear('2026-01-06', 'Otro día', 'Nada especial pasó hoy')
    let r = repo.buscar({ texto: 'cancion' })
    expect(r.map((x) => x.id)).toEqual([a])
    expect(r[0].resaltado!.titulo).toBe('\u0001Canción\u0002 nueva')
    expect(r[0].resaltado!.extracto).toContain('\u0001CANCIÓN\u0002')
    expect(repo.buscar({ texto: 'cami' }).length).toBe(1) // prefijo
    expect(repo.buscar({ texto: 'cancion especial' }).length).toBe(0) // todas las palabras
    r = repo.buscar({ texto: 'día' })
    expect(r.map((x) => x.titulo)).toEqual(['Otro día'])
  })

  it('texto con sintaxis de FTS o comillas no rompe nada', () => {
    crear('2026-01-05', 't', 'hola "mundo" AND OR NOT ( ) * : ^')
    for (const t of ['"', '"mundo', 'AND', 'NOT (', '*', ':', '- - -', "'; DROP TABLE entries; --"])
      expect(() => repo.buscar({ texto: t })).not.toThrow()
    expect(repo.buscar({ texto: '"mundo"' }).length).toBe(1)
    expect(repo.buscar({ texto: '- - -' })).toEqual([]) // sin palabras ni filtros: nada
  })

  it('filtros: fechas, etiquetas, personas, calificación y adjuntos', () => {
    const a = crear('2025-03-01', 'a', 'paseo', 5)
    const b = crear('2026-03-01', 'b', 'paseo', 2)
    const t = repo.crearEnGrupo('etiqueta', 'viajes')
    const p = repo.crearEnGrupo('persona', 'Ana')
    repo.asignarEnGrupo('etiqueta', a, [t.id])
    repo.asignarEnGrupo('persona', b, [p.id])
    const ids = (f: Parameters<Repo['buscar']>[0]): string[] => repo.buscar(f).map((x) => x.id)
    expect(ids({ texto: 'paseo', desde: '2026-01-01' })).toEqual([b])
    expect(ids({ texto: 'paseo', hasta: '2025-12-31' })).toEqual([a])
    expect(ids({ texto: '', etiquetas: [t.id] })).toEqual([a]) // solo filtros, sin texto
    expect(ids({ texto: '', personas: [p.id] })).toEqual([b])
    expect(ids({ texto: 'paseo', calificacionMin: 4 })).toEqual([a])
    db.prepare(
      `INSERT INTO attachments (id, entry_id, kind, mime, original_name, size, created_at, updated_at)
       VALUES ('f1', ?, 'photo', 'image/jpeg', 'x.jpg', 1, 'x', 'x')`
    ).run(b)
    expect(ids({ texto: 'paseo', con: ['photo'] })).toEqual([b])
    expect(ids({ texto: 'paseo', con: ['photo', 'audio'] })).toEqual([])
  })
})

describe('en este día y clima', () => {
  it('mismo día de años anteriores (y el 29/2 en años no bisiestos)', () => {
    const f = (fecha: string): string => repo.guardar({ fecha, titulo: fecha, html: '' }).id
    f('2024-10-11')
    f('2020-10-11')
    f('2026-10-11') // este año: no
    f('2025-10-12')
    f('2024-02-29')
    expect(repo.enEsteDia('2026-10-11').map((e) => e.fecha)).toEqual(['2024-10-11', '2020-10-11'])
    expect(repo.enEsteDia('2026-02-28').map((e) => e.fecha)).toEqual(['2024-02-29'])
    expect(repo.enEsteDia('2028-02-28').map((e) => e.fecha)).toEqual([]) // 2028 es bisiesto
  })

  it('el clima se guarda y se borra si cambia la fecha de la entrada', () => {
    const e = repo.guardar({ fecha: '2026-05-01', titulo: 'x', html: '' })
    const clima = {
      temp: 20,
      codigo: 1,
      max: 22,
      min: 10,
      amanecer: '07:00',
      atardecer: '18:00',
      hora: '12:00',
      ciudad: 'X'
    }
    repo.guardarClima(e.id, clima)
    expect(repo.obtener(e.id)!.clima).toEqual(clima)
    repo.guardar({ id: e.id, fecha: '2026-05-01', titulo: 'y', html: '' })
    expect(repo.obtener(e.id)!.clima).toEqual(clima) // misma fecha: se conserva
    repo.guardar({ id: e.id, fecha: '2026-05-02', titulo: 'y', html: '' })
    expect(repo.obtener(e.id)!.clima).toBeNull()
  })
})

describe('plantillas, duplicar, estadísticas y vaciar', () => {
  it('plantillas: crear, editar, listar, borrar (y deja de ser la predeterminada)', () => {
    const p = repo.guardarPlantilla({ nombre: '  Gratitud  ', html: '<p>Hoy agradezco…</p>' })
    expect(p.nombre).toBe('Gratitud')
    repo.guardarPlantilla({ id: p.id, nombre: 'Gratitud', html: '<p>3 cosas</p>' })
    repo.guardarPlantilla({ nombre: 'Ánimo', html: '<p>x</p>' })
    expect(repo.listarPlantillas().map((x) => [x.nombre, x.html])).toEqual([
      ['Ánimo', '<p>x</p>'],
      ['Gratitud', '<p>3 cosas</p>']
    ])
    repo.guardarAjuste('plantillaDefecto', p.id)
    repo.eliminarPlantilla(p.id)
    expect(repo.listarPlantillas().length).toBe(1)
    expect(repo.ajuste('plantillaDefecto', 'x')).toBeNull()
    expect(() => repo.guardarPlantilla({ nombre: ' ', html: '' })).toThrow()
  })

  it('duplicar copia texto, calificación, clima, etiquetas y personas', () => {
    const e = repo.guardar({
      fecha: '2026-04-01',
      titulo: 'Viaje',
      html: '<p>Mar</p>',
      calificacion: 4
    })
    repo.guardarClima(e.id, {
      temp: 1,
      codigo: 0,
      max: null,
      min: null,
      amanecer: null,
      atardecer: null,
      hora: '12:00',
      ciudad: 'X'
    })
    const t = repo.crearEnGrupo('etiqueta', 'playa')
    const p = repo.crearEnGrupo('persona', 'Ana')
    repo.asignarEnGrupo('etiqueta', e.id, [t.id])
    repo.asignarEnGrupo('persona', e.id, [p.id])
    const c = repo.obtener(repo.duplicar(e.id))!
    expect(c).toMatchObject({
      fecha: '2026-04-01',
      titulo: 'Viaje (copia)',
      html: '<p>Mar</p>',
      calificacion: 4
    })
    expect(c.clima?.ciudad).toBe('X')
    expect(c.etiquetas.map((x) => x.nombre)).toEqual(['playa'])
    expect(c.personas.map((x) => x.nombre)).toEqual(['Ana'])
    expect(repo.buscar({ texto: 'mar' }).length).toBe(2) // la copia también se encuentra
  })

  it('estadísticas y rachas', () => {
    for (const [f, txt, r] of [
      ['2026-01-01', 'uno dos tres', 5],
      ['2026-01-02', 'uno', 3],
      ['2026-01-03', 'uno dos', 0],
      ['2026-01-10', 'a b c d e f', 0]
    ] as const)
      repo.guardar({ fecha: f, titulo: '', html: `<p>${txt}</p>`, calificacion: r })
    const t = repo.crearEnGrupo('etiqueta', 'x')
    const e = repo.listar()[0]
    repo.asignarEnGrupo('etiqueta', e.id, [t.id])
    const s = repo.estadisticas()
    expect(s).toMatchObject({
      entradas: 4,
      dias: 4,
      primera: '2026-01-01',
      calificadas: 2,
      calificacionPromedio: 4,
      palabras: 12,
      palabrasMin: 1,
      palabrasMax: 6,
      palabrasPromedio: 3,
      etiquetaMasUsada: { nombre: 'x', cantidad: 1 },
      personaMasEtiquetada: null,
      rachaMaxima: 3
    })
  })

  it('rachas: actual cuenta hasta hoy o ayer', async () => {
    const { rachas } = await import('../repo')
    const hoy = new Date(2026, 9, 11)
    expect(rachas(['2026-10-09', '2026-10-10', '2026-10-11'], hoy)).toEqual({
      rachaActual: 3,
      rachaMaxima: 3
    })
    expect(rachas(['2026-10-09', '2026-10-10'], hoy)).toEqual({ rachaActual: 2, rachaMaxima: 2 })
    expect(rachas(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-08'], hoy)).toEqual({
      rachaActual: 0,
      rachaMaxima: 3
    })
    expect(rachas([], hoy)).toEqual({ rachaActual: 0, rachaMaxima: 0 })
  })

  it('vaciar borra todo el contenido pero no los ajustes', () => {
    const e = repo.guardar({ fecha: '2026-01-01', titulo: 'secreto', html: '<p>texto</p>' })
    repo.asignarEnGrupo('etiqueta', e.id, [repo.crearEnGrupo('etiqueta', 'x').id])
    repo.guardarPlantilla({ nombre: 'p', html: '' })
    repo.guardarAjuste('clima', { ciudad: 'X' })
    repo.vaciar()
    expect(repo.listar()).toEqual([])
    expect(repo.listarGrupo('etiqueta')).toEqual([])
    expect(repo.listarPlantillas()).toEqual([])
    expect(repo.buscar({ texto: 'secreto' })).toEqual([])
    expect(repo.ajuste('clima', null)).toEqual({ ciudad: 'X' })
  })
})
