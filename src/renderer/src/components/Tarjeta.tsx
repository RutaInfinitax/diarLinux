import { Star } from 'lucide-react'
import type { ResumenEntrada } from '../../../shared/tipos'
import { es } from '../i18n'
import { IconoGrupo } from './Chips'
import { Resaltado } from './Resaltado'
import { colorChip } from '../util/chips'
import { useAjustes } from '../util/preferencias'
import { desdeIso } from '../util/fechas'
import { urlMini } from '../util/fotos'
import './tarjeta.css'

/** Tarjeta de la línea de tiempo. */
export function Tarjeta({
  e,
  alAbrir,
  conFoto = true,
  conMes = false,
  alMenu
}: {
  e: ResumenEntrada
  alAbrir: () => void
  /** Clic derecho (menú de la entrada) */
  alMenu?: (x: number, y: number) => void
  conFoto?: boolean
  /** Mes y año bajo el número (listas sin encabezados de mes: Buscar) */
  conMes?: boolean
}): React.JSX.Element {
  const d = desdeIso(e.fecha)
  const verChips = useAjustes()?.etiquetasEnListas !== false
  return (
    <button
      className="tarjeta"
      onClick={alAbrir}
      onContextMenu={
        alMenu
          ? (ev) => {
              ev.preventDefault()
              alMenu(ev.clientX, ev.clientY)
            }
          : undefined
      }
    >
      <div className="tarjeta-dia">
        <span className="tarjeta-sem">{es.diasCortos[d.getDay()].toUpperCase()}</span>
        <span className="tarjeta-num">{d.getDate()}</span>
        {conMes && (
          <span className="tarjeta-mes">
            {es.meses[d.getMonth()].slice(0, 3).toUpperCase()} {d.getFullYear()}
          </span>
        )}
      </div>
      <div className="tarjeta-cuerpo">
        {e.titulo && (
          <div className="tarjeta-titulo">
            {e.resaltado ? <Resaltado texto={e.resaltado.titulo} /> : e.titulo}
          </div>
        )}
        <div className="tarjeta-extracto">
          {e.resaltado ? <Resaltado texto={e.resaltado.extracto} /> : e.extracto}
        </div>
        {((verChips && (e.etiquetas.length > 0 || e.personas.length > 0)) ||
          e.calificacion > 0) && (
          <div className="tarjeta-chips">
            {verChips &&
              e.etiquetas.map((t) => (
                <span key={t.id} className="chip" style={colorChip(t)}>
                  <IconoGrupo tipo="etiqueta" />
                  {t.nombre}
                </span>
              ))}
            {verChips &&
              e.personas.map((p) => (
                <span key={p.id} className="chip" style={colorChip(p)}>
                  <IconoGrupo tipo="persona" />
                  {p.nombre}
                </span>
              ))}
            {e.calificacion > 0 && (
              <span className="tarjeta-estrellas" title={`${e.calificacion} de 5`}>
                {Array.from({ length: e.calificacion }, (_, i) => (
                  <Star key={i} size={11} fill="currentColor" strokeWidth={0} />
                ))}
              </span>
            )}
          </div>
        )}
      </div>
      {conFoto && e.foto && (
        <img className="tarjeta-foto" src={urlMini(e.foto)} alt="" draggable={false} />
      )}
    </button>
  )
}
