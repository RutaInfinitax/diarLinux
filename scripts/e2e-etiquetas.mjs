// Prueba de la vista Etiquetas/Personas (Fase 2C) con la ventana oculta. Uso: node scripts/e2e-etiquetas.mjs <tmp>
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
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(900, 650))

await win.waitForSelector('text=Crea tu diario')
await win.fill('input[placeholder="Contraseña"]', 'clave-etiq-1')
await win.fill('input[placeholder="Repetir la contraseña"]', 'clave-etiq-1')
await win.click('text=Crear diario')
await win.waitForSelector('.bloqueo-codigo', { timeout: 20000 })
await win.check('.bloqueo-check input')
await win.click('text=Continuar')
await win.waitForSelector('.cal-grilla')

// Datos: 3 entradas con etiquetas y personas (por la API del preload, como haría el editor)
await win.evaluate(async () => {
  const d = window.diario
  const [mu, mu2, vi] = await Promise.all(
    ['música', 'musica', 'viajes'].map((n) => d.etiquetas.crear(n))
  )
  const [lu, ma] = await Promise.all(['Lucía', 'Martín'].map((n) => d.personas.crear(n)))
  const e = []
  for (const f of ['2026-01-10', '2026-02-10', '2026-03-10'])
    e.push((await d.entradas.guardar({ fecha: f, titulo: 'Entrada ' + f, html: '<p>hola</p>' })).id)
  await d.etiquetas.asignar(e[0], [mu.id, vi.id])
  await d.etiquetas.asignar(e[1], [mu.id])
  await d.etiquetas.asignar(e[2], [mu2.id])
  await d.personas.asignar(e[0], [lu.id, ma.id])
  await d.personas.asignar(e[1], [lu.id])
})

const filas = () =>
  win.$$eval('.eti-fila', (l) =>
    l.map((f) => [
      f.querySelector('.eti-nombre').textContent,
      f.querySelector('.eti-cant').textContent
    ])
  )
const fila = (n) =>
  win.locator('.eti-fila', { has: win.locator('.eti-nombre', { hasText: new RegExp(`^${n}$`) }) })
const menu = async (n, opcion) => {
  await fila(n).click({ button: 'right' })
  await win.click(`.eti-menu button:has-text("${opcion}")`)
}

await win.click('.lateral-item:has-text("Etiquetas")')
await win.waitForSelector('.eti-fila')
let f = await filas()
ok(
  f.length === 3 && f.find((x) => x[0] === 'música')[1] === '2',
  'lista de etiquetas con su conteo: ' + JSON.stringify(f)
)
const fondo = await win.$eval('.eti-cant', (e) => getComputedStyle(e).backgroundColor)
ok(fondo === 'rgb(59, 91, 130)', 'insignia con el azul apagado (no el acento brillante): ' + fondo)

await win.click('.eti-orden > button')
await win.click('text=Por cantidad')
f = await filas()
ok(f[0][0] === 'música', 'ordenar por cantidad pone primero la más usada')

// Clic → entradas de esa etiqueta, y volver
await fila('música').click()
await win.waitForSelector('.eti-entradas .tarjeta')
ok((await win.locator('.eti-entradas .tarjeta').count()) === 2, 'clic muestra sus 2 entradas')
await win.click('.eti-volver')
await win.waitForSelector('.eti-fila')

// Color
await menu('viajes', 'Cambiar color')
const anchos = await win.$$eval('.eti-colores .paleta-muestra', (l) =>
  l.map((b) => Math.round(b.getBoundingClientRect().width))
)
ok(
  anchos.length === 24 && anchos.every((a) => a === 30),
  'el menú de color muestra las 24 muestras redondas: ' + anchos.length
)
await win.screenshot({ path: 'docs/validacion/etiquetas-colores.png' })
await win.click('.paleta-muestra[title="Verde suave"]')
await espera(300)
ok(
  (await fila('viajes')
    .locator('.eti-cant')
    .evaluate((e) => getComputedStyle(e).backgroundColor)) === 'rgb(74, 107, 79)',
  'cambiar color: la insignia toma el verde elegido'
)

// Renombrar (y no dejar repetir un nombre)
await menu('viajes', 'Renombrar')
await win.fill('.eti-renombrar', 'Viajes 2026')
await win.keyboard.press('Enter')
await espera(300)
ok((await fila('Viajes 2026').count()) === 1, 'renombrar')
await menu('Viajes 2026', 'Renombrar')
await win.fill('.eti-renombrar', 'MÚSICA')
await win.keyboard.press('Enter')
await win.waitForSelector('.eti-error')
ok(
  (await win.textContent('.eti-error')).startsWith('Ya existe'),
  'no deja usar un nombre que ya existe (aunque cambien mayúsculas con tilde)'
)

// Fusionar "musica" en "música"
await menu('musica', 'Fusionar')
await win.click('.eti-modal-lista button:has-text("música")')
await win.click('.eti-modal-botones .primario')
await espera(400)
f = await filas()
ok(
  f.length === 2 && f.find((x) => x[0] === 'música')[1] === '3',
  'fusionar: queda una sola con 3 entradas ' + JSON.stringify(f)
)

// La línea de tiempo muestra el color propio en el chip
await win.click('.lateral-item:has-text("Línea de tiempo")')
await win.waitForSelector('.tarjeta')
const chipVerde = await win.$$eval('.tarjeta .chip', (l) =>
  l
    .filter((c) => c.textContent.includes('Viajes 2026'))
    .map((c) => getComputedStyle(c).backgroundColor)
)
ok(chipVerde[0] === 'rgb(74, 107, 79)', 'el chip de la línea de tiempo usa el color elegido')

// Personas: conteo y eliminar (las entradas quedan)
await win.click('.lateral-item:has-text("Etiquetas")')
await win.waitForSelector('.eti-fila')
await win.click('.eti-pestanas button:has-text("Personas")')
await win.waitForSelector('.eti-fila:has-text("Lucía")')
f = await filas()
ok(
  JSON.stringify(f) ===
    JSON.stringify([
      ['Lucía', '2'],
      ['Martín', '1']
    ]),
  'pestaña Personas con conteos ' + JSON.stringify(f)
)
await win.screenshot({ path: 'docs/validacion/etiquetas.png' })
await menu('Martín', 'Eliminar')
await win.click('.dlg-botones button.peligro') // pregunta dentro de la página
await espera(400)
f = await filas()
ok(f.length === 1, 'eliminar persona')
ok(
  (await win.evaluate(() => window.diario.entradas.listar())).length === 3,
  'las entradas no se borran'
)

// El + de la barra crea una persona (en la pestaña Personas) con su color
await win.click('.barra-boton')
await win.fill('.eti-nueva .eti-renombrar', 'Sofía')
await win.click('.eti-nueva .paleta-muestra[title="Rosa suave"]')
await win.keyboard.press('Enter')
await win.waitForSelector('.eti-fila:has-text("Sofía")')
ok(
  (await fila('Sofía')
    .locator('.eti-cant')
    .evaluate((e) => getComputedStyle(e).backgroundColor)) === 'rgb(122, 74, 98)' &&
    (await win.locator('.ed-cuerpo').count()) === 0,
  'el + crea una persona con el color elegido (no abre una entrada)'
)
await win.click('.barra-boton')
await win.fill('.eti-nueva .eti-renombrar', 'SOFÍA')
await win.keyboard.press('Enter')
await win.waitForSelector('.eti-error')
ok((await win.textContent('.eti-error')).startsWith('Ya existe'), 'el + no deja repetir un nombre')
await win.keyboard.press('Escape')
await win.click('.eti-pestanas button:has-text("Etiquetas")')
await win.click('.barra-boton')
await win.fill('.eti-nueva .eti-renombrar', 'trabajo')
await win.click('.eti-nueva .eti-crear')
await win.waitForSelector('.eti-fila:has-text("trabajo")')
ok(
  (await fila('trabajo').locator('.eti-cant').textContent()) === '0',
  'en la pestaña Etiquetas el + crea una etiqueta'
)

// En el editor: las existentes se ven al tocar "Agregar etiquetas" y se agregan con un clic
await win.click('.lateral-item:has-text("Línea de tiempo")')
await win.locator('.tarjeta', { hasText: 'Entrada 2026-03-10' }).click()
await win.waitForSelector('.ed-cuerpo')
await win.click('text=Agregar etiquetas')
await win.waitForSelector('.ed-panel-lista .chip')
const ofrecidas = await win.$$eval('.ed-panel-lista .chip', (l) => l.map((c) => c.textContent))
ok(
  ofrecidas.includes('trabajo') &&
    ofrecidas.includes('Viajes 2026') &&
    !ofrecidas.includes('música'),
  'el panel muestra las etiquetas existentes (sin las ya puestas) ' + JSON.stringify(ofrecidas)
)
await win.click('.ed-panel-lista .chip:has-text("trabajo")')
await espera(400)
ok(
  (await win.locator('.ed-etiqueta .chip', { hasText: 'trabajo' }).count()) === 1,
  'un clic agrega una etiqueta existente'
)
// Nueva con color desde la entrada
await win.keyboard.type('cumpleaños', { delay: 10 })
await win.click('.ed-panel .paleta-muestra[title="Ámbar suave"]')
await win.keyboard.press('Enter')
await espera(500)
ok(
  (await win
    .locator('.ed-etiqueta .chip', { hasText: 'cumpleaños' })
    .evaluate((e) => getComputedStyle(e).backgroundColor)) === 'rgb(122, 106, 58)',
  'crear una etiqueta nueva desde la entrada con el color elegido'
)
await win.keyboard.press('Escape')
await win.click('text=Agregar personas')
await win.waitForSelector('.ed-panel-lista .chip')
await win.click('.ed-panel-lista .chip:has-text("Sofía")')
await espera(400)
ok(
  (await win.locator('.ed-persona .chip', { hasText: 'Sofía' }).count()) === 1,
  'un clic agrega una persona existente'
)
await win.screenshot({ path: 'docs/validacion/editor-etiquetas.png' })
await win.keyboard.press('Escape')
await win.click('.lateral-item:has-text("Etiquetas")')
await win.click('.eti-pestanas button:has-text("Personas")')
await win.waitForSelector('.eti-fila')

// Volver desde una entrada abierta deja la misma pestaña y la misma lista de entradas
await fila('Lucía').click()
await win.waitForSelector('.eti-entradas .tarjeta')
await win.locator('.eti-entradas .tarjeta').first().click()
await win.waitForSelector('.ed-cuerpo')
ok(
  (await win.locator('.ed-persona .chip', { hasText: 'Lucía' }).count()) === 1,
  'la entrada abierta muestra a Lucía'
)
await win.click('.lateral-item:has-text("Etiquetas")')
await win.waitForSelector('.eti-entradas .tarjeta')
ok(
  (await win.textContent('.eti-pestanas button.sel')) === 'Personas' &&
    (await win.textContent('.eti-detalle .chip')) === 'Lucía',
  'al volver sigue en Personas, en la lista de Lucía'
)

await app.close()
console.log('errores JS:', errores.length ? errores : 'ninguno')
