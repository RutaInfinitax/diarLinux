// Botón Atrás, navegación del calendario por meses y selector de año/mes, y los deslizadores de
// fondo y texto de Apariencia. Uso: node scripts/e2e-navegacion.mjs <tmp>
import { _electron as electron } from 'playwright-core'
import path from 'node:path'

const datos = path.join(process.argv[2], 'diario')
let fallas = 0
const ok = (c, m) => {
  if (!c) fallas++
  console.log((c ? 'OK   ' : 'FALLA') + ' ' + m)
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const errores = []
const app = await electron.launch({
  args: ['.'],
  env: { ...process.env, DIARLINUX_DATA: datos, DIARLINUX_OCULTA: '1' }
})
const win = await app.firstWindow()
win.on('pageerror', (e) => errores.push(e.message))
await app.evaluate(({ BrowserWindow }) =>
  BrowserWindow.getAllWindows()[0].setContentSize(1100, 720)
)
await win.waitForSelector('text=Crea tu diario')
await win.fill('input[placeholder="Contraseña"]', 'clave-nav')
await win.fill('input[placeholder="Repetir la contraseña"]', 'clave-nav')
await win.click('text=Crear diario')
await win.waitForSelector('.bloqueo-codigo', { timeout: 20000 })
await win.check('.bloqueo-check input')
await win.click('text=Continuar')
await win.waitForSelector('.cal-grilla')

// ── Atrás ──
const atras = win.locator('.lateral-atras')
ok(await atras.isDisabled(), 'Atrás apagado al empezar')
await win.evaluate(() =>
  window.diario.entradas.guardar({ fecha: '2025-05-20', titulo: 'Entrada VIEJA', html: '<p>x</p>' })
)
await win.click('.lateral-item:has-text("Línea de tiempo")')
await win.click('.lateral-item:has-text("Buscar")')
await atras.click()
await espera(200)
ok(
  (await win.locator('.lateral-item.sel').textContent()) === 'Línea de tiempo',
  'Atrás → Línea de tiempo'
)
await win.click('.tarjeta:has-text("Entrada VIEJA")')
await win.waitForSelector('.ed-cuerpo')
await win.click('.lateral-item:has-text("Etiquetas")')
await atras.click()
await win.waitForSelector('.ed-titulo')
await espera(300)
ok(
  (await win.inputValue('.ed-titulo')) === 'Entrada VIEJA',
  'Atrás → vuelve a la entrada que estaba abierta'
)
await win.keyboard.press('Alt+ArrowLeft')
await espera(300)
ok(
  (await win.locator('.lateral-item.sel').textContent()) === 'Línea de tiempo',
  'Alt+← también vuelve'
)
await atras.click()
await espera(200)
ok(
  (await win.locator('.lateral-item.sel').textContent()) === 'Calendario',
  'y otra vez → Calendario'
)
ok(await atras.isDisabled(), 'sin más historial, Atrás se apaga')

// ── clic derecho en la línea de tiempo: eliminar ──
await win.evaluate(() =>
  window.diario.entradas.guardar({ fecha: '2025-06-01', titulo: 'Para BORRAR', html: '<p>b</p>' })
)
await win.click('.lateral-item:has-text("Línea de tiempo")')
await win.waitForSelector('.tarjeta:has-text("Para BORRAR")')
await win.click('.tarjeta:has-text("Para BORRAR")', { button: 'right' })
await win.waitForSelector('.menu-entrada')
ok(true, 'clic derecho en una tarjeta abre el menú')
await win.click('.menu-entrada button.peligro')
await win.click('.dlg-botones button.peligro') // pregunta dentro de la página
await espera(600)
ok(
  (await win.locator('.tarjeta:has-text("Para BORRAR")').count()) === 0,
  'Eliminar la saca de la línea de tiempo'
)
ok(
  !(await win.evaluate(() => window.diario.entradas.listar())).some(
    (e) => e.titulo === 'Para BORRAR'
  ),
  '…y del diario'
)
await win.click('.tarjeta:has-text("Entrada VIEJA")', { button: 'right' })
await win.click('.menu-entrada button.peligro')
await win.click('.dlg-botones button:has-text("Cancelar")')
await espera(400)
ok(
  (await win.locator('.tarjeta:has-text("Entrada VIEJA")').count()) === 1,
  'si se cancela, no borra nada'
)
await win.click('.lateral-item:has-text("Calendario")')

// ── Calendario: meses y selector ──
const titulo = () => win.textContent('.cal-nav-fecha')
const hoy = new Date()
const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre'
]
ok(
  (await titulo()).toLowerCase() === `${MESES[hoy.getMonth()]} ${hoy.getFullYear()}`.toLowerCase(),
  'muestra el mes y año actuales: ' + (await titulo())
)
await win.click('.cal-nav button[title="Mes siguiente"]')
await espera(200)
const sig = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1)
ok(
  (await titulo()).toLowerCase() === `${MESES[sig.getMonth()]} ${sig.getFullYear()}`.toLowerCase(),
  'mes siguiente: ' + (await titulo())
)
await win.click('.cal-nav button[title="Mes anterior"]')
await win.click('.cal-nav button[title="Mes anterior"]')
await espera(200)
const ant = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)
ok(
  (await titulo()).toLowerCase() === `${MESES[ant.getMonth()]} ${ant.getFullYear()}`.toLowerCase(),
  'mes anterior: ' + (await titulo())
)
await win.click('.cal-nav button[title="Año anterior"]')
await espera(200)
ok(
  (await titulo()).toLowerCase() ===
    `${MESES[ant.getMonth()]} ${ant.getFullYear() - 1}`.toLowerCase(),
  'año anterior: ' + (await titulo())
)

await win.click('.cal-nav-fecha')
await win.waitForSelector('.cal-selector')
await win.click('.cal-selector-cab button[title="Años anteriores"]')
ok(
  (await win.locator('.cal-selector-grilla button').first().textContent()) === '2004',
  'flecha: 12 años antes'
)
await win.click('.cal-selector-cab button[title="Años siguientes"]')
await win.click('.cal-selector-grilla button:has-text("2016")')
await win.screenshot({ path: 'docs/validacion/calendario-selector.png' })
await win.click('.cal-selector-grilla button:has-text("mar")')
await espera(400)
ok(
  (await titulo()).toLowerCase() === 'marzo 2016',
  'selector: año 2016 y mes marzo → ' + (await titulo())
)
const arriba = await win.evaluate(() => {
  const c = document.querySelector('.cal-scroll')
  const s = [...c.querySelectorAll('[data-i]')].find((x) => x.offsetTop >= c.scrollTop - 1)
  return s?.textContent?.slice(0, 20)
})
ok(/marzo 2016/i.test(arriba ?? ''), 'el calendario quedó en marzo de 2016: ' + arriba)
// meses con entradas marcados
await win.click('.cal-nav-fecha')
await win.click('.cal-selector-grilla button:has-text("2025")')
await espera(300)
const marcados = (await win.locator('.cal-selector-grilla button.con').allTextContents()).join()
ok(marcados.toLowerCase() === 'may', 'en 2025 está marcado mayo (tiene una entrada): ' + marcados)
await win.keyboard.press('Escape')
ok((await win.locator('.cal-selector').count()) === 0, 'Esc cierra el selector')
await win.click('.cal-nav-fecha')
await win.click('.cal-selector-hoy')
await espera(300)
ok(
  (await titulo()).toLowerCase() === `${MESES[hoy.getMonth()]} ${hoy.getFullYear()}`.toLowerCase(),
  '"Ir a hoy"'
)

// ── botón Hoy al lado del deslizador ──
await win.click('.cal-nav button[title="Año anterior"]')
await espera(200)
await win.click('.cal-hoy')
await espera(300)
ok(
  (await titulo()).toLowerCase() === `${MESES[hoy.getMonth()]} ${hoy.getFullYear()}`.toLowerCase(),
  'botón Hoy (al lado del tamaño) vuelve al mes actual'
)

// ── tamaño del calendario ──
const grilla = () =>
  win.evaluate(() => {
    const c = document.querySelector('.cal-scroll')
    const s = [...c.querySelectorAll('[data-i]')].find((x) => x.offsetTop >= c.scrollTop - 1)
    const g = document.querySelector('.cal-grilla')
    return {
      ancho: g.getBoundingClientRect().width,
      mes: s?.querySelector('.encabezado-mes')?.textContent
    }
  })
const g0 = await grilla()
await win.locator('.cal-tam input').fill('520')
await espera(300)
const g1 = await grilla()
ok(
  Math.round(g1.ancho) <= 520 && g0.ancho > 800,
  `tamaño del calendario: ${Math.round(g0.ancho)} → ${Math.round(g1.ancho)} px`
)
ok(g1.mes === g0.mes, 'al achicarlo sigue en el mismo mes: ' + g1.mes)
await win.screenshot({ path: 'docs/validacion/calendario-chico.png' })
await win.locator('.cal-tam input').dblclick()
await espera(300)
ok(
  Math.round((await grilla()).ancho) === Math.round(g0.ancho),
  'doble clic: vuelve a todo el ancho'
)

// ── Apariencia: luz, calidez y texto ──
const fondo = () =>
  win.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--fondo').trim())
const lum = (h) => {
  const c = [1, 3, 5]
    .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((s) => (s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const antes = await fondo()
await win.click('.lateral-item:has-text("Configuración")')
await win.click('.aj-pestanas button:has-text("Apariencia")')
await win.locator('#aj-fondoLuz').fill('70')
await espera(500)
const claro = await fondo()
ok(lum(claro) > lum(antes || '#2b2b2b'), `luz del fondo: ${antes || '#2b2b2b'} → ${claro}`)
await win.locator('#aj-fondoCalidez').fill('100')
await win.locator('#aj-textoSuave').fill('60')
await espera(500)
const aj = await win.evaluate(() => window.diario.ajustes.obtener())
ok(aj.fondoLuz === 70 && aj.fondoCalidez === 100 && aj.textoSuave === 60, 'los tres se guardan')
await win.locator('.aj-ventana .aj-cuerpo').evaluate((e) => (e.scrollTop = e.scrollHeight))
await win.screenshot({ path: 'docs/validacion/apariencia-fondo.png' })
await win.click('button:has-text("Como el skin")')
await espera(500)
const aj2 = await win.evaluate(() => window.diario.ajustes.obtener())
ok(
  aj2.fondoLuz === 0 && aj2.fondoCalidez === 0 && aj2.textoSuave === 0,
  '"Como el skin" vuelve todo a cero'
)

// ── Atrás vuelve al mes del calendario que se estaba mirando ──
await win.click('.aj-cerrar')
await win.evaluate(async () => {
  const e = await window.diario.entradas.guardar({
    fecha: '2024-07-01',
    titulo: 'Primero de JULIO',
    html: '<p>j</p>'
  })
  const t = await window.diario.etiquetas.crear('viaje')
  await window.diario.etiquetas.asignar(e.id, [t.id])
})
await win.click('.lateral-item:has-text("Línea de tiempo")')
await win.click('.lateral-item:has-text("Calendario")')
await win.click('.cal-nav-fecha')
await win.click('.cal-selector-grilla button:has-text("2024")')
await win.click('.cal-selector-grilla button:has-text("jul")')
await espera(400)
await win.click('[data-fecha="2024-07-01"]')
await win.waitForSelector('.ed-titulo')
await espera(300)
ok(
  (await win.inputValue('.ed-titulo')) === 'Primero de JULIO',
  'abre la entrada del 1 de julio de 2024'
)
await win.locator('.lateral-atras').click()
await win.waitForSelector('.cal-nav-fecha')
await espera(400)
ok(
  (await titulo()).toLowerCase() === 'julio 2024',
  'Atrás vuelve a julio 2024 (no al mes actual): ' + (await titulo())
)

// ── color de una etiqueta desde la entrada ──
await win.click('[data-fecha="2024-07-01"]')
await win.waitForSelector('.ed-pie .ed-chip')
await win.click('.ed-pie .ed-chip:has-text("viaje")')
await win.waitForSelector('.ed-chip-color')
await win.screenshot({ path: 'docs/validacion/color-desde-entrada.png' })
await win.click('.ed-chip-color .paleta-muestra[title="Amarillo"]')
await espera(400)
const color = (await win.evaluate(() => window.diario.etiquetas.listar())).find(
  (t) => t.nombre === 'viaje'
)?.color
ok(
  color === '#fbc02d',
  'el color elegido en la entrada queda en la etiqueta (para todas): ' + color
)
const letra = await win.evaluate(
  () => getComputedStyle(document.querySelector('.ed-pie .ed-chip')).color
)
ok(letra === 'rgb(29, 29, 31)', 'sobre un color claro el texto del chip es oscuro: ' + letra)
await win.keyboard.press('Escape')

// ── letra y ancho de las listas ──
await win.click('.lateral-item:has-text("Línea de tiempo")')
await win.waitForSelector('.tarjeta')
const medir = () =>
  win.evaluate(() => {
    const t = document.querySelector('.contenido .tarjeta')
    return { zoom: getComputedStyle(t).zoom, ancho: t.getBoundingClientRect().width }
  })
const m0 = await medir()
await win.locator('.lateral-listas input').first().fill('1.4')
await win.locator('.lateral-listas input').nth(1).fill('700')
await espera(300)
const m1 = await medir()
ok(
  m1.zoom === '1.4' && Math.round(m1.ancho) <= 702 && m0.ancho > 760,
  `listas: letra ${m0.zoom}→${m1.zoom}, ancho ${Math.round(m0.ancho)}→${Math.round(m1.ancho)} px`
)
await win.screenshot({ path: 'docs/validacion/listas-grandes.png' })

ok(
  errores.length === 0,
  'sin errores en la página' + (errores.length ? ': ' + errores.join(' | ') : '')
)
await app.evaluate(({ app }) => app.quit())
await app.close().catch(() => {})
console.log(fallas ? `\n${fallas} FALLAS` : '\nTODO OK')
process.exit(fallas ? 1 : 0)
