/**
 * Buscar (captura 3s.png): campo en la barra, búsqueda instantánea (FTS5, 200 ms) y botón de filtros.
 * Resultados como tarjetas de la línea de tiempo con lo encontrado resaltado.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, SlidersHorizontal, Star, X } from 'lucide-react'
import { Virtuoso } from 'react-virtuoso'
import type {
  Etiqueta,
  FiltrosBusqueda,
  ResumenEntrada,
  TipoAdjunto,
  TipoGrupo
} from '../../../shared/tipos'
import { Barra } from '../components/Barra'
import { IconoGrupo } from '../components/Chips'
import { Tarjeta } from '../components/Tarjeta'
import { es } from '../i18n'
import { colorChip } from '../util/chips'
import type { Destino } from './Editor'
import { t } from '../../../shared/i18n'
import './buscar.css'

const VACIOS: FiltrosBusqueda = {
  texto: '',
  etiquetas: [],
  personas: [],
  calificacionMin: 0,
  con: []
}

// Se conserva al abrir una entrada y volver
const recuerdo: { f: FiltrosBusqueda; abiertos: boolean } = { f: VACIOS, abiertos: false }

const TIPOS: { id: TipoAdjunto; texto: string }[] = [
  { id: 'photo', texto: es.buscar.fotos },
  { id: 'video', texto: es.buscar.videos },
  { id: 'audio', texto: es.buscar.audio },
  { id: 'file', texto: es.buscar.archivos }
]

function cuantosFiltros(f: FiltrosBusqueda): number {
  return (
    (f.desde ? 1 : 0) +
    (f.hasta ? 1 : 0) +
    (f.calificacionMin ? 1 : 0) +
    (f.con?.length ?? 0) +
    (f.etiquetas?.length ?? 0) +
    (f.personas?.length ?? 0)
  )
}

export function Buscar({
  version,
  abrir,
  escVuelve = false
}: {
  version: number
  abrir: (d: Destino) => void
  /** Se llegó con Ctrl+F: Esc vuelve a donde estabas (lo maneja App), no borra el texto */
  escVuelve?: boolean
}): React.JSX.Element {
  const [f, setF] = useState<FiltrosBusqueda>(recuerdo.f)
  const [abiertos, setAbiertos] = useState(recuerdo.abiertos)
  const [res, setRes] = useState<{ para: FiltrosBusqueda; lista: ResumenEntrada[] } | null>(null)
  const [grupos, setGrupos] = useState<Record<TipoGrupo, Etiqueta[]>>({ etiqueta: [], persona: [] })
  const campo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    recuerdo.f = f
    recuerdo.abiertos = abiertos
  }, [f, abiertos])

  useEffect(() => {
    void Promise.all([window.diario.etiquetas.listar(), window.diario.personas.listar()]).then(
      ([etiqueta, persona]) => setGrupos({ etiqueta, persona })
    )
  }, [version])

  // Búsqueda con 200 ms de espera mientras se escribe
  useEffect(() => {
    let cancelado = false
    const t = setTimeout(() => {
      void window.diario.entradas.buscar(f).then((lista) => {
        if (!cancelado) setRes({ para: f, lista })
      })
    }, 200)
    return () => {
      cancelado = true
      clearTimeout(t)
    }
  }, [f, version])

  const cambiar = (c: Partial<FiltrosBusqueda>): void => setF((x) => ({ ...x, ...c }))
  const alternar = <T,>(l: T[] | undefined, v: T): T[] =>
    l?.includes(v) ? l.filter((x) => x !== v) : [...(l ?? []), v]

  const activos = cuantosFiltros(f)
  const hayBusqueda = f.texto.trim() !== '' || activos > 0
  const lista = useMemo(() => (hayBusqueda ? (res?.lista ?? null) : null), [hayBusqueda, res])

  const campoBusqueda = (
    <div className="bus-campo">
      <Search size={15} strokeWidth={1.8} />
      <input
        ref={campo}
        autoFocus
        value={f.texto}
        placeholder={es.buscar.campo}
        onChange={(e) => cambiar({ texto: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && f.texto && !escVuelve) {
            e.stopPropagation()
            cambiar({ texto: '' })
          }
        }}
      />
      {f.texto && (
        <button
          title={t('Borrar')}
          onClick={() => {
            cambiar({ texto: '' })
            campo.current?.focus()
          }}
        >
          <X size={14} />
        </button>
      )}
    </div>
  )

  const botonFiltros = (
    <button
      className={'barra-boton bus-filtros-boton' + (abiertos ? ' activo' : '')}
      title={es.buscar.filtros}
      aria-expanded={abiertos}
      onClick={() => setAbiertos((v) => !v)}
    >
      <SlidersHorizontal size={18} strokeWidth={1.7} />
      {activos > 0 && <span className="bus-insignia">{activos}</span>}
    </button>
  )

  return (
    <>
      <Barra derecha={botonFiltros}>{campoBusqueda}</Barra>
      <div className="contenido bus">
        {abiertos && (
          <div className="bus-panel">
            <label>{es.buscar.desde}</label>
            <div className="bus-fila">
              <input
                type="date"
                value={f.desde ?? ''}
                onChange={(e) => cambiar({ desde: e.target.value || undefined })}
              />
              <span className="bus-tenue">{es.buscar.hasta}</span>
              <input
                type="date"
                value={f.hasta ?? ''}
                onChange={(e) => cambiar({ hasta: e.target.value || undefined })}
              />
            </div>
            <label>{es.buscar.calificacion}</label>
            <div className="bus-fila bus-estrellas">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  title={t('{n} o más', { n })}
                  onClick={() => cambiar({ calificacionMin: f.calificacionMin === n ? 0 : n })}
                >
                  <Star
                    size={18}
                    strokeWidth={1.5}
                    fill={n <= (f.calificacionMin ?? 0) ? 'currentColor' : 'none'}
                  />
                </button>
              ))}
            </div>
            <label>{es.buscar.contiene}</label>
            <div className="bus-fila">
              {TIPOS.map((t) => (
                <button
                  key={t.id}
                  className={'bus-opcion' + (f.con?.includes(t.id) ? ' sel' : '')}
                  aria-pressed={!!f.con?.includes(t.id)}
                  onClick={() => cambiar({ con: alternar(f.con, t.id) })}
                >
                  {t.texto}
                </button>
              ))}
            </div>
            {(['etiqueta', 'persona'] as const).map(
              (tipo) =>
                grupos[tipo].length > 0 && (
                  <FiltroGrupo
                    key={tipo}
                    tipo={tipo}
                    todos={grupos[tipo]}
                    elegidos={(tipo === 'etiqueta' ? f.etiquetas : f.personas) ?? []}
                    alternar={(id) =>
                      tipo === 'etiqueta'
                        ? cambiar({ etiquetas: alternar(f.etiquetas, id) })
                        : cambiar({ personas: alternar(f.personas, id) })
                    }
                  />
                )
            )}
            {activos > 0 && (
              <button
                className="bus-limpiar"
                onClick={() => setF((x) => ({ ...VACIOS, texto: x.texto }))}
              >
                {es.buscar.limpiar}
              </button>
            )}
          </div>
        )}

        {!hayBusqueda && <div className="bus-aviso">{es.buscar.inicio}</div>}
        {lista && lista.length === 0 && <div className="bus-aviso">{es.buscar.nada}</div>}
        {lista && lista.length > 0 && (
          <>
            <div className="bus-cantidad">{es.buscar.cantidad(lista.length)}</div>
            <Virtuoso
              className="bus-lista"
              data={lista}
              increaseViewportBy={400}
              itemContent={(_, e) => (
                <div style={{ padding: '0 4px 4px' }}>
                  <Tarjeta e={e} conMes alAbrir={() => abrir({ id: e.id, fecha: e.fecha })} />
                </div>
              )}
            />
          </>
        )}
      </div>
    </>
  )
}

function FiltroGrupo({
  tipo,
  todos,
  elegidos,
  alternar
}: {
  tipo: TipoGrupo
  todos: Etiqueta[]
  elegidos: string[]
  alternar: (id: string) => void
}): React.JSX.Element {
  return (
    <>
      <label>{tipo === 'etiqueta' ? es.buscar.etiquetas : es.buscar.personas}</label>
      <div className="bus-fila bus-chips">
        {todos.map((t) => {
          const sel = elegidos.includes(t.id)
          return (
            <button
              key={t.id}
              className={'chip bus-chip' + (sel ? ' sel' : '')}
              style={sel ? colorChip(t) : undefined}
              aria-pressed={sel}
              onClick={() => alternar(t.id)}
            >
              <IconoGrupo tipo={tipo} />
              {t.nombre}
            </button>
          )
        })}
      </div>
    </>
  )
}
