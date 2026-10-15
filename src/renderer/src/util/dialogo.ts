import { t } from '../../../shared/i18n'
/** Preguntas dentro de la página: ver components/Dialogo.tsx. */
export interface Pedido {
  texto: string
  aceptar: string
  peligro: boolean
  /** con valor inicial: pide un texto (como prompt) */
  inicial?: string
  responder: (r: string | boolean | null) => void
}

let mostrar: ((p: Pedido | null) => void) | null = null

/** Lo llama <Dialogos/> al montarse (null al desmontarse). */
export function registrarDialogos(f: typeof mostrar): void {
  mostrar = f
}
let abierto = false

/** Hay una pregunta en pantalla (los atajos de teclado de otras partes la dejan en paz). */
export const hayDialogo = (): boolean => abierto

function pedir(p: Omit<Pedido, 'responder'>): Promise<string | boolean | null> {
  return new Promise((ok) => {
    if (!mostrar) return ok(p.inicial !== undefined ? null : false)
    const anterior = document.activeElement as HTMLElement | null
    abierto = true
    mostrar({
      ...p,
      responder: (r) => {
        abierto = false
        mostrar?.(null)
        if (anterior?.isConnected) anterior.focus({ preventScroll: true })
        ok(r)
      }
    })
  })
}

export const confirmar = (
  texto: string,
  op: { aceptar?: string; peligro?: boolean } = {}
): Promise<boolean> =>
  pedir({ texto, aceptar: op.aceptar ?? t('Aceptar'), peligro: !!op.peligro }) as Promise<boolean>

export const pedirTexto = (texto: string, inicial = ''): Promise<string | null> =>
  pedir({ texto, aceptar: t('Aceptar'), peligro: false, inicial }) as Promise<string | null>
