// Prueba de la Fase 3 (clima, luna, buscar, en este día) con la ventana oculta y un Open-Meteo FALSO
// local (no sale a internet). Uso: node scripts/e2e-fase3.mjs <tmp>
import { _electron as electron } from 'playwright-core'
import http from 'node:http'
import path from 'node:path'

const datos = path.join(process.argv[2], 'diario')
const ok = (c, m) => console.log((c ? 'OK   ' : 'FALLA') + ' ' + m)
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const errores = []
const pedidos = []

// ── Open-Meteo falso ──
const respuestaClima = (fecha, codigo) => {
  const time = Array.from({ length: 24 }, (_, i) => `${fecha}T${String(i).padStart(2, '0')}:00`)
  return {
    hourly: {
      time,
      temperature_2m: time.map((_, i) => 8 + i * 0.5),
      weather_code: time.map(() => codigo)
    },
    daily: {
      weather_code: [codigo],
      temperature_2m_max: [19.6],
      temperature_2m_min: [7.4],
      sunrise: [`${fecha}T07:05`],
      sunset: [`${fecha}T19:10`]
    }
  }
}
const servidor = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x')
  pedidos.push(req.url)
  let cuerpo
  if (u.pathname === '/geo/v1/search')
    cuerpo = {
      results: [
        {
          name: 'Buenos Aires',
          latitude: -34.6037,
          longitude: -58.3816,
          admin1: 'Ciudad Autónoma de Buenos Aires',
          country: 'Argentina',
          timezone: 'America/Argentina/Buenos_Aires'
        },
        {
          name: 'Buenos Aires',
          latitude: 9.17,
          longitude: -83.33,
          admin1: 'Puntarenas',
          country: 'Costa Rica',
          timezone: 'America/Costa_Rica'
        }
      ]
    }
  else if (u.pathname === '/api/v1/forecast')
    cuerpo = respuestaClima(u.searchParams.get('start_date'), 2)
  else if (u.pathname === '/archivo/v1/archive')
    cuerpo = respuestaClima(u.searchParams.get('start_date'), 61)
  res.writeHead(cuerpo ? 200 : 404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(cuerpo ?? { error: true }))
})
await new Promise((r) => servidor.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${servidor.address().port}`

const app = await electron.launch({
  args: ['.'],
  env: { ...process.env, DIARLINUX_DATA: datos, DIARLINUX_OCULTA: '1', DIARLINUX_OPENMETEO: base }
})
const win = await app.firstWindow()
win.on('pageerror', (e) => errores.push(e.message))
await app.evaluate(({ BrowserWindow }) =>
  BrowserWindow.getAllWindows()[0].setContentSize(1000, 680)
)
await win.waitForSelector('text=Crea tu diario')
await win.fill('input[placeholder="Contraseña"]', 'clave-fase3')
await win.fill('input[placeholder="Repetir la contraseña"]', 'clave-fase3')
await win.click('text=Crear diario')
await win.waitForSelector('.bloqueo-codigo', { timeout: 20000 })
await win.check('.bloqueo-check input')
await win.click('text=Continuar')
await win.waitForSelector('.cal-grilla')

// ── Configuración → Clima: elegir la ciudad ──
await win.click('.lateral-item:has-text("Configuración")')
await win.click('.aj-pestanas button:has-text("Clima")')
await win.waitForSelector('.aj-ciudad-campo')
await win.fill('.aj-ciudad-campo', 'Buenos')
await win.waitForSelector('.aj-ciudades button')
ok(
  (await win.locator('.aj-ciudades button').count()) === 2,
  'buscar ciudad muestra las opciones (con provincia y país)'
)
await win.click('.aj-ciudades button:has-text("Argentina")')
await espera(300)
ok(
  (await win.textContent('.aj-form .aj-ruta')).startsWith('Buenos Aires, Ciudad Autónoma'),
  'ciudad elegida y guardada'
)
await win.screenshot({ path: 'docs/validacion/ajustes-clima.png' })
await win.click('.aj-cerrar')

// ── Entrada nueva: clima automático, luna, amanecer y atardecer ──
await win.click('.barra-boton[title^="Nueva entrada"]')
await win.waitForSelector('.ed-cuerpo')
await win.click('.ed-cuerpo')
await win.keyboard.type('Texto MUY SECRETO del diario, con un PINGÜINO.')
await win.waitForSelector('.ed-clima', { timeout: 8000 })
const chip = await win.textContent('.ed-clima')
ok(/^\d+ °C, parcialmente nublado$/.test(chip), 'la entrada nueva recibe el clima solo: ' + chip)
ok(
  (await win.locator('.ed-dato', { hasText: '07:05' }).count()) === 1 &&
    (await win.locator('.ed-dato', { hasText: '19:10' }).count()) === 1,
  'amanecer y atardecer'
)
ok(
  (await win.locator('.ed-dato svg circle').count()) === 1 &&
    /Luna|Cuarto|Gibosa/.test(await win.textContent('.ed-pie-fila')),
  'fase lunar del día'
)
const pronostico = pedidos.find((p) => p.startsWith('/api/v1/forecast'))
ok(
  !!pronostico &&
    pronostico.includes('latitude=-34.6037') &&
    pronostico.includes('longitude=-58.3816'),
  'hoy usa el pronóstico con las coordenadas de la ciudad'
)
ok(
  !pedidos.some((p) => /SECRETO|PING|diario|clave/i.test(decodeURIComponent(p))),
  'a Open-Meteo no le llega nada del diario (solo coordenadas y fechas)'
)

// Cambiar la fecha a una vieja: se pide al archivo histórico
await win.locator('.ed-fecha-texto input').fill('2015-06-10')
await win.waitForFunction(
  () => document.querySelector('.ed-clima')?.textContent.includes('lluvia'),
  null,
  { timeout: 8000 }
)
ok(
  pedidos.some((p) => p.startsWith('/archivo/v1/archive') && p.includes('start_date=2015-06-10')),
  'fecha vieja: clima del archivo histórico (lluvia ligera)'
)
await win.screenshot({ path: 'docs/validacion/editor-clima.png' })

// Sin conexión: avisa y no borra lo que había
servidor.closeAllConnections()
await new Promise((r) => servidor.close(r))
await win.click('.ed-barra .barra-boton[title="Más opciones"]')
await win.click('.ed-menu button:has-text("Actualizar clima")')
await win.waitForFunction(
  () => document.querySelector('.ed-estado')?.textContent.includes('Sin conexión'),
  null,
  { timeout: 15000 }
)
ok((await win.locator('.ed-clima').count()) === 1, 'sin conexión: avisa y el clima guardado sigue')

// °F y quitar
await win.evaluate(() => window.diario.clima.guardarAjustes({ unidad: 'F' }))
await win.click('.lateral-item:has-text("Línea de tiempo")')
await win.locator('.tarjeta').first().click()
await win.waitForSelector('.ed-clima')
ok((await win.textContent('.ed-clima')).includes('°F'), 'unidades en °F')
await win.click('.ed-clima .chip-x')
await espera(300)
const id = await win.evaluate(async () => (await window.diario.entradas.listar())[0].id)
ok(
  (await win.evaluate((i) => window.diario.entradas.obtener(i), id)).clima === null,
  'quitar el clima'
)

// ── Buscar ──
await win.evaluate(async () => {
  const d = window.diario
  const t = await d.etiquetas.crear('viajes')
  const a = await d.entradas.guardar({
    fecha: '2025-03-02',
    titulo: 'Canción del verano',
    html: '<p>Escuché una canción en la playa</p>',
    calificacion: 5
  })
  await d.entradas.guardar({
    fecha: '2025-04-02',
    titulo: 'Otra cosa',
    html: '<p>Trabajo y nada más; una cancion distinta</p>',
    calificacion: 2
  })
  await d.etiquetas.asignar(a.id, [t.id])
})
// Ctrl+F lleva a Buscar
await win.keyboard.press('Control+f')
await win.waitForSelector('.bus-campo input')
ok((await win.locator('.bus-aviso').count()) === 1, 'Ctrl+F abre Buscar (con la ayuda inicial)')
await win.keyboard.type('CANCION')
await win.waitForSelector('.bus-lista .tarjeta')
ok((await win.locator('.bus-lista .tarjeta').count()) === 2, 'busca sin acentos ni mayúsculas')
ok(
  (await win.locator('.bus-lista mark').first().textContent()).toLowerCase().startsWith('canci'),
  'lo encontrado aparece resaltado'
)
ok(
  (await win.textContent('.tarjeta-mes')).match(/^[A-Z]{3} \d{4}$/),
  'la tarjeta muestra mes y año'
)
await win.click('.bus-filtros-boton')
await win.click('.bus-estrellas button[title="4 o más"]')
await espera(500)
ok(
  (await win.locator('.bus-lista .tarjeta').count()) === 1 &&
    (await win.textContent('.bus-insignia')) === '1',
  'filtro de calificación (y cuenta de filtros en el botón)'
)
await win.click('.bus-estrellas button[title="4 o más"]')
await win.click('.bus-chip:has-text("viajes")')
await win.fill('.bus-campo input', '')
await espera(500)
ok(
  (await win.locator('.bus-lista .tarjeta').count()) === 1,
  'solo con filtro de etiqueta (sin texto)'
)
await win.screenshot({ path: 'docs/validacion/buscar.png' })
await win.click('.bus-limpiar')
await win.fill('.bus-campo input', 'zzzz')
await win.waitForSelector('.bus-aviso')
ok((await win.textContent('.bus-aviso')).includes('No se encontró'), 'sin resultados: aviso')
await win.fill('.bus-campo input', '" AND ( *')
await espera(500)
ok(errores.length === 0, 'texto con comillas y operadores no rompe la búsqueda')

// ── En este día ──
const hoy = await win.evaluate(() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})
const anio = Number(hoy.slice(0, 4))
await win.evaluate(
  async ([a, b]) => {
    await window.diario.entradas.guardar({ fecha: a, titulo: 'Hace un año', html: '<p>x</p>' })
    await window.diario.entradas.guardar({ fecha: b, titulo: 'Hace tres años', html: '<p>y</p>' })
  },
  [`${anio - 1}${hoy.slice(4)}`, `${anio - 3}${hoy.slice(4)}`]
)
await win.click('.lateral-item:has-text("En este día")')
await win.waitForSelector('.encabezado-mes')
const grupos = await win.$$eval('.encabezado-mes', (l) => l.map((x) => x.textContent))
ok(
  JSON.stringify(grupos) ===
    JSON.stringify([`HACE 1 AÑO · ${anio - 1}`, `HACE 3 AÑOS · ${anio - 3}`]),
  'agrupa por "Hace N años": ' + JSON.stringify(grupos)
)
await win.screenshot({ path: 'docs/validacion/en-este-dia.png' })
await win.click('.pildora button[title="Día siguiente"]')
const amable = await win
  .waitForFunction(
    () => document.querySelector('.contenido')?.textContent.includes('Ningún año anterior'),
    null,
    { timeout: 5000 }
  )
  .then(
    () => true,
    () => false
  )
ok(
  amable && (await win.locator('.encabezado-mes').count()) === 0,
  'otro día sin entradas: mensaje amable'
)
await win.click('.ees-dia')
await win.waitForSelector('.encabezado-mes')
ok(true, 'clic en la fecha vuelve a hoy')

await app.close()
console.log('errores JS:', errores.length ? errores : 'ninguno')
