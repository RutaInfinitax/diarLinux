/**
 * Foco del teclado. Con XWayland, tras un rato (diálogos, el visor) los clics llegaban pero no se podía
 * escribir; era un problema de XWayland y desde que la app corre en Wayland nativo no volvió a pasar
 * (por eso se quitó la «reactivación» que bajaba y subía la ventana).
 *
 * - `app:enfocar`: pedir el foco (sirve cuando de verdad lo perdió).
 * - Registro de diagnóstico en RAM (/run/user/<uid>/diarlinux-foco.log, últimas 400 líneas): solo
 *   eventos de foco y la etiqueta del elemento tocado, NUNCA texto del diario.
 */
import { BrowserWindow, ipcMain } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const base =
  process.env.XDG_RUNTIME_DIR && fs.existsSync(process.env.XDG_RUNTIME_DIR)
    ? process.env.XDG_RUNTIME_DIR
    : os.tmpdir()
export const ARCHIVO_FOCO = path.join(
  base,
  process.env.DIARLINUX_DATA ? `diarlinux-foco-prueba-${process.pid}.log` : 'diarlinux-foco.log'
)

const lineas: string[] = []
let escribiendo = false
let pendiente = false

function volcar(): void {
  if (process.env.DIARLINUX_DATA) return // pruebas y diarios de prueba: solo en memoria
  if (escribiendo) {
    pendiente = true
    return
  }
  escribiendo = true
  fs.writeFile(ARCHIVO_FOCO, lineas.join('\n') + '\n', { mode: 0o600 }, () => {
    escribiendo = false
    if (pendiente) {
      pendiente = false
      volcar()
    }
  })
}

export function registrarFoco(m: string): void {
  const d = new Date()
  const h = d.toLocaleTimeString('es', { hour12: false })
  lineas.push(`${h}.${String(d.getMilliseconds()).padStart(3, '0')} ${m}`)
  if (lineas.length > 400) lineas.splice(0, lineas.length - 400)
  volcar()
}

export function vigilarFoco(ventana: () => BrowserWindow | null): void {
  const estado = (v: BrowserWindow): string =>
    `(ventana enfocada=${v.isFocused()} visible=${v.isVisible()} minimizada=${v.isMinimized()})`

  ipcMain.on('app:enfocar', (_e, motivo: unknown) => {
    const v = ventana()
    if (!v || v.isDestroyed()) return
    registrarFoco(`enfocar: ${String(motivo).slice(0, 80)} ${estado(v)}`)
    v.focus()
    v.webContents.focus()
  })

  ipcMain.on('app:registroFoco', (_e, m: unknown) =>
    registrarFoco('página: ' + String(m).slice(0, 160))
  )
}

/** Eventos de la ventana (se llama al crearla). */
export function registrarEventosVentana(v: BrowserWindow): void {
  for (const ev of ['focus', 'blur', 'show', 'hide', 'minimize', 'restore'] as const)
    v.on(ev as 'focus', () => registrarFoco('ventana: ' + ev))
}
