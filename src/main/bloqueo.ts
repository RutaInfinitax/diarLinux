/** Bloqueo automático por inactividad y al suspender o bloquear la sesión. */
import { powerMonitor } from 'electron'
import { leerConfig } from './config'
import { diario } from './diario'

let ultima = Date.now()

export function tocarActividad(): void {
  ultima = Date.now()
}

export function iniciarBloqueoAutomatico(): void {
  setInterval(() => {
    const min = leerConfig().bloqueoMinutos
    if (diario.abierto && min > 0 && Date.now() - ultima > min * 60_000) diario.bloquear()
  }, 15_000).unref()
  powerMonitor.on('suspend', () => diario.bloquear())
  powerMonitor.on('lock-screen', () => diario.bloquear())
  diario.oyentesApertura.add(tocarActividad)
}
