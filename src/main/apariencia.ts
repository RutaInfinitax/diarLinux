/** Tema al abrir la ventana: color de fondo y parámetros para que la ventana pinte bien desde el inicio. */
import { nativeTheme } from 'electron'
import { fondoInicial, type OpcionesApariencia } from '../shared/temas'
import { leerConfig } from './config'
import { idioma } from '../shared/i18n'

const opciones = (c: OpcionesApariencia): OpcionesApariencia => ({
  tema: c.tema,
  skin: c.skin,
  acento: c.acento,
  barra: c.barra,
  lateralTinte: c.lateralTinte,
  fondoTinte: c.fondoTinte,
  fondoLuz: c.fondoLuz,
  fondoCalidez: c.fondoCalidez,
  textoSuave: c.textoSuave
})

/** Color de fondo de la ventana con el tema/skin actual (evita un destello de otro color). */
export const fondoApariencia = (c: OpcionesApariencia = leerConfig()): string =>
  fondoInicial(opciones(c), nativeTheme.shouldUseDarkColors)

/** ?ap={...}&idioma=es|en (la ventana lo aplica antes de dibujar nada). */
export function consultaApariencia(): string {
  const ap = encodeURIComponent(JSON.stringify(opciones(leerConfig())))
  return `?ap=${ap}&idioma=${idioma()}`
}
