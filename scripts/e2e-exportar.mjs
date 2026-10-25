// Prueba de plantillas, duplicar con fotos, estadísticas, acerca de,
// notificaciones/bandeja/autostart, exportar en los 6 formatos y restablecer el diario.
// Ventana oculta y diario temporal. Uso: node scripts/e2e-exportar.mjs <tmp>
import { _electron as electron } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const tmp = process.argv[2]
const datos = path.join(tmp, 'diario')
const salida = path.join(tmp, 'exportado')
fs.mkdirSync(salida, { recursive: true })
let fallas = 0
const ok = (c, m) => {
  if (!c) fallas++
  console.log((c ? 'OK   ' : 'FALLA') + ' ' + m)
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const errores = []

function png(w, h, semilla) {
  const crc = (b) => {
    let c = ~0
    for (const x of b) {
      c ^= x
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
    }
    return ~c >>> 0
  }
  const trozo = (tipo, d) => {
    const l = Buffer.alloc(4)
    l.writeUInt32BE(d.length)
    const t = Buffer.from(tipo)
    const c = Buffer.alloc(4)
    c.writeUInt32BE(crc(Buffer.concat([t, d])))
    return Buffer.concat([l, t, d, c])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const filas = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3
      filas[o] = ((x * 255) / w + semilla) & 255
      filas[o + 1] = ((y * 255) / h) & 255
      filas[o + 2] = semilla & 255
    }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    trozo('IHDR', ihdr),
    trozo('IDAT', zlib.deflateSync(filas)),
    trozo('IEND', Buffer.alloc(0))
  ])
}

const app = await electron.launch({
  args: ['.'],
  env: { ...process.env, DIARLINUX_DATA: datos, DIARLINUX_OCULTA: '1' }
})
const win = await app.firstWindow()
win.on('pageerror', (e) => errores.push(e.message))
await app.evaluate(({ BrowserWindow }) =>
  BrowserWindow.getAllWindows()[0].setContentSize(1000, 680)
)
await win.waitForSelector('text=Crea tu diario')
await win.fill('input[placeholder="Contraseña"]', 'clave-exportar')
await win.fill('input[placeholder="Repetir la contraseña"]', 'clave-exportar')
await win.click('text=Crear diario')
await win.waitForSelector('.bloqueo-codigo', { timeout: 20000 })
await win.check('.bloqueo-check input')
await win.click('text=Continuar')
await win.waitForSelector('.cal-grilla')

const abrirAjustes = async (pestana) => {
  await win.click('.lateral-item:has-text("Configuración")')
  await win.click(`.aj-pestanas button:has-text("${pestana}")`)
}

// ── 1. Plantillas ──
await abrirAjustes('General')
await win.click('text=Gestionar plantillas…')
await win.waitForSelector('.pl-ventana')
ok(
  (await win.locator('.pl-nueva').count()) === 1 && (await win.locator('.pl-nombre').count()) === 1,
  'sin plantillas: abre una nueva para escribirla'
)
await win.fill('.pl-nombre', 'Preguntas del día')
await win.click('.pl-doc')
await win.keyboard.type('¿Qué agradezco hoy?')
await win.click('.pl-guardar')
await win.waitForSelector('.pl-lista button.sel:has-text("Preguntas del día")')
ok(true, 'plantilla creada con nombre y texto')
// la barra de formato funciona en el editor de plantillas
await win.click('.pl-doc')
await win.keyboard.press('Control+End')
await win.keyboard.press('Enter')
await win.click('.pl-edicion .ed-herramientas button[title="Lista"]')
await win.keyboard.type('Una cosa buena')
await win.click('.pl-guardar')
await espera(200)
const pl = await win.evaluate(() => window.diario.plantillas.listar())
ok(
  pl.length === 1 && pl[0].html.includes('<li>') && pl[0].html.includes('agradezco'),
  'la plantilla guarda el formato (lista): ' + pl[0]?.html
)
await win.screenshot({ path: 'docs/validacion/plantillas.png' })
// Esc cierra solo la ventana de plantillas, no la Configuración
await win.keyboard.press('Escape')
await espera(150)
ok(
  (await win.locator('.pl-ventana').count()) === 0 &&
    (await win.locator('.aj-ventana').count()) === 1,
  'Esc cierra solo el gestor de plantillas'
)
await win.selectOption('.aj-form select:near(:text("Plantilla para entradas nuevas"))', {
  label: 'Preguntas del día'
})
await espera(200)
ok(
  (await win.evaluate(() => window.diario.plantillas.defecto())) === pl[0].id,
  'plantilla predeterminada elegida'
)
await win.keyboard.press('Escape')

await win.click('.barra-boton[title^="Nueva entrada"]')
await win.waitForSelector('.ed-cuerpo')
await espera(300)
ok(
  (await win.textContent('.ed-cuerpo')).includes('¿Qué agradezco hoy?'),
  'una entrada nueva empieza con la plantilla predeterminada'
)

// ── 2. Duplicar una entrada con fotos ──
await win.click('.ed-cuerpo')
await win.keyboard.press('Control+End')
await win.keyboard.type(' Texto propio para EXPORTAR.')
await win.setInputFiles('.ed-acciones input[type=file]', [
  { name: 'foto uno.png', mimeType: 'image/png', buffer: png(900, 600, 10) },
  { name: 'foto dos.png', mimeType: 'image/png', buffer: png(700, 900, 120) }
])
await win.waitForFunction(() => document.querySelectorAll('.ed-foto img').length === 2, null, {
  timeout: 30000
})
await espera(900) // autoguardado
await win.click('.barra-boton[title="Más opciones"]')
await win.click('.ed-menu button:has-text("Duplicar entrada")')
await espera(1500)
const todas = await win.evaluate(() => window.diario.entradas.listar())
const adjCopia = await win.evaluate(
  async (ids) => Promise.all(ids.map((i) => window.diario.adjuntos.listar(i))),
  todas.map((e) => e.id)
)
ok(
  todas.length === 2 && adjCopia.every((l) => l.length === 2),
  'Duplicar crea otra entrada con sus 2 fotos'
)
ok(
  new Set(adjCopia.flat().map((a) => a.id)).size === 4,
  'las fotos de la copia son archivos propios (otro id)'
)

// más entradas para estadísticas y exportar (por la API, como lo haría la ventana)
const ids = await win.evaluate(async () => {
  const a = await window.diario.entradas.guardar({
    fecha: '2024-03-10',
    titulo: 'Viaje al MAR',
    html: '<h2>Playa</h2><p>Un día <strong>hermoso</strong> con <a href="https://ejemplo.com">enlace</a>.</p><ul data-type="taskList"><li data-checked="true"><label><input type="checkbox" checked></label><div><p>nadar</p></div></li></ul>',
    calificacion: 5
  })
  const b = await window.diario.entradas.guardar({
    fecha: '2024-03-11',
    titulo: 'Otro día',
    html: '<p>Nada especial PALABRA-B.</p>',
    calificacion: 2
  })
  const t = await window.diario.etiquetas.crear('viajes')
  await window.diario.etiquetas.asignar(a.id, [t.id])
  const p = await window.diario.personas.crear('Ana')
  await window.diario.personas.asignar(a.id, [p.id])
  return { a: a.id, b: b.id, viajes: t.id }
})

// ── 3. Estadísticas y Acerca de ──
await abrirAjustes('Estadísticas')
await win.waitForSelector('.aj-stats')
const stats = await win.textContent('.aj-stats')
ok(
  /Entradas:4/.test(stats) &&
    /Fotos:4/.test(stats) &&
    /Etiqueta más usada:viajes \(1\)/.test(stats),
  'Estadísticas: entradas, fotos y etiqueta más usada'
)
ok(
  /Persona más etiquetada:Ana/.test(stats) && /Calificación promedio:3,50/.test(stats),
  'Estadísticas: persona y calificación'
)
await win.screenshot({ path: 'docs/validacion/ajustes-estadisticas.png' })
await win.click('.aj-pestanas button:has-text("Acerca de")')
await win.waitForSelector('.aj-acerca')
ok(
  /Versión \d+\.\d+\.\d+/.test(await win.textContent('.aj-acerca')),
  'Acerca de: versión y licencias'
)
await win.screenshot({ path: 'docs/validacion/ajustes-acerca.png' })

// ── 4. Notificaciones, bandeja e iniciar con el sistema ──
await win.click('.aj-pestanas button:has-text("Notificaciones")')
await win.check('label:has-text("Avisarme si todavía") input')
await win.fill('input.aj-hora', '07:30')
await win.check('label:has-text("Mostrar el ícono en la bandeja") input')
await win.check('label:has-text("Al cerrar la ventana") input')
await win.check('label:has-text("Abrir diarLinux al iniciar") input')
await espera(300)
const aj = await win.evaluate(() => window.diario.ajustes.obtener())
ok(
  aj.recordatorio && aj.recordatorioHora === '07:30' && aj.bandeja && aj.cerrarABandeja,
  'recordatorio, hora y bandeja guardados'
)
const autostart = path.join(datos, 'autostart', 'diarlinux.desktop')
ok(
  fs.existsSync(autostart) &&
    /Exec=.*iniciar\.sh" --bandeja/.test(fs.readFileSync(autostart, 'utf8')),
  'iniciar con el sistema crea el .desktop (en la carpeta de prueba, no en la real)'
)
await win.screenshot({ path: 'docs/validacion/ajustes-notificaciones.png' })
await win.uncheck('label:has-text("Abrir diarLinux al iniciar") input')
await espera(200)
ok(!fs.existsSync(autostart), 'desactivarlo borra el .desktop')
await win.keyboard.press('Escape')
// cerrar la ventana la esconde (sigue viva)
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
await espera(500)
ok(
  (await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)) === 1,
  'con "cerrar a la bandeja", cerrar la ventana no sale de la app'
)
// "Nueva entrada" desde la bandeja / notificación abre el editor de hoy
await app.evaluate(({ BrowserWindow }) =>
  BrowserWindow.getAllWindows()[0].webContents.send('app:nuevaEntrada')
)
await win.waitForSelector('.ed-cuerpo')
ok(true, '"Nueva entrada" desde la bandeja abre el editor')
await win.click('.lateral-item:has-text("Calendario")')

// ── 5. Exportar ──
const exportar = async (destino, cambios, opciones = {}) => {
  await app.evaluate((_e, d) => (process.env.DIARLINUX_EXPORTAR_EN = d), destino)
  return win.evaluate((o) => window.diario.exportar.hacer(o), {
    desde: '2024-01-01',
    hasta: '2099-12-31',
    formato: 'html',
    datos: {
      adjuntos: true,
      personas: true,
      clima: true,
      sol: true,
      luna: true,
      calificacion: true,
      etiquetas: true
    },
    porFecha: false,
    adjuntosAparte: false,
    soloEtiquetas: null,
    ...cambios,
    ...opciones
  })
}
// la vista
await win.click('.lateral-item:has-text("Exportar")')
await win.waitForSelector('.exp-form')
await win.waitForSelector('.exp-pie:has-text("entradas")')
await win.click('.exp-rapidos button:has-text("Todo")')
await espera(400)
ok(/4 entradas/.test(await win.textContent('.exp-pie')), 'la vista cuenta las entradas que entran')
await win.screenshot({ path: 'docs/validacion/exportar.png' })
await app.evaluate(
  (_e, d) => (process.env.DIARLINUX_EXPORTAR_EN = d),
  path.join(salida, 'vista.html')
)
await win.selectOption('#exp-formato', 'html')
await win.click('.exp-pie button')
await win.waitForSelector('.exp-aviso:has-text("SIN cifrar")')
ok(true, 'antes de exportar avisa que queda SIN cifrar')
await win.click('text=Exportar sin cifrar')
await win.waitForSelector('.exp-ok', { timeout: 30000 })
ok(fs.existsSync(path.join(salida, 'vista.html')), 'exportar desde la vista crea el archivo')

const html = fs.readFileSync(path.join(salida, 'vista.html'), 'utf8')
ok(
  html.includes('Viaje al MAR') &&
    html.includes('<strong>hermoso</strong>') &&
    html.includes('☑ nadar') &&
    (html.match(/data:image\/jpeg;base64/g) ?? []).length === 4,
  'HTML: texto con formato, tareas y las 4 fotos incrustadas'
)
ok(
  html.includes('Etiquetas: viajes') && html.includes('Personas: Ana') && html.includes('★★★★★'),
  'HTML: etiquetas, personas y calificación'
)
ok(!/<script/i.test(html), 'HTML: sin scripts')

const r1 = await exportar(path.join(salida, 'diario.md'), { formato: 'md' })
const md = fs.readFileSync(r1.ruta, 'utf8')
ok(md.includes('## Playa') && md.includes('**hermoso**') && md.includes('- [x] nadar'), 'Markdown')
const r2 = await exportar(path.join(salida, 'diario.txt'), { formato: 'txt' })
const txt = fs.readFileSync(r2.ruta, 'utf8')
ok(
  txt.includes('PLAYA') && txt.includes('[x] nadar') && txt.includes('🖼 Foto: foto uno.jpg'),
  'Texto'
)
const r3 = await exportar(path.join(salida, 'diario.json'), { formato: 'json' })
const js = JSON.parse(fs.readFileSync(r3.ruta, 'utf8'))
ok(
  js.entradas.length === 4 &&
    js.entradas.find((e) => e.titulo === 'Viaje al MAR').etiquetas[0] === 'viajes',
  'JSON'
)
const r4 = await exportar(path.join(salida, 'diario.docx'), { formato: 'docx' })
const docx = fs.readFileSync(r4.ruta)
const lista = execFileSync('unzip', ['-l', r4.ruta]).toString()
const xml = execFileSync('unzip', ['-p', r4.ruta, 'word/document.xml']).toString()
ok(
  docx.subarray(0, 2).toString() === 'PK' &&
    (xml.match(/<pic:pic /g) ?? []).length === 4 && // (la copia repite las mismas fotos: Word las guarda una vez)
    (lista.match(/word\/media\/.+\.jpg/g) ?? []).length === 2 &&
    xml.includes('hermoso') &&
    xml.includes('PALABRA-B'),
  'Word: documento válido con texto y 4 imágenes'
)
const r5 = await exportar(path.join(salida, 'diario.pdf'), { formato: 'pdf' })
const pdf = fs.readFileSync(r5.ruta)
const pdfTexto = execFileSync('pdftotext', [r5.ruta, '-']).toString()
ok(
  pdf.subarray(0, 4).toString() === '%PDF' &&
    pdfTexto.includes('Viaje al MAR') &&
    pdfTexto.includes('PALABRA-B'),
  'PDF con el texto'
)
// un archivo por fecha + adjuntos aparte
const r6 = await exportar(salida, { formato: 'md', porFecha: true, adjuntosAparte: true })
const archivosR6 = fs.readdirSync(r6.ruta).sort()
ok(
  r6.archivos === 3 && archivosR6.includes('2024-03-10.md') && archivosR6.includes('adjuntos'),
  `un archivo por fecha (3 días): ${archivosR6.join(', ')}`
)
const adj = fs.readdirSync(path.join(r6.ruta, 'adjuntos'))
ok(
  adj.length === 4 &&
    adj.every(
      (n) =>
        n.endsWith('.jpg') &&
        fs
          .readFileSync(path.join(r6.ruta, 'adjuntos', n))
          .subarray(0, 3)
          .equals(Buffer.from([0xff, 0xd8, 0xff]))
    ),
  'adjuntos aparte: los 4 originales descifrados, con la extensión de su tipo real: ' +
    adj.join(', ')
)
const mdDia = fs.readdirSync(r6.ruta).find((n) => n !== 'adjuntos' && !n.startsWith('2024'))
ok(
  fs.readFileSync(path.join(r6.ruta, mdDia), 'utf8').includes('![foto uno.jpg](adjuntos/'),
  'el Markdown enlaza las fotos de la carpeta adjuntos/'
)
// solo etiquetas elegidas
const r7 = await exportar(path.join(salida, 'viajes.json'), {
  formato: 'json',
  soloEtiquetas: [ids.viajes]
})
ok(
  JSON.parse(fs.readFileSync(r7.ruta, 'utf8'))
    .entradas.map((e) => e.titulo)
    .join() === 'Viaje al MAR',
  'solo las entradas con la etiqueta elegida'
)
// sin datos extra
const r8 = await exportar(path.join(salida, 'sin-datos.txt'), {
  formato: 'txt',
  datos: {
    adjuntos: false,
    personas: false,
    clima: false,
    sol: false,
    luna: false,
    calificacion: false,
    etiquetas: false
  }
})
const t8 = fs.readFileSync(r8.ruta, 'utf8')
ok(
  !t8.includes('Etiquetas:') && !t8.includes('Foto:') && !t8.includes('Fase lunar'),
  'sin casillas: solo el texto'
)
// exportar esta entrada (menú ⋯ del editor)
await win.evaluate((id) => window.diario.entradas.obtener(id), ids.a)
await win.click('.lateral-item:has-text("Línea de tiempo")')
await win.click('.tarjeta:has-text("Viaje al MAR")')
await win.waitForSelector('.ed-cuerpo')
await win.click('.barra-boton[title="Más opciones"]')
await win.click('.ed-menu button:has-text("Exportar esta entrada")')
await win.waitForSelector('.exp-entrada')
ok(
  (await win.textContent('.exp-entrada')).includes('Viaje al MAR'),
  '"Exportar esta entrada" abre Exportar con esa entrada'
)
await espera(500)
ok(
  /^1 entrada/.test(await win.textContent('.exp-pie .exp-nota')),
  '…y cuenta solo esa: ' + (await win.textContent('.exp-pie .exp-nota'))
)

// ── 6. Restablecer diario ──
await abrirAjustes('Diario')
await win.click('text=Restablecer diario…')
await win.fill('.aj-restablecer input[placeholder="BORRAR TODO"]', 'BORRAR TODO')
await win.fill('.aj-restablecer input[type=password]', 'equivocada')
await win.click('.aj-restablecer button:has-text("Borrar todo el diario")')
await win.waitForSelector('.aj-restablecer :text("Contraseña incorrecta")')
ok(
  (await win.evaluate(() => window.diario.entradas.listar())).length === 4,
  'con la contraseña mala no borra nada'
)
const backupsAntes = (await win.evaluate(() => window.diario.backups.listar())).length
await win.fill('.aj-restablecer input[type=password]', 'clave-exportar')
await win.click('.aj-restablecer button:has-text("Borrar todo el diario")')
await win.waitForSelector('text=Diario vaciado')
ok(
  (await win.evaluate(() => window.diario.entradas.listar())).length === 0,
  'Restablecer borra todas las entradas'
)
ok(
  (await win.evaluate(() => window.diario.plantillas.listar())).length === 0 &&
    (await win.evaluate(() => window.diario.plantillas.defecto())) === null,
  'y las plantillas (la predeterminada queda en blanco)'
)
ok(
  (await win.evaluate(() => window.diario.backups.listar())).length === backupsAntes + 1,
  'antes de borrar hace un backup'
)
ok(fs.readdirSync(path.join(datos, 'attachments')).length === 0, 'no quedan adjuntos cifrados')

ok(
  errores.length === 0,
  'sin errores en la página' + (errores.length ? ': ' + errores.join(' | ') : '')
)
await app.evaluate(({ app }) => app.quit())
await app.close().catch(() => {})
console.log(fallas ? `\n${fallas} FALLAS` : '\nTODO OK')
process.exit(fallas ? 1 : 0)
