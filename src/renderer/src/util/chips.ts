import { textoSobre } from '../../../shared/temas'

/**
 * Colores para elegir en etiquetas y personas. "Suaves": tonos apagados que no cansan la vista;
 * "Vivos": con más brillo (pedido del usuario: los suaves solos quedaban demasiado apagados).
 * Además se puede elegir cualquier color. El azul del tema es el predeterminado (color null).
 */
export const COLORES_SUAVES: { color: string; nombre: string }[] = [
  { color: '#3d6e6e', nombre: 'Turquesa suave' },
  { color: '#4a6b4f', nombre: 'Verde suave' },
  { color: '#626b3e', nombre: 'Oliva suave' },
  { color: '#7a6a3a', nombre: 'Ámbar suave' },
  { color: '#85603a', nombre: 'Naranja suave' },
  { color: '#7f4646', nombre: 'Rojo suave' },
  { color: '#7a4a62', nombre: 'Rosa suave' },
  { color: '#5d4a7a', nombre: 'Morado suave' },
  { color: '#4b4f86', nombre: 'Índigo suave' },
  { color: '#5a5d63', nombre: 'Gris' }
]
export const COLORES_VIVOS: { color: string; nombre: string }[] = [
  { color: '#2f80ed', nombre: 'Azul' },
  { color: '#29b6f6', nombre: 'Celeste' },
  { color: '#26a69a', nombre: 'Turquesa' },
  { color: '#43a047', nombre: 'Verde' },
  { color: '#9ccc65', nombre: 'Lima' },
  { color: '#fbc02d', nombre: 'Amarillo' },
  { color: '#fb8c00', nombre: 'Naranja' },
  { color: '#e53935', nombre: 'Rojo' },
  { color: '#ec407a', nombre: 'Rosa' },
  { color: '#ab47bc', nombre: 'Violeta' },
  { color: '#5c6bc0', nombre: 'Índigo' },
  { color: '#8d6e63', nombre: 'Marrón' }
]
export const COLORES_CHIP = [...COLORES_SUAVES, ...COLORES_VIVOS]

/** Color propio de la etiqueta o persona (si tiene), con texto que se lea; si no, el del tema. */
export function colorChip(t: { color: string | null }): React.CSSProperties | undefined {
  return t.color ? { background: t.color, color: textoSobre(t.color) } : undefined
}
