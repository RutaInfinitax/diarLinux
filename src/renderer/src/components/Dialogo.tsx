/**
 * Preguntas dentro de la página (en vez de confirm()/prompt() del navegador).
 * confirm() abre una ventana nativa aparte: al cerrarse, en XWayland la ventana del diario vuelve
 * a estar activa pero Chromium no se entera (no se puede escribir) y había que "reactivarla", lo
 * que hacía parpadear la ventana. prompt() ni siquiera existe en Electron (devuelve null).
 * Esto se dibuja en la misma página: el foco nunca sale de la ventana.
 */
import { useEffect, useRef, useState } from 'react'
import { registrarDialogos, type Pedido } from '../util/dialogo'
import { t } from '../../../shared/i18n'
import './dialogo.css'

export function Dialogos(): React.JSX.Element | null {
  const [p, setP] = useState<Pedido | null>(null)
  const [valor, setValor] = useState('')
  const primero = useRef<HTMLButtonElement & HTMLInputElement>(null)

  const actual = useRef<Pedido | null>(null)

  useEffect(() => {
    registrarDialogos((n) => {
      actual.current = n
      setP(n)
      setValor(n?.inicial ?? '')
    })
    // Se registra al arrancar, antes que cualquier otro atajo: mientras hay una pregunta, ningún
    // atajo de la app (Esc de otras ventanas, Ctrl+S…) actúa detrás de ella.
    const tecla = (e: KeyboardEvent): void => {
      const q = actual.current
      if (!q) return
      e.stopImmediatePropagation()
      if (e.key === 'Escape') {
        e.preventDefault()
        q.responder(q.inicial !== undefined ? null : false)
      }
    }
    window.addEventListener('keydown', tecla, true)
    return () => {
      registrarDialogos(null)
      window.removeEventListener('keydown', tecla, true)
    }
  }, [])

  useEffect(() => {
    if (!p) return
    primero.current?.focus()
    if (p.inicial !== undefined) primero.current?.select()
  }, [p])

  if (!p) return null
  const pideTexto = p.inicial !== undefined
  const si = (): void => p.responder(pideTexto ? valor : true)
  const no = (): void => p.responder(pideTexto ? null : false)
  return (
    <div className="dlg-fondo" onMouseDown={(e) => e.target === e.currentTarget && no()}>
      <form
        className="dlg-ventana"
        role="alertdialog"
        aria-modal="true"
        onSubmit={(e) => {
          e.preventDefault()
          si()
        }}
      >
        <p className="dlg-texto">{p.texto}</p>
        {pideTexto && (
          <input
            ref={primero}
            className="dlg-campo"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
          />
        )}
        <div className="dlg-botones">
          {/* con peligro el foco queda en Cancelar: un Enter distraído no borra nada */}
          <button type="button" ref={!pideTexto && p.peligro ? primero : undefined} onClick={no}>
            {t('Cancelar')}
          </button>
          <button
            type="submit"
            ref={!pideTexto && !p.peligro ? primero : undefined}
            className={p.peligro ? 'peligro' : 'primario'}
          >
            {p.aceptar}
          </button>
        </div>
      </form>
    </div>
  )
}
