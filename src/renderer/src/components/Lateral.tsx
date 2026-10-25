import {
  ArrowLeft,
  MoveHorizontal,
  Type,
  CalendarDays,
  History,
  Rows3,
  Save,
  Search,
  Settings,
  Share,
  Tag
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { es } from '../i18n'
import { aplicarListas, leerListas, LISTA_ANCHO, LISTA_ZOOM } from '../util/listas'
import { t } from '../../../shared/i18n'
import './lateral.css'

export type Vista = 'calendario' | 'timeline' | 'buscar' | 'etiquetas' | 'exportar' | 'enEsteDia'

const ITEMS: { id: Vista; texto: string; icono: LucideIcon }[] = [
  { id: 'calendario', texto: es.nav.calendario, icono: CalendarDays },
  { id: 'timeline', texto: es.nav.timeline, icono: Rows3 },
  { id: 'buscar', texto: es.nav.buscar, icono: Search },
  { id: 'etiquetas', texto: es.nav.etiquetas, icono: Tag },
  { id: 'exportar', texto: es.nav.exportar, icono: Share },
  { id: 'enEsteDia', texto: es.nav.enEsteDia, icono: History }
]

interface Props {
  actual: Vista | null
  ir: (v: Vista) => void
  abrirAjustes: () => void
  inactiva?: boolean
  /** Atrás: vuelve a la vista o entrada anterior */
  atras: { activo: boolean; accion: () => void }
  /** Botón Guardar: solo sirve con una entrada abierta */
  guardar: { activo: boolean; pendiente: boolean; accion: () => void }
}

export function Lateral({
  actual,
  ir,
  abrirAjustes,
  inactiva,
  atras,
  guardar
}: Props): React.JSX.Element {
  return (
    <nav className={'lateral' + (inactiva ? ' inactiva' : '')} aria-disabled={inactiva}>
      <div className="lateral-items">
        <button
          className="lateral-item lateral-atras"
          onClick={atras.accion}
          disabled={!atras.activo}
          tabIndex={inactiva ? -1 : 0}
          title={t('Volver a donde estabas (Alt+←)')}
        >
          <ArrowLeft size={17} strokeWidth={1.7} className="lateral-ic" />
          <span>{es.nav.atras}</span>
        </button>
        {ITEMS.map(({ id, texto, icono: Icono }) => (
          <button
            key={id}
            className={'lateral-item' + (actual === id ? ' sel' : '')}
            onClick={() => ir(id)}
            tabIndex={inactiva ? -1 : 0}
          >
            <Icono size={17} strokeWidth={1.7} className="lateral-ic" />
            <span>{texto}</span>
          </button>
        ))}
        <button
          className={'lateral-item lateral-guardar' + (guardar.pendiente ? ' pendiente' : '')}
          onClick={guardar.accion}
          disabled={!guardar.activo}
          tabIndex={inactiva ? -1 : 0}
          title={
            guardar.activo
              ? t(
                  'Guardar la entrada ahora (Ctrl+S). La cuenta del guardado automático vuelve a empezar.'
                )
              : t('Abre una entrada para guardarla')
          }
        >
          <Save size={17} strokeWidth={1.7} className="lateral-ic" />
          <span>{es.nav.guardar}</span>
          {guardar.pendiente && (
            <i className="lateral-punto" title={t('Hay cambios sin guardar')} />
          )}
        </button>
      </div>
      <div className="lateral-items abajo">
        <AjustesListas inactiva={!!inactiva} />
        <button className="lateral-item" onClick={abrirAjustes} tabIndex={inactiva ? -1 : 0}>
          <Settings size={17} strokeWidth={1.7} className="lateral-ic" />
          <span>{es.nav.configuracion}</span>
        </button>
      </div>
    </nav>
  )
}

/**
 * Letra y ancho de las listas (Línea de tiempo, Buscar, Etiquetas, En este día), como el ancho del
 * texto en las entradas. Doble clic: vuelve al valor normal.
 */
function AjustesListas({ inactiva }: { inactiva: boolean }): React.JSX.Element {
  const [v, setV] = useState(leerListas)
  useEffect(() => {
    aplicarListas(v.zoom, v.ancho, false) // al abrir la app
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo una vez
  }, [])
  const cambiar = (c: Partial<typeof v>): void => {
    const n = { ...v, ...c }
    setV(n)
    aplicarListas(n.zoom, n.ancho)
  }
  return (
    <div className="lateral-listas" title={t('Letra y ancho de las listas')}>
      <label title={t('Tamaño de la letra de las listas (doble clic: normal)')}>
        <Type size={15} strokeWidth={1.8} className="lateral-ic" />
        <input
          type="range"
          min={LISTA_ZOOM.min}
          max={LISTA_ZOOM.max}
          step={0.05}
          value={v.zoom}
          tabIndex={inactiva ? -1 : 0}
          aria-label={t('Tamaño de la letra de las listas')}
          onChange={(e) => cambiar({ zoom: Number(e.target.value) })}
          onDoubleClick={() => cambiar({ zoom: LISTA_ZOOM.defecto })}
        />
      </label>
      <label title={t('Ancho de las listas (doble clic: todo el ancho)')}>
        <MoveHorizontal size={15} strokeWidth={1.8} className="lateral-ic" />
        <input
          type="range"
          min={LISTA_ANCHO.min}
          max={LISTA_ANCHO.max}
          step={20}
          value={v.ancho}
          tabIndex={inactiva ? -1 : 0}
          aria-label={t('Ancho de las listas')}
          onChange={(e) => cambiar({ ancho: Number(e.target.value) })}
          onDoubleClick={() => cambiar({ ancho: LISTA_ANCHO.max })}
        />
      </label>
    </div>
  )
}
