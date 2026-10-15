import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { fechaHoraLocal, htmlDeJoplin, leerItem, markdownAHtml, nombreRecurso } from '../joplin'

// Nota real exportada por Joplin CLI (formato RAW), con imagen, video, tabla, código y lista
const NOTA = fs.readFileSync(path.join(__dirname, 'joplin-nota.md'), 'utf8')
const FOTO = '3f8cd8ce0f38448e96cb740f3b5bcd6d'
const VIDEO = '5583282cd15449788d720f61b2c35d81'

describe('Joplin', () => {
  it('lee título, cuerpo y propiedades', () => {
    const n = leerItem(NOTA)
    expect(n.tipo).toBe(1)
    expect(n.titulo).toBe('Día de playa')
    expect(n.cuerpo.startsWith('# Llegamos a la costa')).toBe(true)
    expect(n.cuerpo.endsWith('Link: [Joplin](https://joplinapp.org)')).toBe(true)
    expect(n.props.user_created_time).toBe('2023-01-15T10:30:00.000Z')
    expect(n.props.parent_id).toBe('e0abb4dbb050488e9387883c39f1314f')
    expect(n.props.author).toBe('')
  })

  it('elementos sin título (nota↔etiqueta) y fin de archivo con salto de línea', () => {
    const r = leerItem('id: 1\nnote_id: abc\ntag_id: def\ntype_: 6\n')
    expect(r).toMatchObject({ tipo: 6, titulo: '', cuerpo: '', props: { note_id: 'abc' } })
  })

  it('markdown → HTML del editor, con los recursos separados', () => {
    const { html, recursos } = markdownAHtml(leerItem(NOTA).cuerpo, () => true)
    expect(recursos).toEqual([FOTO, VIDEO])
    expect(html).toContain('<h2>Llegamos a la costa</h2>')
    expect(html).toContain('<strong>playa</strong>')
    expect(html).toContain('<em>Lucía</em>')
    expect(html).toContain('<del>fría</del>')
    expect(html).not.toMatch(/:\/[0-9a-f]{32}/)
    expect(html).not.toContain('<p></p>')
    expect(html).toContain('Video del paseo: video-paseo.webm') // el texto del enlace queda
    expect(html).toContain('<p><strong>Hora · Qué</strong></p>')
    expect(html).toContain('<p>10:00 · Salida</p>')
    expect(html).toContain('<blockquote>')
    expect(html).toContain('<pre><code>código de prueba')
    expect(html).toContain('<a href="https://joplinapp.org">Joplin</a>')
  })

  it('listas de tareas, listas mezcladas, HTML con recursos e imágenes de internet', () => {
    const md = [
      '- [x] Llevar agua',
      '- [ ] Llevar protector',
      '',
      'texto',
      '',
      '- normal',
      '- [x] tarea en lista mezclada',
      '',
      `Una <img src=":/${FOTO}" width="200"/> y <a href=":/${VIDEO}">el video</a>.`,
      '',
      '![](https://ejemplo.com/f.png) [otra nota](:/0123456789abcdef0123456789abcdef)'
    ].join('\n')
    const { html, recursos } = markdownAHtml(md, (id) => id !== '0123456789abcdef0123456789abcdef')
    expect(html).toContain(
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>Llevar agua</p></li>'
    )
    expect(html).toContain('data-checked="false"><p>Llevar protector</p>')
    expect(html).toContain('☑ tarea en lista mezclada')
    expect(html).toContain('el video')
    expect(html).not.toContain('<img')
    expect(html).toContain('<a href="https://ejemplo.com/f.png">https://ejemplo.com/f.png</a>')
    expect(html).toContain('otra nota')
    expect(recursos).toEqual([FOTO, VIDEO])
  })

  it('notas HTML, nombres de recursos y fechas locales', () => {
    expect(htmlDeJoplin(`<p>Hola<img src=':/${FOTO}'></p>`, () => true)).toEqual({
      html: '<p>Hola</p>',
      recursos: [FOTO]
    })
    const r = (titulo: string, ext: string): string =>
      nombreRecurso(leerItem(`${titulo}\n\nid: x\nfile_extension: ${ext}\ntype_: 4`))
    expect(r('foto-playa.jpg', 'jpg')).toBe('foto-playa.jpg')
    expect(r('Grabación', 'm4a')).toBe('Grabación.m4a')
    expect(r('', 'png')).toBe('x.png')
    const f = fechaHoraLocal('2023-01-15T10:30:00.000Z')!
    const d = new Date('2023-01-15T10:30:00.000Z')
    expect(f.fecha).toBe(`2023-01-${String(d.getDate()).padStart(2, '0')}`)
    expect(f.hora).toBe(`${String(d.getHours()).padStart(2, '0')}:30`)
    expect(fechaHoraLocal('0')).toBeNull()
    expect(fechaHoraLocal('basura')).toBeNull()
  })
  it('archivos nombrados dentro de un bloque de código también se adjuntan', () => {
    const id = 'a'.repeat(32)
    const r = markdownAHtml('```\n- ![foto.jpg](:/' + id + ')\n```', () => true)
    expect(r.recursos).toEqual([id])
    expect(r.html).toContain('foto.jpg') // el texto queda
  })
})
