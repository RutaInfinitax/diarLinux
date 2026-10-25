// Importar desde Joplin (JEX real generado con Joplin CLI: scripts/fixtures/joplin-prueba.jex) con la
// ventana oculta. Uso: node scripts/e2e-joplin.mjs <tmp>
import { _electron as electron } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const tmp = process.argv[2]
const datos = path.join(tmp, 'diario')
const jex = path.resolve('scripts/fixtures/joplin-prueba.jex')
const ok = (c, m) => console.log((c ? 'OK   ' : 'FALLA') + ' ' + m)
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const errores = []

const app = await electron.launch({
  args: ['.'],
  env: { ...process.env, DIARLINUX_DATA: datos, DIARLINUX_OCULTA: '1', DIARLINUX_ELEGIR: jex }
})
const win = await app.firstWindow()
win.on('pageerror', (e) => errores.push(e.message))
await app.evaluate(({ BrowserWindow }) =>
  BrowserWindow.getAllWindows()[0].setContentSize(1000, 700)
)
await win.waitForSelector('text=Crea tu diario')
await win.fill('input[placeholder="Contraseña"]', 'clave-joplin')
await win.fill('input[placeholder="Repetir la contraseña"]', 'clave-joplin')
await win.click('text=Crear diario')
await win.waitForSelector('.bloqueo-codigo', { timeout: 20000 })
await win.check('.bloqueo-check input')
await win.click('text=Continuar')
await win.waitForSelector('.cal-grilla')

// Configuración → Diario → Importar desde Joplin
await win.click('.lateral-item:has-text("Configuración")')
await win.click('.aj-pestanas button:has-text("Diario")')
await win.click('text=Importar desde Joplin…')
await win.click('text=Elegir archivo JEX…')
await win.waitForSelector('.imp-resumen')
const resumen = await win.textContent('.imp-resumen')
ok(
  resumen.includes('Entradas5') && resumen.includes('2 fotos, 1 videos, 2 audios, 1 otros'),
  'resumen: 5 notas, 2 fotos, 1 video, 2 audios, 1 PDF'
)
ok(resumen.includes('15/01/2023') && /Etiquetas5/.test(resumen), 'resumen: fechas y 5 etiquetas')
await win.screenshot({ path: 'docs/validacion/importar-joplin.png' })
await win.click('.imp-botones .primario')
await win.waitForSelector('text=Importación terminada', { timeout: 60000 })
const fin = await win.textContent('.imp-ventana')
ok(
  fin.includes('5 entradas nuevas con 6 archivos') && !fin.includes('No se pudo'),
  'importa las 5 notas y los 6 archivos sin errores'
)
await win.click('.imp-botones .primario')
await win.click('.aj-cerrar')

// Lo importado, por la API
const r = await win.evaluate(async () => {
  const d = window.diario
  const lista = await d.entradas.listar()
  const por = {}
  for (const e of lista) {
    const c = await d.entradas.obtener(e.id)
    por[c.titulo] = {
      fecha: c.fecha,
      hora: c.hora,
      html: c.html,
      etiquetas: c.etiquetas.map((t) => t.nombre).sort((a, b) => a.localeCompare(b, 'es')),
      adj: await d.adjuntos.listar(c.id)
    }
  }
  return por
})
const playa = r['Día de playa']
const parque = r['Tarde en el parque']
const d0 = new Date('2023-01-15T10:30:00Z')
ok(
  playa?.fecha === `2023-01-${String(d0.getDate()).padStart(2, '0')}` &&
    playa.hora === `${String(d0.getHours()).padStart(2, '0')}:30`,
  'fecha y hora de creación de Joplin (en hora local)'
)
ok(
  JSON.stringify(playa?.etiquetas) === JSON.stringify(['Lucía', 'mar', 'vacaciones', 'Viajes']),
  'etiquetas de Joplin + la libreta como etiqueta: ' + JSON.stringify(playa?.etiquetas)
)
ok(
  playa?.html.includes('<h2>Llegamos a la costa</h2>') &&
    playa.html.includes('<strong>playa</strong>') &&
    playa.html.includes('10:00 · Salida') &&
    !/:\/[0-9a-f]{32}/.test(playa.html),
  'texto con formato, tabla como líneas y sin enlaces :/ de Joplin'
)
const tipos = (l) =>
  l
    .map((a) => a.tipo)
    .sort()
    .join(',')
ok(tipos(playa?.adj ?? []) === 'photo,video', 'Día de playa: foto y video como adjuntos')
ok(
  tipos(parque?.adj ?? []) === 'audio,audio,file,photo',
  'Tarde en el parque: foto, 2 audios y el PDF'
)
const foto = playa.adj.find((a) => a.tipo === 'photo')
ok(foto.tamano === 32783 && foto.ancho === 800, 'la foto se guarda ORIGINAL (mismos bytes, 800 px)')
const video = playa.adj.find((a) => a.tipo === 'video')
ok(video.ancho === 320 && Math.round(video.duracion) === 3, 'el video tiene miniatura y duración')
const mp3 = parque.adj.find((a) => a.nombre === 'cancion.mp3')
ok(mp3 && Math.round(mp3.duracion) === 8, 'el mp3 tiene su duración')
ok(
  parque.html.includes('data-type="taskList"') && parque.html.includes('data-checked="true"'),
  'lista de tareas con su estado'
)
ok(
  r['Comprar regalos']?.html.startsWith(
    '<ul data-type="taskList"><li data-type="taskItem" data-checked="true">'
  ),
  'tarea de Joplin hecha → casilla marcada'
)
ok(
  JSON.stringify(r['Reunión familiar']?.etiquetas) === JSON.stringify(['Diario 2023', 'familia']),
  'nota de otra libreta con su etiqueta'
)

// Nada sin cifrar en el diario
const archivos = []
const recorrer = (d) => {
  for (const n of fs.readdirSync(d)) {
    const p = path.join(d, n)
    fs.statSync(p).isDirectory() ? recorrer(p) : archivos.push(p)
  }
}
recorrer(datos)
const legibles = archivos.filter((f) => {
  const b = fs.readFileSync(f)
  return (
    ['ID3', 'RIFF', 'OggS', 'JFIF', '%PDF', 'Llegamos', 'vacaciones'].some((m) =>
      b.includes(Buffer.from(m))
    ) || b.includes(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
  )
})
ok(
  legibles.length === 0,
  'en la carpeta del diario no queda nada legible (' +
    archivos.length +
    ' archivos revisados) ' +
    legibles.join(' ')
)

// Abrir la entrada en el editor
await win.click('.lateral-item:has-text("Línea de tiempo")')
await win.locator('.tarjeta', { hasText: 'Día de playa' }).click()
await win.waitForSelector('.ed-cuerpo h2')
await win.waitForFunction(() => document.querySelectorAll('.ed-foto img').length === 2)
await espera(500)
await win.screenshot({ path: 'docs/validacion/importado-joplin.png' })
ok(
  (await win.textContent('.ed-cuerpo')).includes('Una frase para recordar.'),
  'la entrada importada se abre en el editor'
)

// Volver a importar el mismo JEX: no duplica
await win.click('.lateral-item:has-text("Configuración")')
await win.click('.aj-pestanas button:has-text("Diario")')
await win.click('text=Importar desde Joplin…')
await win.click('text=Elegir archivo JEX…')
await win.waitForSelector('.imp-resumen')
ok(
  (await win.textContent('.imp-resumen')).includes('5 ya importadas') &&
    (await win.isDisabled('.imp-botones .primario')),
  'el mismo JEX otra vez: "5 ya importadas", no se duplica'
)
await win.click('.imp-botones button:has-text("Cancelar")')

// La carpeta RAW (el JEX extraído) da lo mismo
const raw = path.join(tmp, 'raw')
fs.mkdirSync(raw)
execFileSync('tar', ['xf', jex, '-C', raw])
const rr = await win.evaluate((p) => window.diario.importar.analizarJoplin(p), raw)
ok(
  rr.notas === 5 && rr.fotos === 2 && rr.yaImportadas === 5,
  'la carpeta RAW se lee igual que el JEX'
)
await win.evaluate(() => window.diario.importar.terminar())
// Algo que no es de Joplin
const otra = path.join(tmp, 'otra')
fs.mkdirSync(otra)
const msj = await win.evaluate(
  (p) =>
    window.diario.importar.analizarJoplin(p).then(
      () => 'sin error',
      (e) => e.message
    ),
  otra
)
ok(msj.startsWith('Eso no parece una exportación de Joplin'), 'una carpeta cualquiera: aviso claro')

await app.close()
console.log('errores JS:', errores.length ? errores : 'ninguno')
