// Extras: Esc vuelve después de Ctrl+F, Configuración de tamaño fijo y
// contador de palabras con objetivo. Uso: node scripts/e2e-extras.mjs <tmp>
import { _electron as electron } from 'playwright-core'
import path from 'node:path'

const datos = path.join(process.argv[2], 'diario')
const ok = (c, m) => console.log((c ? 'OK   ' : 'FALLA') + ' ' + m)
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const errores = []

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
await win.fill('input[placeholder="Contraseña"]', 'clave-extras')
await win.fill('input[placeholder="Repetir la contraseña"]', 'clave-extras')
await win.click('text=Crear diario')
await win.waitForSelector('.bloqueo-codigo', { timeout: 20000 })
await win.check('.bloqueo-check input')
await win.click('text=Continuar')
await win.waitForSelector('.cal-grilla')

// ── Configuración: mismo tamaño en todas las pestañas ──
await win.click('.lateral-item:has-text("Configuración")')
const altos = []
for (const p of ['General', 'Seguridad', 'Diario', 'Notificaciones', 'Clima', 'Acerca de']) {
  await win.click(`.aj-pestanas button:has-text("${p}")`)
  await espera(150)
  altos.push(await win.$eval('.aj-ventana', (e) => Math.round(e.getBoundingClientRect().height)))
}
ok(
  new Set(altos).size === 1,
  'Configuración no cambia de tamaño entre pestañas: ' + altos.join(', ')
)

// ── Contador de palabras: activarlo con objetivo 10 ──
await win.click('.aj-pestanas button:has-text("General")')
await win.click('.aj-casilla:has-text("Contador de palabras") input')
await win.waitForSelector('.aj-numero')
await win.fill('.aj-numero', '10')
await espera(300)
await win.click('.aj-cerrar')
await win.click('.barra-boton[title^="Nueva entrada"]')
await win.waitForSelector('.ed-cuerpo')
await win.click('.ed-titulo')
await win.keyboard.type('Mi entrada')
await win.click('.ed-cuerpo')
await win.keyboard.type('Hoy fui al río con Martín.')
await espera(300)
ok(
  (await win.textContent('.ed-contador')) === '6 / 10',
  'contador con objetivo: ' + (await win.textContent('.ed-contador'))
)
ok((await win.locator('.ed-contador.logrado').count()) === 0, 'todavía no llegó al objetivo')
await win.keyboard.type(' Comimos helado de dulce de leche.')
await espera(300)
ok(
  (await win.locator('.ed-contador.logrado').count()) === 1 &&
    (await win.textContent('.ed-contador')).startsWith('12 / 10'),
  'al llegar al objetivo se marca (verde apagado, con ✓)'
)
await win.screenshot({ path: 'docs/validacion/editor-contador.png' })
// sin objetivo: solo cuenta; apagado: no aparece
await win.evaluate(() => window.diario.ajustes.guardar({ objetivoPalabras: 0 }))
await win.click('.lateral-item:has-text("Configuración")')
await win.click('.aj-cerrar')
await espera(300)
ok(
  (await win.textContent('.ed-contador')) === '12 palabras',
  'sin objetivo: solo el número de palabras'
)
const tamNumero = await win.$eval('.ed-contador-num', (e) =>
  parseFloat(getComputedStyle(e).fontSize)
)
ok(tamNumero >= 24, `el número del contador es grande (se lee de lejos): ${tamNumero}px`)
ok(
  await win.evaluate(() => {
    const pie = document.querySelector('.ed-pie').getBoundingClientRect()
    const c = document.querySelector('.ed-contador').getBoundingClientRect()
    return c.top >= pie.top && c.bottom <= pie.bottom
  }),
  'el contador grande queda dentro del pie (no tapa el texto)'
)
await win.screenshot({ path: 'docs/validacion/editor-contador-grande.png' })

// ── Tamaño del texto de las entradas: hasta 34 px ──
await win.click('.lateral-item:has-text("Configuración")')
await win.click('.aj-pestanas button:has-text("Apariencia")')
await win.locator('select:has(option[value="34"])').selectOption('34')
await espera(300)
await win.click('.aj-cerrar')
await espera(300)
ok(
  (await win.$eval('.ed-cuerpo', (e) => getComputedStyle(e).fontSize)) === '34px',
  'el texto de la entrada se puede poner en 34 px'
)
await win.screenshot({ path: 'docs/validacion/editor-texto-34.png' })
await win.evaluate(() => window.diario.ajustes.guardar({ tamTexto: 15.5 }))

await win.evaluate(() => window.diario.ajustes.guardar({ contadorPalabras: false }))
await win.click('.lateral-item:has-text("Configuración")')
await win.click('.aj-cerrar')
await espera(300)
ok((await win.locator('.ed-contador').count()) === 0, 'desactivado: no aparece')

// ── Ctrl+F desde una entrada y Esc vuelve a ESA entrada ──
await espera(1000) // autoguardado
await win.keyboard.press('Control+f')
await win.waitForSelector('.bus-campo input')
await win.keyboard.type('helado')
await win.waitForSelector('.bus-lista .tarjeta')
await win.keyboard.press('Escape')
await win.waitForSelector('.ed-cuerpo')
ok(
  (await win.inputValue('.ed-titulo')) === 'Mi entrada' &&
    (await win.textContent('.ed-cuerpo')).includes('helado'),
  'Esc después de Ctrl+F vuelve a la entrada donde estabas'
)

// ── Ctrl+F desde Etiquetas (pestaña Personas) y Esc vuelve ──
await win.click('.lateral-item:has-text("Etiquetas")')
await win.click('.eti-pestanas button:has-text("Personas")')
await win.keyboard.press('Control+f')
await win.waitForSelector('.bus-campo input')
await win.keyboard.press('Escape')
await win.waitForSelector('.eti-pestanas')
ok(
  (await win.textContent('.eti-pestanas button.sel')) === 'Personas',
  'Esc vuelve a Etiquetas, en la misma pestaña'
)

// ── Entrando a Buscar desde la barra lateral, Esc solo borra el texto ──
await win.click('.lateral-item:has-text("Buscar")')
await win.fill('.bus-campo input', 'algo')
await win.press('.bus-campo input', 'Escape')
await espera(200)
ok(
  (await win.locator('.bus-campo input').count()) === 1 &&
    (await win.inputValue('.bus-campo input')) === '',
  'desde la barra lateral, Esc borra el texto y se queda en Buscar'
)

// Configuración abierta encima de Buscar (tras Ctrl+F): Esc cierra solo Configuración
await win.click('.lateral-item:has-text("Calendario")')
await win.keyboard.press('Control+f')
await win.waitForSelector('.bus-campo input')
await win.click('.lateral-item:has-text("Configuración")')
await win.waitForSelector('.aj-ventana')
await win.keyboard.press('Escape')
await espera(200)
ok(
  (await win.locator('.aj-ventana').count()) === 0 &&
    (await win.locator('.bus-campo').count()) === 1,
  'con Configuración abierta, Esc solo la cierra'
)
await win.keyboard.press('Escape')
await win.waitForSelector('.cal-grilla')
ok(true, 'y otro Esc vuelve al Calendario')

await app.close()
console.log('errores JS:', errores.length ? errores : 'ninguno')
