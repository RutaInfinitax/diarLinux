// Prueba la app EMPAQUETADA (dist/linux-unpacked), oculta y con un diario temporal: que arranque,
// que el módulo nativo de SQLCipher cargue, que la interfaz salga del paquete (app://), el editor
// (carga bajo demanda), bloquear/desbloquear y exportar a PDF.
// Uso: node scripts/e2e-paquete.mjs <tmp>
import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'

const tmp = process.argv[2]
const datos = path.join(tmp, 'diario')
let fallas = 0
const ok = (c, m) => {
  if (!c) fallas++
  console.log((c ? 'OK   ' : 'FALLA') + ' ' + m)
}
const errores = []
const exe = path.resolve('dist/linux-unpacked/diarlinux')
ok(fs.existsSync(exe), 'existe el ejecutable empaquetado')

const t0 = Date.now()
const app = await electron.launch({
  executablePath: exe,
  args: [],
  env: { ...process.env, DIARLINUX_DATA: datos, DIARLINUX_OCULTA: '1' }
})
const win = await app.firstWindow()
win.on('pageerror', (e) => errores.push(e.message))
await win.waitForSelector('text=Crea tu diario')
ok(true, `arranca hasta la pantalla de crear diario (${Date.now() - t0} ms)`)
ok(win.url().startsWith('app://diario/'), 'la interfaz se sirve desde el paquete (app://)')
ok(await app.evaluate(({ app }) => app.isPackaged), 'corre como app empaquetada')

await win.fill('input[placeholder="Contraseña"]', 'clave-paquete')
await win.fill('input[placeholder="Repetir la contraseña"]', 'clave-paquete')
await win.click('text=Crear diario')
await win.waitForSelector('.bloqueo-codigo', { timeout: 20000 })
await win.check('.bloqueo-check input')
await win.click('text=Continuar')
await win.waitForSelector('.cal-grilla')
ok(fs.existsSync(path.join(datos, 'diario.db')), 'SQLCipher (módulo nativo) crea la base cifrada')

await win.click('.barra-boton[title^="Nueva entrada"]')
await win.waitForSelector('.ed-cuerpo', { timeout: 10000 })
await win.click('.ed-cuerpo')
await win.keyboard.type('Entrada desde el PAQUETE.')
await new Promise((r) => setTimeout(r, 1200))
ok(
  (await win.evaluate(() => window.diario.entradas.listar())).length === 1,
  'el editor (cargado bajo demanda) guarda'
)
ok(
  !fs.readFileSync(path.join(datos, 'diario.db')).includes('PAQUETE'),
  'la base no tiene el texto legible'
)

await win.keyboard.press('Control+l')
await win.waitForSelector('input[placeholder="Contraseña"]')
await win.fill('input[placeholder="Contraseña"]', 'clave-paquete')
await win.keyboard.press('Enter')
await win.waitForSelector('.cal-grilla')
ok(true, 'bloquear y desbloquear')

const pdf = path.join(tmp, 'paquete.pdf')
await app.evaluate((_e, d) => (process.env.DIARLINUX_EXPORTAR_EN = d), pdf)
await win.evaluate(() =>
  window.diario.exportar.hacer({
    desde: '2000-01-01',
    hasta: '2099-12-31',
    formato: 'pdf',
    datos: {
      adjuntos: true,
      personas: true,
      clima: false,
      sol: false,
      luna: false,
      calificacion: true,
      etiquetas: true
    },
    porFecha: false,
    adjuntosAparte: false,
    soloEtiquetas: null
  })
)
ok(fs.existsSync(pdf) && fs.readFileSync(pdf).subarray(0, 4).toString() === '%PDF', 'exporta a PDF')
await win.click('.lateral-item:has-text("Configuración")')
await win.click('.aj-pestanas button:has-text("Acerca de")')
await win.waitForSelector('.aj-acerca')
ok(true, 'Configuración (cargada bajo demanda) abre')

ok(
  errores.length === 0,
  'sin errores en la página' + (errores.length ? ': ' + errores.join(' | ') : '')
)
await app.evaluate(({ app }) => app.quit())
await app.close().catch(() => {})
console.log(fallas ? `\n${fallas} FALLAS` : '\nTODO OK')
process.exit(fallas ? 1 : 0)
