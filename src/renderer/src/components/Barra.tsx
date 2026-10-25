import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { t } from '../../../shared/i18n'
import './barra.css'

/** Barra superior del color de acento: + a la izquierda y píldora ‹ año › centrada (capturas 1-2). */
export function Barra({
  children,
  alAgregar,
  tituloAgregar = t('Nueva entrada (Ctrl+N)'),
  anio,
  cambiarAnio,
  derecha,
  abajo,
  izquierda
}: {
  children?: React.ReactNode
  alAgregar?: () => void
  tituloAgregar?: string
  anio?: number
  cambiarAnio?: (d: -1 | 1) => void
  derecha?: React.ReactNode
  abajo?: React.ReactNode
  /** Algo más a la izquierda, al lado del + */
  izquierda?: React.ReactNode
}): React.JSX.Element {
  return (
    <header className="barra">
      <div className="barra-fila">
        <div className="barra-izq">
          {alAgregar && (
            <button className="barra-boton" onClick={alAgregar} title={tituloAgregar}>
              <Plus size={20} strokeWidth={1.8} />
            </button>
          )}
          {izquierda}
        </div>
        <div className="barra-centro">
          {anio !== undefined && cambiarAnio && (
            <div className="pildora">
              <button onClick={() => cambiarAnio(-1)} title={t('Año anterior')}>
                <ChevronLeft size={17} />
              </button>
              <span>{anio}</span>
              <button onClick={() => cambiarAnio(1)} title={t('Año siguiente')}>
                <ChevronRight size={17} />
              </button>
            </div>
          )}
          {children}
        </div>
        <div className="barra-der">{derecha}</div>
      </div>
      {abajo}
    </header>
  )
}
