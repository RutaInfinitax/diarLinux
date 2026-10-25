import { describe, expect, it } from 'vitest'
import { aBloques, bloquesAMarkdown, bloquesATexto, nombreSeguro, nombreUnico } from '../exportar'

const HTML =
  '<h2>Mi día</h2><p>Hola <strong>mundo</strong> y <em>algo</em> <a href="https://x.com/a b">enlace</a>.<br>Otra línea</p>' +
  '<ul><li><p>uno</p><ul><li><p>uno.a</p></li></ul></li><li><p>dos</p></li></ul>' +
  '<ol><li><p>primero</p></li><li><p>segundo</p></li></ol>' +
  '<ul data-type="taskList"><li data-checked="true" data-type="taskItem"><label><input type="checkbox" checked></label><div><p>hecha</p></div></li>' +
  '<li data-checked="false"><label><input type="checkbox"></label><div><p>pendiente</p></div></li></ul>' +
  '<blockquote><p>una cita</p></blockquote><pre><code>let a = 1 &lt; 2</code></pre><hr><p>fin &amp; listo</p>'

describe('exportar: HTML → bloques', () => {
  const b = aBloques(HTML)
  it('reconoce cada tipo de bloque', () => {
    expect(b.map((x) => x.tipo)).toEqual([
      'h2',
      'p',
      'li',
      'li',
      'li',
      'li',
      'li',
      'li',
      'li',
      'cita',
      'codigo',
      'hr',
      'p'
    ])
  })
  it('listas anidadas, numeradas y tareas', () => {
    const li = b.filter((x) => x.tipo === 'li')
    expect(li.map((x) => [x.lista, x.nivel, x.n, x.hecho])).toEqual([
      ['ul', 0, 1, false],
      ['ul', 1, 1, false],
      ['ul', 0, 2, false],
      ['ol', 0, 1, false],
      ['ol', 0, 2, false],
      ['tarea', 0, 1, true],
      ['tarea', 0, 2, false]
    ])
  })
  it('Markdown', () => {
    const md = bloquesAMarkdown(b)
    expect(md).toContain('## Mi día')
    expect(md).toContain('Hola **mundo** y *algo* [enlace](https://x.com/a%20b).  \nOtra línea')
    expect(md).toContain('- uno\n   - uno.a\n- dos')
    expect(md).toContain('- dos\n\n1. primero\n2. segundo\n\n- [x] hecha')
    expect(md).toContain('- [x] hecha\n- [ ] pendiente')
    expect(md).toContain('> una cita')
    expect(md).toContain('```\nlet a = 1 < 2\n```')
    expect(md).toContain('---\n\nfin & listo')
  })
  it('texto plano', () => {
    const t = bloquesATexto(b)
    expect(t).toContain('MI DÍA')
    expect(t).toContain('enlace (https://x.com/a b)')
    expect(t).toContain('• uno\n  • uno.a\n• dos')
    expect(t).toContain('[x] hecha')
    expect(t).toContain('│ una cita')
  })
  it('texto suelto, espacios y entidades', () => {
    expect(bloquesATexto(aBloques('hola  <b>che</b>   chau'))).toBe('hola che chau')
    expect(aBloques('<p>  </p><p></p>')).toEqual([])
    expect(bloquesAMarkdown(aBloques('<p>1 * 2 = _x_</p>'))).toBe('1 \\* 2 = \\_x\\_')
  })
})

describe('exportar: nombres de archivo', () => {
  it('seguros y únicos', () => {
    expect(nombreSeguro('a/b:c?.jpg')).toBe('a_b_c_.jpg')
    expect(nombreSeguro('..oculto')).toBe('oculto')
    expect(nombreSeguro('')).toBe('archivo')
    expect(nombreSeguro('x'.repeat(100) + '.jpeg', 20)).toBe('x'.repeat(15) + '.jpeg')
    const u = new Set<string>()
    expect(nombreUnico('foto.jpg', u)).toBe('foto.jpg')
    expect(nombreUnico('Foto.jpg', u)).toBe('Foto (2).jpg')
    expect(nombreUnico('foto.jpg', u)).toBe('foto (3).jpg')
  })
})
