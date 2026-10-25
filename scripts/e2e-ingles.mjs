// Recorre la app EN INGLÉS buscando textos que hayan quedado en español, y prueba cambiar el idioma
// desde Configuración. Uso: node scripts/e2e-ingles.mjs <tmp>
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

// Palabras que delatan español (las que tienen tilde/ñ/¿¡ se detectan aparte)
const ES = new Set(
  (
    'de la el los las que para con una del por sin más entrada entradas etiqueta etiquetas persona personas ' +
    'guardar cancelar eliminar quitar agregar buscar diario fecha hoy ayer clima fotos archivos ' +
    'abrir cerrar cambiar elegir nueva nuevo todo todas todos listo hacer copia carpeta contraseña ' +
    'mostrar ninguna ninguno cada semana mes año años días horas este esta estos desde hasta tamaño'
  ).split(' ')
)
// Lo que es correcto aunque parezca español
const PERMITIDO = [
  /^\//,
  /^Español$/,
  /diarLinux/,
  /^es$/,
  /Rosé Pine/,
  /Open-Meteo/,
  /Montevideo|Uruguay|Buenos Aires/,
  /^[0-9A-Z]{4}(-[0-9A-Z]{4})+$/ // código de recuperación al azar (puede traer «DE», «LA»…)
]

async function revisar(win, pantalla) {
  await espera(250)
  const textos = await win.evaluate(() => {
    const out = []
    const vis = (el) => {
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'
    }
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    while (w.nextNode()) {
      const n = w.currentNode
      const el = n.parentElement
      if (!el || !n.textContent.trim()) continue
      if (el.closest('.ed-cuerpo, .ed-titulo, [data-contenido-usuario]')) continue // texto del usuario
      if (['SCRIPT', 'STYLE'].includes(el.tagName) || !vis(el)) continue
      out.push(n.textContent.trim())
    }
    for (const el of document.querySelectorAll('[title], [placeholder], [aria-label]')) {
      if (!vis(el) && !el.matches('input, textarea, select')) continue
      for (const a of ['title', 'placeholder', 'aria-label'])
        if (el.getAttribute(a)) out.push(el.getAttribute(a))
    }
    for (const o of document.querySelectorAll('option')) out.push(o.textContent.trim())
    return out
  })
  const malos = new Set()
  for (const t of textos) {
    if (PERMITIDO.some((r) => r.test(t))) continue
    const palabras = t.toLowerCase().match(/[a-záéíóúñü¿¡]+/g) ?? []
    const conTilde = /[áéíóúñ¿¡]/i.test(t) && !/Rosé|Café/.test(t)
    const esp = palabras.filter((p) => ES.has(p))
    if (conTilde || esp.length >= 1) malos.add(t.slice(0, 90))
  }
  ok(
    malos.size === 0,
    `${pantalla}: sin español` + (malos.size ? ' → ' + [...malos].join(' | ') : '')
  )
}

const app = await electron.launch({
  args: ['.'],
  env: { ...process.env, DIARLINUX_DATA: datos, DIARLINUX_OCULTA: '1', DIARLINUX_IDIOMA: 'en' }
})
const win = await app.firstWindow()
win.on('pageerror', (e) => errores.push(e.message))
await app.evaluate(({ BrowserWindow }) =>
  BrowserWindow.getAllWindows()[0].setContentSize(1200, 800)
)

// ── crear el diario ──
await win.waitForSelector('text=Create your journal')
await revisar(win, 'Crear diario')
await win.fill('input[placeholder="Password"]', 'clave-ingles')
await win.fill('input[placeholder="Repeat the password"]', 'clave-ingles')
await win.click('text=Create journal')
await win.waitForSelector('.bloqueo-codigo', { timeout: 20000 })
await revisar(win, 'Código de recuperación')
await win.check('.bloqueo-check input')
await win.click('text=Continue')
await win.waitForSelector('.cal-grilla')

// datos: entradas en inglés con etiqueta y persona (su texto es del usuario: puede ser cualquiera)
await win.evaluate(async () => {
  const d = window.diario
  const hoy = new Date()
  const f = (n) => {
    const x = new Date(hoy.getFullYear() - n, hoy.getMonth(), hoy.getDate())
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  }
  const tag = await d.etiquetas.crear('work')
  const per = await d.personas.crear('Anna')
  for (const n of [0, 1, 2]) {
    const e = await d.entradas.guardar({
      fecha: f(n),
      titulo: `Entry ${n}`,
      html: '<p>Some text written in English.</p>'
    })
    await d.etiquetas.asignar(e.id, [tag.id])
    await d.personas.asignar(e.id, [per.id])
  }
})
await win.click('.lateral-item:has-text("Timeline")')
await win.click('.lateral-item:has-text("Calendar")') // refrescar
await revisar(win, 'Calendario')
await win.click('.cal-nav-fecha')
await revisar(win, 'Selector de año')
await win.keyboard.press('Escape')

for (const [vista, nombre] of [
  ['Timeline', 'Línea de tiempo'],
  ['Search', 'Buscar'],
  ['Tags', 'Etiquetas'],
  ['Export', 'Exportar'],
  ['On This Day', 'En este día']
]) {
  await win.click(`.lateral-item:has-text("${vista}")`)
  await espera(400)
  await revisar(win, nombre)
}
// Buscar con filtros
await win.click(`.lateral-item:has-text("Search")`)
await win.click('.bus-filtros-boton')
await revisar(win, 'Buscar (filtros)')
// Personas
await win.click(`.lateral-item:has-text("Tags")`)
await win.click('[role="tab"]:has-text("People")')
await revisar(win, 'Personas')
// Exportar → confirmar
await win.click(`.lateral-item:has-text("Export")`)
await win.click('.exp-primario')
await revisar(win, 'Exportar (aviso)')
await win.click('.exp-aviso .exp-boton:not(.exp-primario)')

// ── clic derecho en la línea de tiempo → eliminar (pregunta) ──
await win.click(`.lateral-item:has-text("Timeline")`)
await win.click('.tarjeta >> nth=0', { button: 'right' })
await win.waitForSelector('.menu-entrada')
await revisar(win, 'Menú de la entrada')
await win.click('.menu-entrada button.peligro')
await win.waitForSelector('.dlg-botones')
await revisar(win, 'Confirmar eliminar')
await win.click('.dlg-botones button:not(.peligro)')

// ── editor ──
await win.click(`.lateral-item:has-text("Timeline")`)
await win.click('.tarjeta >> nth=0')
await win.waitForSelector('.ed-cuerpo')
await revisar(win, 'Editor')
for (const sel of [
  '[title="More options"]',
  '.ed-acciones button:has-text("Template")',
  '.ed-acciones button:has-text("Add audio")',
  '.ed-acciones button:has-text("Add tags")',
  '.ed-acciones button:has-text("Add people")'
]) {
  const b = win.locator(sel).first()
  if (await b.count()) {
    await b.click()
    await revisar(win, 'Editor → ' + sel)
    await win.keyboard.press('Escape')
    await win.mouse.click(5, 300)
  } else ok(false, 'no se encontró ' + sel)
}

// ── configuración: todas las pestañas ──
await win.keyboard.press('Escape')
await win.click('.lateral-item:has-text("Settings")')
await win.waitForSelector('.aj-ventana')
for (const p of [
  'General',
  'Appearance',
  'Security',
  'Journal',
  'Notifications',
  'Weather',
  'Statistics',
  'About'
]) {
  await win.click(`.aj-pestanas button:has-text("${p}")`)
  await espera(500)
  await revisar(win, 'Configuración → ' + p)
}
await win.click('.aj-pestanas button:has-text("Journal")')
await win.click('text=Reset journal…')
await revisar(win, 'Restablecer diario')
await win.click('text=Import from Diarium…')
await revisar(win, 'Importar Diarium')
await win.click('.imp-botones button:has-text("Cancel")')
await win.click('text=Import from Joplin…')
await revisar(win, 'Importar Joplin')
await win.click('.imp-botones button:has-text("Cancel")')
await win.click('.aj-pestanas button:has-text("General")')
await win.click('text=Manage templates…')
await revisar(win, 'Plantillas')
await win.click('.pl-ventana .aj-boton:has-text("Done")')

// ── bloqueo y código de recuperación ──
await win.keyboard.press('Escape')
await win.keyboard.press('Control+l')
await win.waitForSelector('text=Unlock journal', { timeout: 10000 })
await revisar(win, 'Bloqueado')
await win.click('text=Forgot your password?')
await revisar(win, 'Entrar con el código')
await win.click('.bloqueo-enlace >> nth=0')
await win.fill('input[type=password]', 'clave-mala')
await win.click('text=Unlock journal')
await win.waitForSelector('.bloqueo-error:not(:empty)', { timeout: 20000 })
ok(
  (await win.locator('.bloqueo-error').first().textContent()) === 'Wrong password',
  'error de contraseña en inglés'
)
await win.fill('input[type=password]', 'clave-ingles')
await win.click('text=Unlock journal')
await win.waitForSelector('text=Unlock journal', { state: 'detached', timeout: 20000 })
await win.click('.lateral-item:has-text("Settings")')
await win.waitForSelector('.aj-ventana')

// ── cambiar a español desde Configuración (y volver) ──
await win.selectOption('.aj-form select >> nth=0', 'es')
await win.waitForSelector('.lateral-item:has-text("Calendario")', { timeout: 15000 })
ok(true, 'al elegir Español la ventana se vuelve a abrir en español (sin pedir la contraseña)')
await win.click('.lateral-item:has-text("Configuración")')
await win.waitForSelector('.aj-ventana')
ok(
  (await win.locator('.aj-pestanas').textContent()).includes('Apariencia'),
  'Configuración en español'
)
await win.selectOption('.aj-form select >> nth=0', 'en')
await win.waitForSelector('.lateral-item:has-text("Calendar")', { timeout: 15000 })
ok(true, 'y de vuelta a English')

ok(
  errores.length === 0,
  'sin errores en la página' + (errores.length ? ': ' + errores.join(' | ') : '')
)
await app.close()
console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK')
process.exit(fallas ? 1 : 0)
