// Capturas de validación visual con el diario de prueba (ventana oculta).
// Uso: node scripts/capturas.mjs <carpeta-temporal>   → docs/validacion/*.png
import { _electron as electron } from 'playwright-core'
import path from 'node:path'

const datos = path.join(process.argv[2], 'semilla')
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const app = await electron.launch({
  args: ['.'],
  env: { ...process.env, DIARLINUX_DATA: datos, DIARLINUX_SEED: '1', DIARLINUX_OCULTA: '1' }
})
const win = await app.firstWindow()
const tam = (w, h) =>
  app.evaluate(
    ({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0].setContentSize(w, h),
    [w, h]
  )
const foto = async (n) => {
  await espera(400)
  await win.screenshot({ path: `docs/validacion/${n}.png` })
}

await tam(760, 365)
await win.waitForSelector('text=Desbloquear diario', { timeout: 60000 })
await foto('0-bloqueo')
await win.fill('input[placeholder="Contraseña"]', 'diariodev')
const t0 = Date.now()
await win.click('text=Desbloquear diario')
await win.waitForSelector('.cal-grilla')
console.log('desbloqueo + calendario:', Date.now() - t0, 'ms')
await tam(680, 510)
await foto('1calendar')
// scroll fluido: medir el tiempo de 40 saltos de rueda
const t1 = Date.now()
for (let i = 0; i < 40; i++) {
  await win.mouse.move(400, 300)
  await win.mouse.wheel(0, -300)
}
console.log('40 pasos de scroll en el calendario:', Date.now() - t1, 'ms')
await foto('1calendar-scroll')
await win.click('.lateral-item:has-text("Línea de tiempo")')
await win.waitForSelector('.tarjeta')
await foto('2timeline')
await win.click('.lateral-item:has-text("Buscar")')
await foto('3s')
await win.click('.lateral-item:has-text("Línea de tiempo")')
await win.waitForSelector('.tarjeta')
await tam(900, 600)
await win.locator('.tarjeta').first().click()
await win.waitForSelector('.ed-cuerpo')
await foto('escribir')
await win.keyboard.press('Escape')
await tam(680, 510)
await win.click('.lateral-item:has-text("Configuración")')
await foto('6')
await win.click('.aj-pestanas button:has-text("Seguridad")')
await foto('seguridad')
await app.close()
