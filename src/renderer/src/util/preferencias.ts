/** Preferencias de la app compartidas por todas las vistas (se actualizan al guardar en Configuración). */
import { useSyncExternalStore } from 'react'
import type { Ajustes } from '../../../shared/tipos'
import { aplicarApariencia } from './apariencia'

let actual: Ajustes | null = null
const oyentes = new Set<() => void>()

export function publicarAjustes(a: Ajustes): void {
  actual = a
  aplicarApariencia(a)
  for (const f of oyentes) f()
}

export async function recargarAjustes(): Promise<Ajustes> {
  const a = await window.diario.ajustes.obtener()
  publicarAjustes(a)
  return a
}

export function useAjustes(): Ajustes | null {
  return useSyncExternalStore(
    (f) => {
      oyentes.add(f)
      return () => oyentes.delete(f)
    },
    () => actual
  )
}
