/**
 * Recordar cómo quedó la ventana (si no, siempre abriría chica aunque se cerrara
 * maximizada). Se guarda en config.json: tamaño y posición "normales" y si estaba maximizada; al
 * abrir se usa eso. Si la posición quedó fuera de las pantallas actuales (otro monitor), se centra.
 */
import { BrowserWindow, screen } from 'electron'
import { guardarConfig, leerConfig } from './config'
import { ubicarVentana, type EstadoVentana } from '../core/services/ventana'

export type { EstadoVentana }

/** Tamaño y posición para crear la ventana. */
export function medidasIniciales(): { width: number; height: number; x?: number; y?: number } {
  return ubicarVentana(
    leerConfig().ventana,
    screen.getAllDisplays().map((d) => d.workArea)
  )
}

export const abrirMaximizada = (): boolean => !!leerConfig().ventana?.maximizada

/** Va guardando el estado (al mover, cambiar el tamaño, maximizar y al cerrar). */
export function recordarVentana(v: BrowserWindow): void {
  let espera: ReturnType<typeof setTimeout> | null = null
  const guardar = (): void => {
    if (v.isDestroyed() || v.isMinimized()) return
    const maximizada = v.isMaximized()
    let n = v.getNormalBounds() // el tamaño "de ventana", aunque ahora esté maximizada
    // Si se abrió ya maximizada, Electron (X11) no sabe su tamaño normal y devuelve el maximizado:
    // se conserva el tamaño normal que estaba guardado (así al desmaximizar vuelve a ese).
    const antes = leerConfig().ventana
    const b = v.getBounds()
    if (maximizada && antes && n.width === b.width && n.height === b.height)
      n = { x: antes.x, y: antes.y, width: antes.ancho, height: antes.alto }
    guardarConfig({
      ventana: { x: n.x, y: n.y, ancho: n.width, alto: n.height, maximizada }
    })
  }
  const luego = (): void => {
    if (espera) clearTimeout(espera)
    espera = setTimeout(guardar, 600)
  }
  v.on('resize', luego)
  v.on('move', luego)
  v.on('maximize', guardar)
  v.on('unmaximize', guardar)
  v.on('close', () => {
    if (espera) clearTimeout(espera)
    guardar()
  })
}
