/** Dónde y de qué tamaño abrir la ventana a partir de cómo quedó (sin Electron, para probarlo). */

export interface EstadoVentana {
  x: number
  y: number
  ancho: number
  alto: number
  maximizada: boolean
}
export interface Area {
  x: number
  y: number
  width: number
  height: number
}

export const VENTANA_MIN = { ancho: 640, alto: 460 }
export const VENTANA_DEFECTO = { width: 1000, height: 700 }

/**
 * Tamaño guardado (nunca menor que el mínimo) y su posición si al menos un buen pedazo se ve en
 * alguna pantalla; si no (se desconectó un monitor), sin posición: el sistema la centra.
 */
export function ubicarVentana(
  e: EstadoVentana | undefined,
  pantallas: Area[]
): { width: number; height: number; x?: number; y?: number } {
  if (!e || ![e.x, e.y, e.ancho, e.alto].every(Number.isFinite)) return { ...VENTANA_DEFECTO }
  const width = Math.max(VENTANA_MIN.ancho, Math.round(e.ancho))
  const height = Math.max(VENTANA_MIN.alto, Math.round(e.alto))
  const visible = pantallas.some((a) => {
    const ix = Math.min(e.x + width, a.x + a.width) - Math.max(e.x, a.x)
    const iy = Math.min(e.y + height, a.y + a.height) - Math.max(e.y, a.y)
    return ix >= 120 && iy >= 80
  })
  return visible ? { width, height, x: Math.round(e.x), y: Math.round(e.y) } : { width, height }
}
