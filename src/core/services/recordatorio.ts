/** Recordatorio diario: cuándo toca avisar (sin Electron, para poder probarlo). */

/** AAAA-MM-DD en la hora local. */
export function diaLocal(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 'HH:MM' válida (00:00–23:59). */
export function horaValida(h: unknown): h is string {
  return typeof h === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(h)
}

/**
 * ¿Hay que avisar ahora? Una sola vez por día, a partir de la hora elegida. Si la app se abre
 * más tarde que esa hora (y hoy todavía no se avisó), avisa en ese momento.
 */
export function tocaRecordar(ahora: Date, hora: string, ultimoDia: string | null): boolean {
  if (!horaValida(hora)) return false
  if (ultimoDia === diaLocal(ahora)) return false
  const [h, m] = hora.split(':').map(Number)
  return ahora.getHours() * 60 + ahora.getMinutes() >= h * 60 + m
}
