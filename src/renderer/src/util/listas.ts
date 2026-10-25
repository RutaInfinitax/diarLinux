/**
 * Tamaño de letra y ancho de las listas (Línea de tiempo, Buscar, Etiquetas, En este día), desde
 * los deslizadores de la barra lateral. Preferencia de este equipo (localStorage) aplicada como
 * variables CSS en <html>: --lista-zoom y --lista-ancho (ver app.css).
 */
export const LISTA_ZOOM = { min: 0.85, max: 1.6, defecto: 1 }
export const LISTA_ANCHO = { min: 480, max: 1800 } // el máximo = todo el ancho

const leer = (clave: string, defecto: number): number => {
  try {
    const n = Number(localStorage.getItem(clave))
    return Number.isFinite(n) && n > 0 ? n : defecto
  } catch {
    return defecto
  }
}
const guardar = (clave: string, n: number): void => {
  try {
    localStorage.setItem(clave, String(n))
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}

export const leerListas = (): { zoom: number; ancho: number } => ({
  zoom: leer('diar.listaZoom', LISTA_ZOOM.defecto),
  ancho: leer('diar.listaAncho', LISTA_ANCHO.max)
})

export function aplicarListas(zoom: number, ancho: number, recordar = true): void {
  const r = document.documentElement.style
  r.setProperty('--lista-zoom', String(zoom))
  r.setProperty('--lista-ancho', ancho >= LISTA_ANCHO.max ? 'none' : `${ancho}px`)
  if (recordar) {
    guardar('diar.listaZoom', zoom)
    guardar('diar.listaAncho', ancho)
  }
}
