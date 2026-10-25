// Editor: guardado cada N minutos + Ctrl+S + botón
// Guardar, etiquetas/personas que no se cierran entre sí, ancho del texto, tamaño de los adjuntos,
// plantillas en la entrada, clic en cualquier lugar para escribir, pie compacto.
// Uso: node scripts/e2e-editor.mjs <tmp>
import { _electron as electron } from 'playwright-core'
import path from 'node:path'
import zlib from 'node:zlib'

const datos = path.join(process.argv[2], 'diario')
let fallas = 0
const ok = (c, m) => {
  if (!c) fallas++
  console.log((c ? 'OK   ' : 'FALLA') + ' ' + m)
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const errores = []

function png(w, h) {
  const crc = (b) => {
    let c = ~0
    for (const x of b) {
      c ^= x
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
    }
    return ~c >>> 0
  }
  const trozo = (t, d) => {
    const l = Buffer.alloc(4)
    l.writeUInt32BE(d.length)
    const c = Buffer.alloc(4)
    c.writeUInt32BE(crc(Buffer.concat([Buffer.from(t), d])))
    return Buffer.concat([l, Buffer.from(t), d, c])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const filas = Buffer.alloc((w * 3 + 1) * h, 120)
  for (let y = 0; y < h; y++) filas[y * (w * 3 + 1)] = 0
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    trozo('IHDR', ihdr),
    trozo('IDAT', zlib.deflateSync(filas)),
    trozo('IEND', Buffer.alloc(0))
  ])
}

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
await win.fill('input[placeholder="Contraseña"]', 'clave-editor')
await win.fill('input[placeholder="Repetir la contraseña"]', 'clave-editor')
await win.click('text=Crear diario')
await win.waitForSelector('.bloqueo-codigo', { timeout: 20000 })
await win.check('.bloqueo-check input')
await win.click('text=Continuar')
await win.waitForSelector('.cal-grilla')

const guardar = win.locator('.lateral-guardar')
ok(await guardar.isDisabled(), 'botón Guardar de la barra lateral: apagado sin una entrada abierta')

// guardado cada 3 s (en la app real: 4 min por defecto)
await win.evaluate(() => window.diario.ajustes.guardar({ autoguardadoSeg: 3 }))
await win.evaluate(() =>
  window.diario.plantillas.guardar({ nombre: 'Gratitud', html: '<p>Hoy agradezco PLANTILLA-X</p>' })
)
await win.click('.barra-boton[title^="Nueva entrada"]')
await win.waitForSelector('.ed-cuerpo')
await win.click('.ed-cuerpo')
await win.keyboard.type('Primer texto')
await espera(800)
const cuantas = () => win.evaluate(async () => (await window.diario.entradas.listar()).length)
ok((await cuantas()) === 0, 'no guarda a cada letra')
ok(/Sin guardar/.test(await win.textContent('.ed-estado')), 'muestra "Sin guardar"')
ok(
  (await win.locator('.lateral-guardar .lateral-punto').count()) === 1,
  'el botón Guardar muestra el punto de cambios'
)
await espera(3000)
ok((await cuantas()) === 1, 'guarda solo al cumplirse el plazo')
ok(/Guardado/.test(await win.textContent('.ed-estado')), 'y lo dice')

// sin cambios: no vuelve a guardar
const mod1 = await win.evaluate(async () => (await window.diario.entradas.listar())[0].id)
const antes = await win.evaluate(
  async (id) => (await window.diario.entradas.obtener(id)).modificada,
  mod1
)
await espera(3500)
ok(
  (await win.evaluate(
    async (id) => (await window.diario.entradas.obtener(id)).modificada,
    mod1
  )) === antes,
  'sin cambios no vuelve a guardar'
)

// Ctrl+S
await win.click('.ed-cuerpo')
await win.keyboard.press('Control+End')
await win.keyboard.type(' CTRL-S')
await win.keyboard.press('Control+s')
await espera(400)
ok(
  (
    await win.evaluate(async (id) => (await window.diario.entradas.obtener(id)).html, mod1)
  ).includes('CTRL-S'),
  'Ctrl+S guarda al instante'
)
// botón Guardar de la barra lateral
await win.click('.ed-cuerpo')
await win.keyboard.press('Control+End')
await win.keyboard.type(' BOTON')
ok(!(await guardar.isDisabled()), 'con una entrada abierta el botón Guardar se activa')
await guardar.click()
await espera(400)
ok(
  (
    await win.evaluate(async (id) => (await window.diario.entradas.obtener(id)).html, mod1)
  ).includes('BOTON'),
  'el botón Guardar de la barra lateral guarda al instante'
)
ok((await win.locator('.lateral-guardar .lateral-punto').count()) === 0, '…y se va el punto')

// etiquetas y personas: abrir uno con el otro abierto no lo cierra
await win.click('.ed-acciones button:has-text("Agregar etiquetas")')
await win.waitForSelector('.ed-etiqueta .ed-nueva-etiqueta input')
await win.click('.ed-acciones button:has-text("Agregar personas")')
await espera(400)
ok(
  (await win.locator('.ed-persona .ed-nueva-etiqueta input').count()) === 1,
  'abrir Personas con Etiquetas abierto: Personas queda abierto'
)
await win.click('.ed-acciones button:has-text("Agregar etiquetas")')
await espera(400)
ok(
  (await win.locator('.ed-etiqueta .ed-nueva-etiqueta input').count()) === 1,
  'y al revés: Etiquetas queda abierto'
)
await win.keyboard.type('playa')
await win.keyboard.press('Enter')
await espera(500)
ok(
  (await win.locator('.ed-pie .ed-etiqueta .chip', { hasText: 'playa' }).count()) === 1,
  'la etiqueta queda en el pie'
)
await win.keyboard.press('Escape')

// plantilla desde la entrada
await win.click('.ed-acciones button:has-text("Plantilla")')
await win.waitForSelector('.ed-menu-plantillas')
// mover el mouse lejos (por el costado) NO lo cierra
await win.mouse.move(5, 300)
await win.mouse.move(1000, 690)
await espera(300)
ok(
  (await win.locator('.ed-menu-plantillas').count()) === 1,
  'el menú Plantilla no se cierra al sacar el mouse'
)
await win.click('.ed-titulo')
await espera(200)
ok((await win.locator('.ed-menu-plantillas').count()) === 0, '…y se cierra con un clic afuera')
ok(
  (await win.locator('.ed-acciones button:has-text("calificación")').count()) === 0,
  'ya no está "Agregar calificación"'
)
await win.click('.ed-acciones button:has-text("Plantilla")')
await win.click('.ed-menu-plantillas button:has-text("Gratitud")')
await espera(300)
ok(
  (await win.textContent('.ed-cuerpo')).includes('PLANTILLA-X'),
  'botón Plantilla: elegir una la agrega a la entrada'
)

// clic en cualquier lugar vacío de la hoja → se puede escribir
await win.click('.ed-titulo')
const hoja = await win.locator('.ed-hoja').boundingBox()
await win.mouse.click(hoja.x + hoja.width / 2, hoja.y + hoja.height - 15)
await win.keyboard.type(' ABAJO')
ok(
  (await win.textContent('.ed-cuerpo')).includes('ABAJO'),
  'clic abajo en la hoja vacía: se escribe en la entrada'
)

// ancho del texto
const anchoDe = () =>
  win.evaluate(() => document.querySelector('.ed-hoja .ed-centro').getBoundingClientRect().width)
const lleno = await anchoDe()
await win.locator('.ed-ancho input').fill('600')
await espera(100)
ok(
  Math.round(await anchoDe()) === 600 && lleno > 700,
  `deslizador de ancho: ${Math.round(lleno)} → ${Math.round(await anchoDe())} px`
)
await win.screenshot({ path: 'docs/validacion/editor-angosto.png' })

// adjuntos más chicos y más grandes
await win.setInputFiles('.ed-acciones input[type=file]', [
  { name: 'a.png', mimeType: 'image/png', buffer: png(600, 400) }
])
await win.waitForSelector('.ed-pie .ed-foto img')
await espera(500)
const alto = () =>
  win.evaluate(() => document.querySelector('.ed-pie .ed-foto img').getBoundingClientRect().height)
await win.locator('.ed-tam-adj input').fill('60')
await espera(100)
const chico = await alto()
await win.locator('.ed-tam-adj input').fill('200')
await espera(100)
ok(
  Math.round(chico) === 60 && Math.round(await alto()) === 200,
  'deslizador de tamaño de adjuntos: 60 y 200 px'
)
await win.locator('.ed-tam-adj input').fill('96')
await win.locator('.ed-ancho input').fill('1800')
await win.screenshot({ path: 'docs/validacion/editor-pie.png' })

// el tamaño de adjuntos y el contador quedan fijos en la esquina aunque cambie el ancho del texto
await win.evaluate(() => window.diario.ajustes.guardar({ contadorPalabras: true }))
await win.click('.lateral-item:has-text("Configuración")')
await win.waitForSelector('.aj-ventana')
await win.click('.aj-cerrar') // al cerrar Configuración la entrada relee las preferencias
await win.waitForSelector('.ed-contador')
const esquina = () =>
  win.evaluate(() => {
    const r = (s) => document.querySelector(s)?.getBoundingClientRect()
    return {
      tam: Math.round(r('.ed-tam-adj')?.right ?? -1),
      cont: Math.round(r('.ed-contador')?.right ?? -1)
    }
  })
await win.locator('.ed-ancho input').fill('1800')
await espera(200)
const e1 = await esquina()
await win.locator('.ed-ancho input').fill('600')
await espera(200)
const e2 = await esquina()
ok(
  e1.tam > 0 && e1.cont > 0 && e1.tam === e2.tam && e1.cont === e2.cont,
  `contador y tamaño de adjuntos fijos: ${JSON.stringify(e1)} = ${JSON.stringify(e2)}`
)
await win.screenshot({ path: 'docs/validacion/editor-fijos.png' })

// el ancho y el tamaño se recuerdan al abrir otra entrada
await win.locator('.ed-ancho input').fill('700')
await win.click('.lateral-item:has-text("Calendario")')
await win.click('.barra-boton[title^="Nueva entrada"]')
await win.waitForSelector('.ed-cuerpo')
await espera(300)
ok(
  Math.round(await anchoDe()) === 700,
  'el ancho elegido se recuerda: ' +
    Math.round(await anchoDe()) +
    ' / ' +
    (await win.evaluate(() => localStorage.getItem('diar.edAncho'))) +
    ' / ' +
    (await win.locator('.ed-ancho input').inputValue())
)

ok(
  errores.length === 0,
  'sin errores en la página' + (errores.length ? ': ' + errores.join(' | ') : '')
)
await app.evaluate(({ app }) => app.quit())
await app.close().catch(() => {})
console.log(fallas ? `\n${fallas} FALLAS` : '\nTODO OK')
process.exit(fallas ? 1 : 0)
