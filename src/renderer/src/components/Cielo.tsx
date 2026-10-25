import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Sun
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { iconoClima, type IconoClima as Tipo } from '../../../core/services/clima'

const ICONOS: Record<Tipo, LucideIcon> = {
  despejado: Sun,
  algoNublado: CloudSun,
  nublado: Cloud,
  niebla: CloudFog,
  llovizna: CloudDrizzle,
  lluvia: CloudRain,
  nieve: CloudSnow,
  tormenta: CloudLightning
}

export function IconoClima({
  codigo,
  size = 14
}: {
  codigo: number
  size?: number
}): React.JSX.Element {
  const I = ICONOS[iconoClima(codigo)]
  return <I size={size} strokeWidth={1.8} />
}

/**
 * Luna dibujada con la parte iluminada real: `elong` 0° = nueva, 180° = llena. En el hemisferio
 * norte crece por la derecha; `sur` la espeja (así se ve desde el hemisferio sur).
 */
export function IconoLuna({
  elong,
  size = 14,
  sur = false
}: {
  elong: number
  size?: number
  sur?: boolean
}): React.JSX.Element {
  const r = 7
  const creciente = elong < 180
  // ancho del terminador: cos de la elongación (1 = nada iluminado, -1 = todo)
  const k = Math.cos((elong * Math.PI) / 180)
  const rx = Math.abs(k) * r
  // arco exterior: la mitad iluminada; arco del terminador: hacia afuera o adentro
  const lado = creciente !== sur ? 1 : 0
  const terminador = k > 0 ? 1 - lado : lado // creciente: curva hacia el lado iluminado
  const d = `M8 1 A${r} ${r} 0 0 ${lado} 8 15 A${rx} ${r} 0 0 ${terminador} 8 1 Z`
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <circle
        cx="8"
        cy="8"
        r={r}
        fill="rgba(255,255,255,0.13)"
        stroke="currentColor"
        strokeOpacity="0.45"
        strokeWidth="0.8"
      />
      <path d={d} fill="currentColor" />
    </svg>
  )
}
