/** Aplica skin, tema, acento, estilo de barras y fuente del texto (variables CSS en <html>). */
import type { Ajustes, FuenteTexto } from '../../../shared/tipos'
import { calcularApariencia, type OpcionesApariencia } from '../../../shared/temas'

const FUENTES: Record<FuenteTexto, string> = {
  sans: "'Noto Sans', 'DejaVu Sans', system-ui, sans-serif",
  serif: "'Noto Serif', 'DejaVu Serif', Georgia, serif",
  mono: "'Noto Sans Mono', 'DejaVu Sans Mono', monospace",
  sistema: 'system-ui, sans-serif'
}

const sistemaOscuro = window.matchMedia('(prefers-color-scheme: dark)')
let ultimo: OpcionesApariencia | null = null
let puestas = new Set<string>() // variables que puso el skin anterior (para quitarlas al cambiar)

export const POR_DEFECTO: OpcionesApariencia = {
  tema: 'oscuro',
  skin: 'clasico',
  acento: 'azul',
  barra: 'color',
  lateralTinte: false,
  fondoTinte: false
}

export function aplicarColores(o: OpcionesApariencia): void {
  ultimo = o
  const { oscuro, vars } = calcularApariencia(o, sistemaOscuro.matches)
  const raiz = document.documentElement
  raiz.dataset.tema = oscuro ? 'oscuro' : 'claro'
  raiz.dataset.barra = o.barra
  for (const k of puestas) if (!(k in vars)) raiz.style.removeProperty(k)
  for (const [k, v] of Object.entries(vars)) raiz.style.setProperty(k, v)
  puestas = new Set(Object.keys(vars))
}

export function aplicarApariencia(a: Ajustes): void {
  aplicarColores({
    tema: a.tema,
    skin: a.skin,
    acento: a.acento,
    barra: a.barra,
    lateralTinte: a.lateralTinte,
    fondoTinte: a.fondoTinte,
    fondoLuz: a.fondoLuz,
    fondoCalidez: a.fondoCalidez,
    textoSuave: a.textoSuave
  })
  const raiz = document.documentElement
  raiz.style.setProperty('--fuente-texto', FUENTES[a.fuenteTexto] ?? FUENTES.sans)
  raiz.style.setProperty('--texto-tam', `${a.tamTexto}px`)
}

// "Sistema": seguir al escritorio si cambia entre claro y oscuro
sistemaOscuro.addEventListener('change', () => {
  if (ultimo?.tema === 'sistema') aplicarColores(ultimo)
})
