// Prueba de punta a punta (Playwright + Electron), con la ventana OCULTA y un diario temporal.
// Uso: node scripts/e2e.mjs <carpeta-temporal>
import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'

const tmp = process.argv[2]
const datos = path.join(tmp, 'diario')
const ok = (c, m) => console.log((c ? 'OK   ' : 'FALLA') + ' ' + m)
const espera = (ms) => new Promise((r) => setTimeout(r, ms))

async function abrir() {
  const app = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      DIARLINUX_DATA: datos,
      DIARLINUX_OCULTA: '1',
      ELECTRON_ENABLE_LOGGING: '0'
    }
  })
  const win = await app.firstWindow()
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(900, 600)
  )
  await win.waitForLoadState('domcontentloaded')
  return { app, win }
}

let { app, win } = await abrir()
const errores = []
win.on('pageerror', (e) => errores.push(e.message))

// 1) asistente de primer inicio
await win.waitForSelector('text=Crea tu diario')
ok(
  (await win.locator('.bloqueo-carpeta span').textContent()) === datos,
  'el asistente propone la carpeta'
)
await win.fill('input[placeholder="Contraseña"]', 'clave-de-prueba-1')
await win.fill('input[placeholder="Repetir la contraseña"]', 'otra')
await win.click('text=Crear diario')
ok(
  (await win.locator('.bloqueo-error').textContent()).includes('no coinciden'),
  'contraseñas distintas → error'
)
await win.fill('input[placeholder="Repetir la contraseña"]', 'clave-de-prueba-1')
await win.click('text=Crear diario')
await win.waitForSelector('.bloqueo-codigo', { timeout: 20000 })
const codigo = (await win.locator('.bloqueo-codigo').textContent()).trim()
ok(/^([0-9A-Z]{4}-){5}[0-9A-Z]{4}$/.test(codigo), 'muestra el código de recuperación')
ok(await win.locator('text=Continuar').isDisabled(), 'Continuar bloqueado hasta marcar "Lo anoté"')
await win.check('.bloqueo-check input')
await win.click('text=Continuar')
await win.waitForSelector('.cal-grilla')
ok(true, 'entra al calendario')
ok(
  fs.existsSync(path.join(datos, 'vault.json')) && fs.existsSync(path.join(datos, 'diario.db')),
  'vault.json y diario.db creados'
)

// 2) escribir una entrada nueva con +
await win.click('.barra-boton[title^="Nueva entrada"]')
await win.waitForSelector('.ed-cuerpo')
// El título se TECLEA (no se pega): así se detectó que el foco saltaba al cuerpo en cada letra
await win.click('.ed-titulo')
await win.keyboard.type('Mi primera entrada SECRETA', { delay: 15 })
ok(
  (await win.inputValue('.ed-titulo')) === 'Mi primera entrada SECRETA',
  'el título se escribe completo tecleando'
)
await win.click('.ed-cuerpo')
await win.keyboard.type('Hoy escuché una canción PINGÜINO muy linda.')
await espera(1500)
ok((await win.locator('.ed-estado').textContent()) === 'Guardado', 'autoguardado')
// etiqueta
await win.click('text=Agregar etiquetas')
await win.keyboard.type('música', { delay: 15 })
await win.keyboard.press('Enter')
await espera(500)
ok(
  (await win.locator('.ed-etiquetas .chip', { hasText: 'música' }).count()) === 1,
  'etiqueta asignada'
)
// persona
await win.click('text=Agregar personas')
await win.keyboard.type('Lucía', { delay: 15 })
await win.keyboard.press('Enter')
await espera(500)
ok((await win.locator('.ed-persona .chip', { hasText: 'Lucía' }).count()) === 1, 'persona asignada')
await espera(1300)
// cerrar de golpe: escribir y salir enseguida a otra vista (el guardado pendiente se fuerza)
await win.click('.ed-cuerpo')
await win.keyboard.type(' Último texto.')
await win.click('.lateral-item:has-text("Línea de tiempo")')
await win.waitForSelector('.tarjeta')
const tarjeta = await win.locator('.tarjeta').first().textContent()
ok(
  tarjeta.includes('Mi primera entrada SECRETA') &&
    tarjeta.includes('Último texto.') &&
    tarjeta.includes('música') &&
    tarjeta.includes('Lucía'),
  'timeline muestra la entrada completa (con lo escrito justo antes de salir)'
)
await win.screenshot({ path: 'docs/validacion/e2e-timeline.png' })

// 3) archivos ilegibles
await espera(300)
const db = fs.readFileSync(path.join(datos, 'diario.db'))
const wal = fs.existsSync(path.join(datos, 'diario.db-wal'))
  ? fs.readFileSync(path.join(datos, 'diario.db-wal'))
  : Buffer.alloc(0)
const vault = fs.readFileSync(path.join(datos, 'vault.json'), 'utf8')
ok(
  ![db, wal].some(
    (b) =>
      b.includes('SECRETA') ||
      b.includes('PING') ||
      b.includes('canci') ||
      b.includes('CREATE TABLE')
  ),
  'diario.db (y su -wal) sin texto legible'
)
ok(!vault.includes('clave-de-prueba'), 'vault.json sin la contraseña')

// 4) bloquear con Ctrl+L y desbloquear
await win.keyboard.press('Control+l')
await win.waitForSelector('text=Desbloquear diario')
ok(
  (await win.locator('.tarjeta').count()) === 0,
  'Ctrl+L bloquea y borra lo descifrado de la pantalla'
)
await win.fill('input[placeholder="Contraseña"]', 'mala')
await win.click('text=Desbloquear diario')
await win.waitForSelector('.bloqueo-error:has-text("incorrecta")')
ok(true, 'contraseña mala rechazada')
await win.fill('input[placeholder="Contraseña"]', 'clave-de-prueba-1')
await win.click('text=Desbloquear diario')
await win.waitForSelector('.tarjeta')
ok(true, 'contraseña buena abre (vuelve a la última vista)')
await win.click('.lateral-item:has-text("Calendario")')
await win.waitForSelector('.cal-grilla')
ok(
  (await win.locator('.cal-dia.con-entrada').count()) >= 1,
  'el calendario marca el día con entrada'
)
await win.screenshot({ path: 'docs/validacion/e2e-calendario.png' })

// 5) escribir y cerrar la app ENSEGUIDA (antes de los 800 ms del autoguardado): no se pierde
await win.click('.tarjeta-num, .cal-dia.con-entrada')
await win.waitForSelector('.ed-cuerpo')
await win.click('.ed-cuerpo')
await win.keyboard.press('End')
await win.keyboard.type(' Escrito justo antes de cerrar.')
await app.close()
;({ app, win } = await abrir())
win.on('pageerror', (e) => errores.push(e.message))
await win.waitForSelector('text=Desbloquear diario')
ok(true, 'al reabrir pide la contraseña')
await win.click('text=¿Olvidaste tu contraseña?')
await win.fill('input[placeholder^="Código de recuperación"]', codigo.toLowerCase())
await win.fill('input[placeholder="Contraseña nueva"]', 'clave-nueva-2')
await win.fill('input[placeholder="Repetir la contraseña"]', 'clave-nueva-2')
await win.click('text=Entrar y cambiar la contraseña')
await win.waitForSelector('.principal .barra', { timeout: 20000 })
ok(true, 'el código de recuperación entra y cambia la contraseña')
await win.keyboard.press('Control+l')
await win.waitForSelector('text=Desbloquear diario')
await win.fill('input[placeholder="Contraseña"]', 'clave-de-prueba-1')
await win.click('text=Desbloquear diario')
await win.waitForSelector('.bloqueo-error:has-text("incorrecta")')
ok(true, 'la contraseña vieja ya no sirve')
await win.fill('input[placeholder="Contraseña"]', 'clave-nueva-2')
await win.click('text=Desbloquear diario')
await win.waitForSelector('.principal .barra')
ok(true, 'la nueva sí')

await win.click('.lateral-item:has-text("Línea de tiempo")')
await win.waitForSelector('.tarjeta')
ok(
  (await win.locator('.tarjeta').first().textContent()).includes('Escrito justo antes de cerrar.'),
  'lo escrito justo antes de cerrar la app se guardó'
)

// 6) eliminar la entrada
await win.click('.tarjeta')
await win.waitForSelector('.ed-cuerpo')
await win.click('.barra-boton[title="Más opciones"]')
await win.click('text=Eliminar entrada')
await win.click('.dlg-botones button.peligro') // pregunta dentro de la página
await win.waitForSelector('text=Todavía no hay entradas')
ok(true, 'eliminar entrada')

console.log('errores JS:', errores.length ? errores : 'ninguno')
await app.close()
