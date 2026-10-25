// Prueba de fotos con la ventana oculta y un diario temporal. Uso: node scripts/e2e-fotos.mjs <tmp>
import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const datos = path.join(process.argv[2], 'diario')
const ok = (c, m) => console.log((c ? 'OK   ' : 'FALLA') + ' ' + m)
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const errores = []

// PNG de prueba (degradado) sin librerías: cabecera + IHDR + IDAT (zlib) + IEND
function png(w, h, semilla) {
  const crc = (b) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)) } return ~c >>> 0 }
  const trozo = (tipo, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const t = Buffer.from(tipo); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, d]))); return Buffer.concat([l, t, d, c]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  const filas = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; filas[o] = (x * 255 / w + semilla) & 255; filas[o + 1] = (y * 255 / h) & 255; filas[o + 2] = semilla & 255 }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), trozo('IHDR', ihdr), trozo('IDAT', zlib.deflateSync(filas)), trozo('IEND', Buffer.alloc(0))])
}
const archivos = [0, 90, 180].map((s, i) => ({ name: `foto${i + 1}.png`, mimeType: 'image/png', buffer: png(1200 + i * 100, 800, s) }))

async function abrir() {
  const app = await electron.launch({ args: ['.'], env: { ...process.env, DIARLINUX_DATA: datos, DIARLINUX_OCULTA: '1' } })
  const win = await app.firstWindow()
  win.on('pageerror', (e) => errores.push(e.message))
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(900, 650))
  return { app, win }
}
const cargadas = (win, sel) => win.evaluate((s) => [...document.querySelectorAll(s)].filter((i) => i.complete && i.naturalWidth > 0).length, sel)
const encs = (sub) => (fs.existsSync(path.join(datos, sub)) ? fs.readdirSync(path.join(datos, sub)) : [])

let { app, win } = await abrir()
await win.waitForSelector('text=Crea tu diario')
await win.fill('input[placeholder="Contraseña"]', 'clave-fotos-1'); await win.fill('input[placeholder="Repetir la contraseña"]', 'clave-fotos-1')
await win.click('text=Crear diario'); await win.waitForSelector('.bloqueo-codigo', { timeout: 20000 })
await win.check('.bloqueo-check input'); await win.click('text=Continuar'); await win.waitForSelector('.cal-grilla')

// entrada nueva y 3 fotos con "Agregar foto" (sin escribir nada antes: la entrada se crea sola)
await win.click('.barra-boton[title^="Nueva entrada"]'); await win.waitForSelector('.ed-cuerpo')
await win.setInputFiles('.ed-acciones input[type=file]', archivos)
await win.waitForFunction(() => document.querySelectorAll('.ed-foto img').length === 3, null, { timeout: 30000 })
await espera(800)
ok((await cargadas(win, '.ed-foto img')) === 3, 'las 3 fotos se ven en la tira del editor (diario://mini)')
ok(encs('attachments').length === 3 && encs('thumbs').length === 6, `archivos cifrados: ${encs('attachments').length} fotos + ${encs('thumbs').length} miniaturas`)
const magia = [Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.from([0xff, 0xd8, 0xff]), Buffer.from('RIFF'), Buffer.from('WEBP'), Buffer.from('JFIF'), Buffer.from('IHDR')]
const legible = [...encs('attachments').map((n) => path.join(datos, 'attachments', n)), ...encs('thumbs').map((n) => path.join(datos, 'thumbs', n))]
  .some((f) => { const b = fs.readFileSync(f); return magia.some((m) => b.includes(m)) || !b.subarray(0, 4).equals(Buffer.from('DIAR')) })
ok(!legible, 'ningún archivo de foto es legible (sin cabeceras PNG/JPEG/WebP; todos empiezan con DIAR)')
// La CSP no deja hacer fetch a diario:// (solo cargarlo como imagen/medio): se prueba con <img>
const cargar = (u) => win.evaluate((u) => new Promise((r) => { const i = new Image(); i.onload = () => r([i.naturalWidth, i.naturalHeight]); i.onerror = () => r('error'); i.src = u }), u)
const urlFoto = await win.evaluate(() => document.querySelector('.ed-foto img').src.replace('/mini/', '/adjunto/').replace(/\/512$/, ''))
const tam = await cargar(urlFoto)
ok(Array.isArray(tam) && tam[0] === 1200 && tam[1] === 800, 'la foto completa se descifra y carga (' + tam + ')')
ok(await win.evaluate(async (u) => { try { await fetch(u); return 'abrió' } catch { return 'bloqueado' } }, urlFoto) === 'bloqueado', 'la CSP no deja leer diario:// con fetch')

// visor
await win.locator('.ed-foto img').first().click()
await win.waitForSelector('.visor img')
await espera(300)
ok((await cargadas(win, '.visor img')) === 1 && (await win.textContent('.visor-cuenta')) === '1 / 3', 'visor abre la foto completa (1 / 3)')
await win.keyboard.press('ArrowRight'); await espera(100)
ok((await win.textContent('.visor-cuenta')) === '2 / 3', 'flecha → pasa a la siguiente')
await win.keyboard.press('Escape'); await espera(100)
ok(await win.locator('.visor').count() === 0, 'Esc cierra el visor')

// quitar la tercera foto
await win.locator('.ed-foto').nth(2).hover()
await win.locator('.ed-foto-x').nth(2).click()
await win.click('.dlg-botones button.peligro') // pregunta dentro de la página
await espera(400)
ok(await win.locator('.ed-foto').count() === 2 && encs('attachments').length === 2 && encs('thumbs').length === 4, 'quitar una foto borra sus archivos')

// timeline y calendario con miniaturas
await win.click('.lateral-item:has-text("Línea de tiempo")'); await win.waitForSelector('.tarjeta')
await espera(500)
ok((await cargadas(win, '.tarjeta-foto')) === 1, 'la tarjeta de la línea de tiempo muestra la miniatura')
await win.screenshot({ path: 'docs/validacion/2timeline-foto.png' })
await win.click('.lateral-item:has-text("Calendario")'); await win.waitForSelector('.cal-grilla')
await espera(500)
ok(await win.locator('.cal-dia.con-foto').count() === 1, 'el día del calendario muestra la foto')
await win.screenshot({ path: 'docs/validacion/1calendasr-foto.png' })

// con el diario bloqueado, diario:// no entrega nada
const url = await win.evaluate(() => getComputedStyle(document.querySelector('.cal-dia.con-foto')).backgroundImage.slice(5, -2))
await win.keyboard.press('Control+l'); await win.waitForSelector('text=Desbloquear diario')
const estado = await cargar(url)
ok(estado === 'error', 'bloqueado: diario:// no entrega la foto (' + estado + ')')

// archivo suelto (corte al agregar) → se borra al abrir
fs.writeFileSync(path.join(datos, 'attachments', '00000000-0000-4000-8000-000000000000.enc'), 'basura')
await win.fill('input[placeholder="Contraseña"]', 'clave-fotos-1'); await win.click('text=Desbloquear diario')
await win.waitForSelector('.principal .barra'); await espera(400)
ok(!encs('attachments').includes('00000000-0000-4000-8000-000000000000.enc') && encs('attachments').length === 2, 'archivo suelto borrado al abrir; las fotos reales siguen')

// backup con fotos → borrar la entrada → restaurar → las fotos vuelven y se ven
await win.evaluate(() => window.diario.backups.ahora())
const id = await win.evaluate(async () => (await window.diario.entradas.listar())[0].id)
await win.evaluate((i) => window.diario.entradas.eliminar(i), id)
ok(encs('attachments').length === 0 && encs('thumbs').length === 0, 'eliminar la entrada borra todas sus fotos')
const bk = (await win.evaluate(() => window.diario.backups.listar()))[0].archivo
await win.evaluate((f) => window.diario.backups.restaurar(f), bk)
ok(encs('attachments').length === 2 && encs('thumbs').length === 4, 'el backup restaura las fotos')
await win.click('.lateral-item:has-text("Línea de tiempo")'); await win.waitForSelector('.tarjeta'); await espera(500)
ok((await cargadas(win, '.tarjeta-foto')) === 1, 'y se ven después de restaurar')
await app.close()
console.log('errores JS:', errores.length ? errores : 'ninguno')
