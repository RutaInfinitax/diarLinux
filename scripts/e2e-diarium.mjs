// Importar desde Diarium (.zip en formato JSON) con la ventana oculta y un diario temporal.
// Usa scripts/fixtures/diarium-prueba.zip (datos inventados, mismo formato que la exportación real).
// Uso: node scripts/e2e-diarium.mjs <tmp>
import { _electron as electron } from 'playwright-core'
import path from 'node:path'

const datos = path.join(process.argv[2], 'diario')
const zip = path.resolve('scripts/fixtures/diarium-prueba.zip')
let fallas = 0
const ok = (c, m) => {
  if (!c) fallas++
  console.log((c ? 'OK   ' : 'FALLA') + ' ' + m)
}
const errores = []

const app = await electron.launch({
  args: ['.'],
  env: { ...process.env, DIARLINUX_DATA: datos, DIARLINUX_OCULTA: '1', DIARLINUX_ELEGIR: zip }
})
const win = await app.firstWindow()
win.on('pageerror', (e) => errores.push(e.message))
await app.evaluate(({ BrowserWindow }) =>
  BrowserWindow.getAllWindows()[0].setContentSize(1000, 680)
)
await win.waitForSelector('text=Crea tu diario')
await win.fill('input[placeholder="Contraseña"]', 'clave-diarium')
await win.fill('input[placeholder="Repetir la contraseña"]', 'clave-diarium')
await win.click('text=Crear diario')
await win.waitForSelector('.bloqueo-codigo', { timeout: 20000 })
await win.check('.bloqueo-check input')
await win.click('text=Continuar')
await win.waitForSelector('.cal-grilla')

const importar = async () => {
  await win.click('.lateral-item:has-text("Configuración")')
  await win.click('.aj-pestanas button:has-text("Diario")')
  await win.click('text=Importar desde Diarium…')
  await win.click('text=Elegir archivo .zip…')
  await win.waitForSelector('.imp-resumen')
  return win.textContent('.imp-resumen')
}
const resumen = await importar()
ok(
  /Entradas3/.test(resumen) && /Etiquetas2/.test(resumen) && /Personas2/.test(resumen),
  'resumen: 3 entradas, 2 etiquetas, 2 personas'
)
ok(
  /01\/07\/2024 a 04\/08\/2024/.test(resumen) && /1 fotos, 0 videos, 1 audios/.test(resumen),
  'resumen: fechas y archivos'
)
await win.screenshot({ path: 'docs/validacion/importar-diarium.png' })
await win.click('.imp-botones .primario')
await win.waitForSelector('text=Importación terminada', { timeout: 60000 })
const fin = await win.textContent('.imp-ventana')
ok(
  fin.includes('3 entradas nuevas con 2 archivos') && !fin.includes('No se pudo'),
  'importa las 3 entradas y los 2 archivos'
)
await win.click('.imp-botones .primario')
await win.click('.aj-cerrar')

const r = await win.evaluate(async () => {
  const d = window.diario
  const l = await d.entradas.listar()
  const out = []
  for (const e of l) {
    const c = await d.entradas.obtener(e.id)
    out.push({
      fecha: c.fecha,
      hora: c.hora,
      titulo: c.titulo,
      html: c.html,
      etiquetas: c.etiquetas.map((t) => t.nombre).sort(),
      personas: c.personas.map((t) => t.nombre).sort(),
      adj: (await d.adjuntos.listar(c.id)).map((a) => [a.tipo, a.nombre])
    })
  }
  return out.sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora))
})
ok(
  JSON.stringify(r.map((e) => [e.fecha, e.hora])) ===
    JSON.stringify([
      ['2024-07-01', '17:04'],
      ['2024-07-01', '21:30'],
      ['2024-08-04', '18:37']
    ]),
  'fechas y horas exactas (dos el mismo día)'
)
ok(
  r[0].titulo === 'el horno grande 🏬' && r[0].html.includes('<strong>horno</strong>'),
  'título con emoji y texto con formato'
)
ok(r[1].html.includes('<ol>') && r[1].titulo === '', 'lista numerada; entrada sin título')
ok(
  JSON.stringify(r[1].etiquetas) === JSON.stringify(['Meditacion🧘‍♂️', 'sueños🥱']) &&
    JSON.stringify(r[1].personas) === JSON.stringify(['Maria 🌱', 'Mush 🍄']),
  'etiquetas y personas (con emoji)'
)
ok(
  r[0].adj.length === 1 && r[0].adj[0][0] === 'photo',
  'la foto queda en su entrada: ' + JSON.stringify(r[0].adj)
)
ok(
  r[2].adj.length === 1 && r[2].adj[0][0] === 'audio',
  'el audio de una carpeta sin milésimas va a la entrada más cercana del día: ' +
    JSON.stringify(r[2].adj)
)
ok(
  (await win.evaluate(() => window.diario.etiquetas.listar())).length === 2,
  'sin etiquetas repetidas'
)

// otra vez: no duplica
const resumen2 = await importar()
ok(/3 ya importadas/.test(resumen2), 'al volver a importar avisa que ya están')
ok(await win.locator('.imp-botones .primario').isDisabled(), '…y no deja importarlas de nuevo')

ok(
  errores.length === 0,
  'sin errores en la página' + (errores.length ? ': ' + errores.join(' | ') : '')
)
await app.evaluate(({ app }) => app.quit())
await app.close().catch(() => {})
console.log(fallas ? `\n${fallas} FALLAS` : '\nTODO OK')
process.exit(fallas ? 1 : 0)
