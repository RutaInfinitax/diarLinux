// Prueba de archivos, audio y video. Uso: node scripts/e2e-medios.mjs <tmp> <carpeta con video-prueba.webm, audio-prueba.ogg, notas.txt>
import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'

const tmp = process.argv[2]
const medios = process.argv[3]
const datos = path.join(tmp, 'diario')
const copia = path.join(tmp, 'copia.txt')
const ok = (c, m) => console.log((c ? 'OK   ' : 'FALLA') + ' ' + m)
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const errores = []
const app = await electron.launch({
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '.'],
  env: { ...process.env, DIARLINUX_DATA: datos, DIARLINUX_OCULTA: '1', DIARLINUX_GUARDAR_EN: copia }
})
const win = await app.firstWindow()
win.on('pageerror', (e) => errores.push(e.message))
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(900, 650))
const encs = () => (fs.existsSync(path.join(datos, 'attachments')) ? fs.readdirSync(path.join(datos, 'attachments')) : [])

await win.waitForSelector('text=Crea tu diario')
await win.fill('input[placeholder="Contraseña"]', 'clave-medios-1'); await win.fill('input[placeholder="Repetir la contraseña"]', 'clave-medios-1')
await win.click('text=Crear diario'); await win.waitForSelector('.bloqueo-codigo', { timeout: 20000 })
await win.check('.bloqueo-check input'); await win.click('text=Continuar'); await win.waitForSelector('.cal-grilla')
await win.click('.barra-boton[title^="Nueva entrada"]'); await win.waitForSelector('.ed-cuerpo')

// "Agregar archivo": video, audio y texto a la vez (rutas reales: main los lee y cifra por partes)
await win.setInputFiles('.ed-acciones input[type=file]:not([accept])', ['video-prueba.webm', 'audio-prueba.ogg', 'notas.txt'].map((n) => path.join(medios, n)))
await win.waitForFunction(() => document.querySelectorAll('.ed-foto').length === 3, null, { timeout: 30000 })
await espera(800)
ok(await win.locator('.ed-foto.adj-video').count() === 1 && await win.locator('.ed-foto.adj-audio').count() === 1 && await win.locator('.ed-foto.adj-file').count() === 1, 'video, audio y archivo aparecen como tarjetas')
ok(await win.evaluate(() => { const i = document.querySelector('.adj-video img'); return i.complete && i.naturalWidth > 0 }), 'el video tiene miniatura (fotograma)')
ok((await win.textContent('.adj-dur')) === '0:06', 'duración del video: ' + (await win.textContent('.adj-dur')))
const leidos = encs().map((n) => fs.readFileSync(path.join(datos, 'attachments', n)))
ok(leidos.length === 3 && !leidos.some((b) => b.includes('TEXTO-PLANO-XYZ') || b.includes(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) || b.includes('OggS') || b.includes('webm')), 'los 3 archivos están cifrados en el disco')

// video en el visor: se reproduce y se puede adelantar (Range sobre el .enc)
await win.click('.adj-video')
await win.waitForSelector('.visor video')
const video = await win.evaluate(() => new Promise((r) => {
  const v = document.querySelector('.visor video'); v.muted = true
  const listo = () => { v.currentTime = 4; v.onseeked = () => r({ dur: Math.round(v.duration), t: Math.round(v.currentTime), w: v.videoWidth }) }
  if (v.readyState >= 1) listo(); else v.onloadedmetadata = listo
  setTimeout(() => r('tiempo'), 15000)
}))
ok(video.dur === 6 && video.t === 4 && video.w === 640, 'el video se reproduce y se adelanta a 0:04 ' + JSON.stringify(video))
await win.keyboard.press('Escape')

// audio: reproducir
const audio = await win.evaluate(() => new Promise((r) => {
  const a = document.querySelector('.adj-audio audio'); a.muted = true
  a.play().then(() => setTimeout(() => r({ t: a.currentTime, dur: Math.round(a.duration) }), 1200)).catch((e) => r(String(e)))
}))
ok(audio.t > 0.5 && audio.dur === 4, 'el audio se reproduce ' + JSON.stringify(audio))

// archivo: "Guardar una copia" (sin cifrar) da el contenido original; "Abrir" lo descifra en RAM
await win.click('.adj-file .adj-cuadro')
await win.click('.adj-menu >> text=Guardar una copia')
await espera(600)
ok(fs.existsSync(copia) && fs.readFileSync(copia, 'utf8') === fs.readFileSync(path.join(medios, 'notas.txt'), 'utf8'), 'guardar una copia: contenido idéntico al original')
await win.click('.adj-file .adj-cuadro')
await win.click('.adj-menu >> text=Abrir')
await espera(600)
const pid = await app.evaluate(() => process.pid)
const temp = path.join(process.env.XDG_RUNTIME_DIR, `diarlinux-abiertos-prueba-${pid}`)
const abiertos = fs.existsSync(temp) ? fs.readdirSync(temp, { recursive: true }) : []
ok(abiertos.some((n) => String(n).endsWith('notas.txt')), 'abrir: se descifra en una carpeta en RAM (' + temp + ')')

// "Agregar audio" → "Elegir un archivo de audio…": mp3 y wav
await win.click('.ed-accion-menu > button')
await win.waitForSelector('.ed-menu-audio')
ok((await win.locator('.ed-menu-audio button').allTextContents()).join('|').includes('Elegir un archivo de audio'), 'el menú de audio ofrece grabar o elegir un archivo')
const [selector] = await Promise.all([win.waitForEvent('filechooser'), win.click('text=Elegir un archivo de audio')])
// real.mp3: 3 minutos, 4 MB, con etiquetas ID3 y carátula (varios bloques cifrados)
await selector.setFiles(['real.mp3', 'nota.wav'].map((n) => path.join(medios, n)))
ok(await win.locator('.ed-menu-audio').count() === 0, 'al elegir, el menú se cierra')
await win.waitForFunction(() => document.querySelectorAll('.ed-foto.adj-audio').length === 3, null, { timeout: 15000 })
const durs = await win.evaluate(() => Promise.all([...document.querySelectorAll('.ed-foto.adj-audio audio')].slice(1).map((a) => new Promise((r) => { if (a.readyState >= 1) r(Math.round(a.duration)); else a.onloadedmetadata = () => r(Math.round(a.duration)); setTimeout(() => r('tiempo'), 8000) }))))
ok(JSON.stringify(durs) === '[180,2]', 'mp3 (3 min, con carátula) y wav agregados como audios ' + JSON.stringify(durs))
const mp3 = await win.evaluate(() => new Promise((r) => {
  const a = document.querySelectorAll('.ed-foto.adj-audio audio')[1]; a.muted = true
  a.currentTime = 150
  a.onseeked = () => a.play().then(() => setTimeout(() => r(Math.round(a.currentTime)), 800)).catch((e) => r(String(e)))
  setTimeout(() => r('tiempo'), 10000)
}))
ok(mp3 >= 150 && mp3 < 155, 'el mp3 se adelanta a 2:30 y suena (' + mp3 + ' s)')

// grabar audio (micrófono simulado)
await win.click('.ed-accion-menu > button')
await win.click('text=Grabar con el micrófono')
await win.waitForSelector('.grabadora')
await espera(2500)
await win.click('text=Detener y guardar')
await win.waitForFunction(() => document.querySelectorAll('.ed-foto.adj-audio').length === 4, null, { timeout: 15000 })
ok(true, 'grabar audio: se guarda como un audio más')
await espera(300)
const grab = await win.evaluate(() => new Promise((r) => { const a = document.querySelectorAll('.adj-audio audio')[3]; a.muted = true; if (a.readyState >= 1) r(a.duration); else a.onloadedmetadata = () => r(a.duration); setTimeout(() => r('tiempo'), 8000) }))
ok(grab !== 'tiempo', 'la grabación se puede reproducir (el archivo no trae duración: se usa la medida al grabar)')

await win.click('.ed-titulo'); await win.keyboard.type('Día con adjuntos'); await win.click('.ed-cuerpo'); await win.keyboard.type('Grabé un audio y guardé un video.')
await espera(1200)
await win.screenshot({ path: 'docs/validacion/escribir-adjuntos.png' })
// bloquear borra lo abierto; eliminar la entrada borra todo
await win.keyboard.press('Control+l'); await win.waitForSelector('text=Desbloquear diario'); await espera(300)
ok(!fs.existsSync(temp), 'bloquear borra los archivos abiertos de la RAM')
await win.fill('input[placeholder="Contraseña"]', 'clave-medios-1'); await win.click('text=Desbloquear diario'); await win.waitForSelector('.principal .barra')
const id = await win.evaluate(async () => (await window.diario.entradas.listar())[0].id)
await win.evaluate((i) => window.diario.entradas.eliminar(i), id)
ok(encs().length === 0 && fs.readdirSync(path.join(datos, 'thumbs')).length === 0, 'eliminar la entrada borra video, audios y archivo')
await app.close()
console.log('errores JS:', errores.length ? errores : 'ninguno')
