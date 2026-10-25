// Bandeja del sistema DE VERDAD (KDE): aparece un ícono real unos segundos en la bandeja del usuario.
// No va en la tanda normal de pruebas. Uso: node scripts/e2e-bandeja.mjs <tmp>
import { _electron as electron } from 'playwright-core'
import { exec } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const datos = path.join(process.argv[2], 'diario')
let fallas = 0
const ok = (c, m) => {
  if (!c) fallas++
  console.log((c ? 'OK   ' : 'FALLA') + ' ' + m)
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const ej = (c) =>
  new Promise((r) => exec(c, { timeout: 5000 }, (e, o) => r(e ? '' : o.toString().trim())))
const app = await electron.launch({
  args: ['.'],
  env: { ...process.env, DIARLINUX_DATA: datos, DIARLINUX_OCULTA: '1', DIARLINUX_BANDEJA_REAL: '1' }
})
const pid = await app.evaluate(() => process.pid)
const iconos = async () =>
  (
    await ej(
      'qdbus6 org.kde.StatusNotifierWatcher /StatusNotifierWatcher org.kde.StatusNotifierWatcher.RegisteredStatusNotifierItems'
    )
  )
    .split('\n')
    .filter((l) => l.includes(`-${pid}-`))
const win = await app.firstWindow()
await win.waitForSelector('text=Crea tu diario')
await win.fill('input[placeholder="Contraseña"]', 'clave-bandeja')
await win.fill('input[placeholder="Repetir la contraseña"]', 'clave-bandeja')
await win.click('text=Crear diario')
await win.waitForSelector('.bloqueo-codigo', { timeout: 20000 })
await win.check('.bloqueo-check input')
await win.click('text=Continuar')
await win.waitForSelector('.cal-grilla')
ok((await iconos()).length === 0, 'sin la opción: no hay ícono')

await win.click('.lateral-item:has-text("Configuración")')
await win.click('.aj-pestanas button:has-text("Notificaciones")')
const bandeja = win.locator('label:has-text("Mostrar el ícono en la bandeja") input')
// las casillas se marcan cuando la configuración se guardó (un instante después del clic)
const poner = async (loc, valor) => {
  if ((await loc.isChecked()) !== valor) await loc.click()
  await win.waitForFunction(
    ([sel, v]) => document.querySelector(sel)?.checked === v,
    [
      await loc.evaluate((e) => {
        e.dataset.prueba = e.dataset.prueba || Math.random().toString(36).slice(2)
        return `[data-prueba="${e.dataset.prueba}"]`
      }),
      valor
    ]
  )
}
for (let vuelta = 1; vuelta <= 3; vuelta++) {
  await poner(bandeja, true)
  await espera(1200)
  ok((await iconos()).length === 1, `vuelta ${vuelta}: al activarla aparece UN ícono`)
  await poner(bandeja, false)
  await espera(1200)
  ok((await iconos()).length === 0, `vuelta ${vuelta}: al desactivarla desaparece`)
}
await poner(bandeja, true)
await poner(win.locator('label:has-text("Al cerrar la ventana") input'), true)
await poner(win.locator('label:has-text("Abrir diarLinux al iniciar") input'), true)
await espera(1200)
const nombre = (await iconos())[0]?.split('/')[0]
ok(!!nombre, 'las tres opciones activadas: ícono presente')
ok(
  fs.existsSync(path.join(datos, 'autostart', 'diarlinux.desktop')),
  'iniciar con la sesión: .desktop creado'
)
const menu = await ej(
  `busctl --user call -- ${nombre} /MenuBar com.canonical.dbusmenu GetLayout iias 0 -1 0`
)
ok(
  ['Abrir diarLinux', 'Nueva entrada', 'Bloquear', 'Salir'].every((t) => menu.includes(`"${t}"`)),
  'menú: Abrir, Nueva entrada, Bloquear, Salir'
)

// cerrar la ventana la esconde (sigue viva y con ícono)
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
await espera(600)
ok(
  (await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)) === 1,
  'cerrar la ventana la esconde en la bandeja'
)
ok((await iconos()).length === 1, '…y el ícono sigue ahí')
// "Bloquear" desde el menú
await ej(
  `busctl --user call -- ${nombre} /MenuBar com.canonical.dbusmenu Event isvu 3 clicked s "" 0`
)
await espera(800)
ok(
  await win.locator('input[placeholder="Contraseña"]').isVisible(),
  'menú → Bloquear bloquea el diario'
)
// "Salir" desde el menú cierra la app y el ícono se va
const cerrada = new Promise((r) => app.on('close', r))
await ej(
  `busctl --user call -- ${nombre} /MenuBar com.canonical.dbusmenu Event isvu 5 clicked s "" 0`
)
await Promise.race([cerrada, espera(8000)])
await espera(800)
ok((await iconos()).length === 0, 'menú → Salir cierra la app y quita el ícono')
console.log(fallas ? `\n${fallas} FALLAS` : '\nTODO OK')
process.exit(fallas ? 1 : 0)
