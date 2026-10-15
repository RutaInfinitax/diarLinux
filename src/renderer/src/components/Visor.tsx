import { useEffect } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { Adjunto } from '../../../shared/tipos'
import { urlAdjunto } from '../util/fotos'
import { t } from '../../../shared/i18n'
import './visor.css'

/** Visor de fotos y videos a pantalla completa con flechas (← → Esc). */
export function Visor({
  fotos,
  indice,
  cambiar,
  cerrar
}: {
  fotos: Adjunto[]
  indice: number
  cambiar: (i: number) => void
  cerrar: () => void
}): React.JSX.Element {
  const n = fotos.length
  useEffect(() => {
    const tecla = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') cerrar()
      else if (e.key === 'ArrowLeft') cambiar((indice - 1 + n) % n)
      else if (e.key === 'ArrowRight') cambiar((indice + 1) % n)
      else return
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('keydown', tecla, true)
    return () => window.removeEventListener('keydown', tecla, true)
  }, [indice, n, cambiar, cerrar])
  const f = fotos[indice]
  if (!f) return <></>
  return (
    <div className="visor" onClick={cerrar}>
      {f.tipo === 'video' ? (
        <video
          key={f.id}
          src={urlAdjunto(f.id)}
          controls
          autoPlay
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <img
          src={urlAdjunto(f.id)}
          alt={f.nombre}
          onClick={(e) => e.stopPropagation()}
          draggable={false}
        />
      )}
      <button className="visor-cerrar" onClick={cerrar} title="Cerrar (Esc)">
        <X size={22} />
      </button>
      {n > 1 && (
        <>
          <button
            className="visor-flecha izq"
            onClick={(e) => {
              e.stopPropagation()
              cambiar((indice - 1 + n) % n)
            }}
            title={t('Anterior (←)')}
          >
            <ChevronLeft size={34} />
          </button>
          <button
            className="visor-flecha der"
            onClick={(e) => {
              e.stopPropagation()
              cambiar((indice + 1) % n)
            }}
            title={t('Siguiente (→)')}
          >
            <ChevronRight size={34} />
          </button>
          <span className="visor-cuenta">
            {indice + 1} / {n}
          </span>
        </>
      )}
    </div>
  )
}
