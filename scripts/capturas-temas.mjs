// Capturas de todas las vistas con distintos temas y acentos (validación visual).
// Uso: node scripts/capturas-temas.mjs <tmp> [tema:acento | skin=tokyo,barra=discreta,... ...]
//   → docs/validacion/temas/  (con SOLO=calendario,apariencia saca solo esas vistas)
import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'

const datos = path.join(process.argv[2], 'diario')
const combos = process.argv.slice(3).length ? process.argv.slice(3) : ['claro:celeste', 'oscuro:salvia']
const salida = 'docs/validacion/temas'
fs.mkdirSync(salida, { recursive: true })
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const errores = []

const app = await electron.launch({ args: ['.'], env: { ...process.env, DIARLINUX_DATA: datos, DIARLINUX_OCULTA: '1' } })
const win = await app.firstWindow()
win.on('pageerror', (e) => errores.push(e.message))
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1000, 680))
await win.waitForSelector('text=Crea tu diario')
await win.fill('input[placeholder="Contraseña"]', 'clave-temas')
await win.fill('input[placeholder="Repetir la contraseña"]', 'clave-temas')
await win.click('text=Crear diario')
await win.waitForSelector('.bloqueo-codigo', { timeout: 20000 })
await win.check('.bloqueo-check input')
await win.click('text=Continuar')
await win.waitForSelector('.cal-grilla')
const hoy = await win.evaluate(() => new Date().toISOString().slice(0, 10))
await win.evaluate(async (hoy) => {
  const d = window.diario
  const t = await d.etiquetas.crear('viajes')
  await d.etiquetas.color(t.id, '#4a6b4f')
  const t2 = await d.etiquetas.crear('música')
  const p = await d.personas.crear('Lucía')
  const ys = [0, 1, 2]
  for (const k of [0, 2, 5, 9, 14]) {
    const f = new Date(Date.now() - k * 86400000).toISOString().slice(0, 10)
    const e = await d.entradas.guardar({ fecha: f, titulo: 'Un día de ' + (k ? 'paseo' : 'canción'), html: '<p>Hoy escuché una canción y salimos a caminar por el parque con Lucía. Fue un buen día.</p><ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>Tarea hecha</p></li></ul>', calificacion: (k % 5) + 1 })
    await d.etiquetas.asignar(e.id, k % 2 ? [t.id] : [t.id, t2.id])
    await d.personas.asignar(e.id, [p.id])
  }
  for (const y of ys) await d.entradas.guardar({ fecha: `${2024 - y}${hoy.slice(4)}`, titulo: 'Hace años', html: '<p>Recuerdo</p>' })
}, hoy)

const solo = process.env.SOLO ? process.env.SOLO.split(',') : null
const quiero = (v) => !solo || solo.includes(v)
for (const combo of combos) {
  // "tema:acento" o "clave=valor,clave=valor" (skin, acento, barra, lateralTinte, fondoTinte, tema)
  const aj = combo.includes('=')
    ? Object.fromEntries(combo.split(',').map((kv) => kv.split('=')).map(([k, v]) => [k, v === 'true' ? true : v === 'false' ? false : v]))
    : { tema: combo.split(':')[0], acento: combo.split(':')[1] }
  if (aj.skin && !aj.acento) aj.acento = aj.skin === 'clasico' ? 'azul' : 'skin'
  const tema = aj.skin ?? aj.tema
  const acento = combo.includes('=') ? combo.replace(/[^a-z0-9=,]/gi, '').replace(/^skin=[^,]*,?/, '').replace(/[=,]/g, '-') || 'x' : aj.acento
  await win.evaluate((aj) => window.diario.ajustes.guardar({ barra: 'color', lateralTinte: false, fondoTinte: false, ...aj, contadorPalabras: true, objetivoPalabras: 50 }), aj)
  // bloquear y recargar la ventana: se aplica desde el inicio (como al abrir la app)
  await win.evaluate(() => window.diario.vault.bloquear())
  await win.reload()
  await win.waitForSelector('input[placeholder="Contraseña"]')
  await espera(300)
  if (quiero('bloqueo')) await win.screenshot({ path: `${salida}/${tema}-${acento}-0bloqueo.png` })
  await win.fill('input[placeholder="Contraseña"]', 'clave-temas')
  await win.keyboard.press('Enter')
  await win.waitForSelector('.cal-grilla')
  await espera(400)
  if (quiero('calendario')) await win.screenshot({ path: `${salida}/${tema}-${acento}-1calendario.png` })
  await win.click('.lateral-item:has-text("Línea de tiempo")')
  await win.waitForSelector('.tarjeta')
  await espera(300)
  if (quiero('timeline')) await win.screenshot({ path: `${salida}/${tema}-${acento}-2timeline.png` })
  await win.locator('.tarjeta').first().click()
  await win.waitForSelector('.ed-cuerpo')
  await win.click('text=Agregar etiquetas')
  await espera(400)
  if (quiero('editor')) await win.screenshot({ path: `${salida}/${tema}-${acento}-3editor.png` })
  await win.keyboard.press('Escape')
  await win.click('.lateral-item:has-text("Etiquetas")')
  await win.waitForSelector('.eti-fila')
  await win.locator('.eti-fila').first().click({ button: 'right' })
  await espera(200)
  if (quiero('etiquetas')) await win.screenshot({ path: `${salida}/${tema}-${acento}-4etiquetas.png` })
  await win.keyboard.press('Escape')
  await win.click('.lateral-item:has-text("Buscar")')
  await win.fill('.bus-campo input', 'cancion')
  await win.click('.bus-filtros-boton')
  await win.waitForSelector('.bus-lista .tarjeta')
  await espera(300)
  if (quiero('buscar')) await win.screenshot({ path: `${salida}/${tema}-${acento}-5buscar.png` })
  await win.click('.bus-filtros-boton')
  await win.click('.lateral-item:has-text("En este día")')
  await espera(400)
  if (quiero('enestedia')) await win.screenshot({ path: `${salida}/${tema}-${acento}-6enestedia.png` })
  await win.click('.lateral-item:has-text("Configuración")')
  await win.click('.aj-pestanas button:has-text("Apariencia")')
  await espera(300)
  if (quiero('apariencia')) await win.screenshot({ path: `${salida}/${tema}-${acento}-7apariencia.png` })
  if (quiero('apariencia')) {
    for (const [n, f] of [['8', 0.55], ['9', 1]]) {
      await win.evaluate((f) => { const c = document.querySelector('.aj-cuerpo'); c.scrollTop = (c.scrollHeight - c.clientHeight) * f }, f)
      await espera(150)
      await win.screenshot({ path: `${salida}/${tema}-${acento}-${n}apariencia.png` })
    }
  }
  await win.click('.aj-cerrar')
}
await app.close()
console.log('errores JS:', errores.length ? errores : 'ninguno')
