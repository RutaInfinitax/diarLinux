// Capturas para el README (en inglés, con un diario de ejemplo inventado).
// Uso: node scripts/capturas-readme.mjs <tmp> <carpeta destino>
import { _electron as electron } from 'playwright-core'
import path from 'node:path'
import fs from 'node:fs'

const [tmp, destino] = process.argv.slice(2)
fs.mkdirSync(destino, { recursive: true })
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const app = await electron.launch({
  args: ['.'],
  env: {
    ...process.env,
    DIARLINUX_DATA: path.join(tmp, 'diario'),
    DIARLINUX_OCULTA: '1',
    DIARLINUX_IDIOMA: 'en'
  }
})
const win = await app.firstWindow()
await app.evaluate(({ BrowserWindow }) =>
  BrowserWindow.getAllWindows()[0].setContentSize(1280, 800)
)
await win.waitForSelector('text=Create your journal')
await win.fill('input[placeholder="Password"]', 'sample-password')
await win.fill('input[placeholder="Repeat the password"]', 'sample-password')
await win.click('text=Create journal')
await win.waitForSelector('.bloqueo-codigo', { timeout: 20000 })
await win.check('.bloqueo-check input')
await win.click('text=Continue')
await win.waitForSelector('.cal-grilla')

await win.evaluate(async () => {
  const d = window.diario
  const hoy = new Date()
  const f = (dias) => {
    const x = new Date(hoy)
    x.setDate(x.getDate() - dias)
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  }
  const tags = {}
  for (const [n, c] of [
    ['travel', '#29b6f6'],
    ['family', '#ec407a'],
    ['work', '#5c6bc0'],
    ['reading', '#43a047']
  ])
    tags[n] = (await d.etiquetas.crear(n)).id
  for (const [n, c] of Object.entries({
    travel: '#29b6f6',
    family: '#ec407a',
    work: '#5c6bc0',
    reading: '#43a047'
  }))
    await d.etiquetas.color(tags[n], c)
  const ana = (await d.personas.crear('Anna')).id
  const leo = (await d.personas.crear('Leo')).id
  const entradas = [
    [
      0,
      'A quiet Sunday',
      '<p>Slow morning with coffee and the newspaper. In the afternoon we walked along the river until the sun went down.</p>',
      ['family'],
      [ana]
    ],
    [
      1,
      'Finished the novel',
      '<p>Finally finished <em>The Remains of the Day</em>. The ending stayed with me for hours.</p><ul><li>Start the next book</li><li>Write a short review</li></ul>',
      ['reading'],
      []
    ],
    [
      3,
      'Project kickoff',
      '<p>First meeting for the new project. Lots of ideas, a tight schedule and a great team.</p>',
      ['work'],
      [leo]
    ],
    [
      6,
      'Train to the coast',
      '<p>Window seat the whole way. The sea appeared suddenly after the last tunnel.</p>',
      ['travel'],
      [ana, leo]
    ],
    [
      9,
      'Grandma’s recipes',
      '<p>We cooked her apple pie together and wrote down every step.</p>',
      ['family'],
      [ana]
    ],
    [13, 'Rainy evening', '<p>Rain all evening. Tea, music and an unfinished puzzle.</p>', [], []],
    [
      17,
      'Mountain hike',
      '<p>Six hours up and down. Tired legs, clear head.</p>',
      ['travel'],
      [leo]
    ],
    [
      22,
      'New desk setup',
      '<p>Moved the desk next to the window. Much better light for working.</p>',
      ['work'],
      []
    ],
    [
      27,
      'Book club',
      '<p>Great discussion tonight; everyone had a different favourite character.</p>',
      ['reading'],
      [ana]
    ],
    [
      33,
      'Birthday dinner',
      '<p>Small dinner with the family. Candles, stories and too much cake.</p>',
      ['family'],
      [ana, leo]
    ]
  ]
  for (const [dias, titulo, html, et, per] of entradas) {
    const e = await d.entradas.guardar({ fecha: f(dias), hora: '19:30', titulo, html })
    if (et.length)
      await d.etiquetas.asignar(
        e.id,
        et.map((n) => tags[n])
      )
    if (per.length) await d.personas.asignar(e.id, per)
  }
})
await win.click('.lateral-item:has-text("Timeline")')
await win.click('.lateral-item:has-text("Calendar")')
await espera(1200)
await win.screenshot({ path: path.join(destino, 'calendar.png') })
await win.click('.lateral-item:has-text("Timeline")')
await espera(1200)
await win.screenshot({ path: path.join(destino, 'timeline.png') })
await win.click('.tarjeta:has-text("Finished the novel")')
await win.waitForSelector('.ed-cuerpo')
await espera(1200)
await win.screenshot({ path: path.join(destino, 'editor.png') })
await win.click('.lateral-item:has-text("Tags")')
await espera(1000)
await win.screenshot({ path: path.join(destino, 'tags.png') })
await win.click('.lateral-item:has-text("Settings")')
await win.click('.aj-pestanas button:has-text("Appearance")')
await espera(1000)
await win.screenshot({ path: path.join(destino, 'settings-appearance.png') })
await app.close()
console.log('capturas en', destino)
