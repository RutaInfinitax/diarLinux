// Prueba de backups (ventana oculta, diario temporal). Uso: node scripts/e2e-backup.mjs <carpeta-temporal>
import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'

const tmp = process.argv[2]
const ok = (c, m) => console.log((c ? 'OK   ' : 'FALLA') + ' ' + m)
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const errores = []

async function abrir(datos) {
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, DIARLINUX_DATA: datos, DIARLINUX_OCULTA: '1' }
  })
  const win = await app.firstWindow()
  win.on('pageerror', (e) => errores.push(e.message))
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(900, 600)
  )
  return { app, win }
}
const api = (win, fn, ...a) => win.evaluate(fn, a)
async function crearDiario(win, clave) {
  await win.waitForSelector('text=Crea tu diario')
  await win.fill('input[placeholder="Contraseña"]', clave)
  await win.fill('input[placeholder="Repetir la contraseña"]', clave)
  await win.click('text=Crear diario')
  await win.waitForSelector('.bloqueo-codigo', { timeout: 20000 })
  await win.check('.bloqueo-check input')
  await win.click('text=Continuar')
  await win.waitForSelector('.cal-grilla')
}
const titulos = (win) =>
  api(win, async () => (await window.diario.entradas.listar()).map((e) => e.titulo))
const nueva = (win, titulo) =>
  api(
    win,
    ([t]) => window.diario.entradas.guardar({ fecha: '2026-01-15', titulo: t, html: '<p>x</p>' }),
    titulo
  )

// ── Diario A ──
const A = path.join(tmp, 'A')
let { app, win } = await abrir(A)
await crearDiario(win, 'clave-A-111')
await nueva(win, 'Antes del backup')

// Backup desde Configuración → Diario
await win.click('.lateral-item:has-text("Configuración")')
await win.click('.aj-pestanas button:has-text("Diario")')
await win.click('text=Hacer backup ahora')
await win.waitForSelector('.aj-nota:has-text("Backup creado")')
const backups = fs.readdirSync(path.join(A, 'backups'))
ok(
  backups.length === 1 && backups[0].endsWith('.tar'),
  'backup creado en <diario>/backups: ' + backups[0]
)
const bk = path.join(A, 'backups', backups[0])
const contenido = fs.readFileSync(bk)
ok(
  !contenido.includes('Antes del backup') && !contenido.includes('clave-A'),
  'el backup no tiene texto legible'
)
await win.screenshot({ path: 'docs/validacion/ajustes-diario.png' })
await win.keyboard.press('Escape')

// Cambios después del backup + contraseña nueva
await nueva(win, 'Después del backup')
await api(win, () => window.diario.vault.cambiarContrasena('clave-A-111', 'clave-A-222'))
ok((await titulos(win)).length === 2, 'hay 2 entradas antes de restaurar')

// Restaurar el backup viejo estando dentro: no pide contraseña (mismo diario) y conserva la actual
const r = await api(win, ([f]) => window.diario.backups.restaurar(f), bk)
ok('ok' in r, 'restaurar backup del mismo diario: sin contraseña')
await espera(300)
ok(
  JSON.stringify(await titulos(win)) === JSON.stringify(['Antes del backup']),
  'vuelve al contenido del backup'
)
ok(
  !fs.existsSync(path.join(A, '.restaurar')) && !fs.existsSync(path.join(A, '.anterior')),
  'no quedan carpetas temporales'
)
await win.keyboard.press('Control+l')
await win.waitForSelector('text=Desbloquear diario')
await win.fill('input[placeholder="Contraseña"]', 'clave-A-111')
await win.click('text=Desbloquear diario')
await win.waitForSelector('.bloqueo-error:has-text("incorrecta")')
await win.fill('input[placeholder="Contraseña"]', 'clave-A-222')
await win.click('text=Desbloquear diario')
await win.waitForSelector('.principal .barra')
ok(true, 'tras restaurar sigue valiendo la contraseña ACTUAL (no la del backup)')
await app.close()

// ── Diario B (otro diario): restaurar el backup de A pide la contraseña que tenía A al hacerlo ──
const B = path.join(tmp, 'B')
;({ app, win } = await abrir(B))
await crearDiario(win, 'clave-B-333')
await nueva(win, 'Entrada de B')
const r2 = await api(win, ([f]) => window.diario.backups.restaurar(f), bk)
ok('necesitaContrasena' in r2, 'backup de otro diario: pide su contraseña')
const mal = await api(
  win,
  async ([f]) => {
    try {
      await window.diario.backups.restaurar(f, 'clave-B-333')
      return 'abrió'
    } catch (e) {
      return e.message
    }
  },
  bk
)
ok(mal === 'Contraseña incorrecta', 'con la contraseña equivocada no restaura')
ok(JSON.stringify(await titulos(win)) === JSON.stringify(['Entrada de B']), 'y B queda intacto')
await api(win, ([f]) => window.diario.backups.restaurar(f, 'clave-A-111'), bk)
ok(
  JSON.stringify(await titulos(win)) === JSON.stringify(['Antes del backup']),
  'con la contraseña del backup restaura'
)
await app.close()

// ── Instalación vacía: restaurar desde el asistente ──
const C = path.join(tmp, 'C')
;({ app, win } = await abrir(C))
await win.waitForSelector('text=Crea tu diario')
const r3 = await api(win, ([f]) => window.diario.backups.restaurar(f, 'clave-A-111'), bk)
ok('ok' in r3, 'instalación vacía: restaura con la contraseña del backup')
await app.close()

// ── Corte a mitad del intercambio: al arrancar se termina solo ──
// simular: carpeta .anterior con lo viejo, .restaurar con LISTO y aún sin mover a la raíz
const D = path.join(tmp, 'D')
fs.mkdirSync(path.join(D, '.anterior'), { recursive: true })
fs.mkdirSync(path.join(D, '.restaurar'), { recursive: true })
for (const n of ['vault.json', 'diario.db'])
  fs.copyFileSync(path.join(C, n), path.join(D, '.restaurar', n))
fs.writeFileSync(path.join(D, '.anterior', 'vault.json'), '{"viejo":1}')
fs.writeFileSync(path.join(D, '.restaurar', 'LISTO'), '')
;({ app, win } = await abrir(D))
await win.waitForSelector('text=Desbloquear diario')
ok(
  !fs.existsSync(path.join(D, '.anterior')) && !fs.existsSync(path.join(D, '.restaurar')),
  'restauración cortada: se terminó al arrancar'
)
await win.fill('input[placeholder="Contraseña"]', 'clave-A-111')
await win.click('text=Desbloquear diario')
await win.waitForSelector('.principal .barra')
ok(
  JSON.stringify(await titulos(win)) === JSON.stringify(['Antes del backup']),
  'y el diario restaurado abre con su contenido'
)
await app.close()

console.log('errores JS:', errores.length ? errores : 'ninguno')
