/**
 * Dónde se estaba en cada vista, para volver ahí (Atrás o al cambiar de vista) en vez de al
 * principio: el mes del calendario y la entrada de arriba de la línea de tiempo. Solo en memoria;
 * se olvida al bloquear el diario.
 */
export const recuerdos: {
  calendario: { anio: number; mes: number } | null
  timeline: string | null // id de la entrada que estaba arriba
} = { calendario: null, timeline: null }

export function olvidarLugares(): void {
  recuerdos.calendario = null
  recuerdos.timeline = null
}
