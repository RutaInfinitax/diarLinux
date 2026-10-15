/**
 * Etiquetas y Personas (captura 4.png): pestañas en la barra, orden por nombre o cantidad,
 * filas con la insignia del conteo. Clic → entradas; clic derecho (o ⋯) → renombrar, color,
 * fusionar, eliminar. Sin Seguimiento (decisión del usuario).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronLeft,
  MoreHorizontal,
  Tag,
  User
} from 'lucide-react'
import type { Etiqueta, ResumenEntrada, TipoGrupo } from '../../../shared/tipos'
import { Barra } from '../components/Barra'
import { IconoGrupo, Paleta } from '../components/Chips'
import { Tarjeta } from '../components/Tarjeta'
import { es } from '../i18n'
import { colorChip } from '../util/chips'
import type { Destino } from './Editor'
import './etiquetas.css'
import { confirmar } from '../util/dialogo'
import { t, tn } from '../../../shared/i18n'

type Orden = 'nombre' | 'cantidad'

// Lo que se ve al volver desde una entrada abierta (la vista se desmonta al abrir el editor)
const recuerdo: { tipo: TipoGrupo; orden: Orden; sel: string | null } = {
  tipo: 'etiqueta',
  orden: 'nombre',
  sel: null
}

const api = (t: TipoGrupo): typeof window.diario.etiquetas =>
  t === 'etiqueta' ? window.diario.etiquetas : window.diario.personas

type Flotante =
  | { que: 'menu'; item: Etiqueta; x: number; y: number }
  | { que: 'color'; item: Etiqueta; x: number; y: number }
  | null

export function Etiquetas({
  version,
  abrir,
  alCambiar
}: {
  version: number
  abrir: (d: Destino) => void
  alCambiar: () => void
}): React.JSX.Element {
  const [tipo, setTipo] = useState<TipoGrupo>(recuerdo.tipo)
  const [orden, setOrden] = useState<Orden>(recuerdo.orden)
  const [lista, setLista] = useState<Etiqueta[] | null>(null)
  const [sel, setSel] = useState<string | null>(recuerdo.sel)
  // Entradas de la etiqueta/persona abierta (`de` evita mostrar las de la anterior mientras carga)
  const [deSel, setEntradas] = useState<{ de: string; lista: ResumenEntrada[] } | null>(null)
  const [flotante, setFlotante] = useState<Flotante>(null)
  const [menuOrden, setMenuOrden] = useState(false)
  const [renombrando, setRenombrando] = useState<string | null>(null)
  const [fusionando, setFusionando] = useState<Etiqueta | null>(null)
  const [error, setError] = useState('')
  const [creando, setCreando] = useState(false)

  useEffect(() => {
    recuerdo.tipo = tipo
    recuerdo.orden = orden
    recuerdo.sel = sel
  }, [tipo, orden, sel])

  const cargar = useCallback(() => api(tipo).listar().then(setLista), [tipo])

  useEffect(() => {
    void cargar()
  }, [cargar, version])

  useEffect(() => {
    if (!sel) return
    let cancelado = false
    void api(tipo)
      .entradas(sel)
      .then((lista) => !cancelado && setEntradas({ de: sel, lista }))
    return () => {
      cancelado = true
    }
  }, [tipo, sel, version])

  useEffect(() => {
    if (!flotante && !menuOrden) return
    const cerrar = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setFlotante(null)
        setMenuOrden(false)
      }
    }
    window.addEventListener('keydown', cerrar)
    return () => window.removeEventListener('keydown', cerrar)
  }, [flotante, menuOrden])

  const ordenada = useMemo(() => {
    const l = [...(lista ?? [])]
    if (orden === 'cantidad')
      l.sort(
        (a, b) =>
          (b.cantidad ?? 0) - (a.cantidad ?? 0) ||
          a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
      )
    return l
  }, [lista, orden])

  const hacer = async (fn: () => Promise<unknown>): Promise<void> => {
    setError('')
    try {
      await fn()
      await cargar()
      alCambiar()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const cambiarTipo = (t: TipoGrupo): void => {
    setTipo(t)
    setSel(null)
    setFlotante(null)
    setRenombrando(null)
    setCreando(false)
    setError('')
  }

  const crear = (nombre: string, color: string | null): void => {
    const minus = (x: string): string => x.toLocaleLowerCase('es')
    if (lista?.some((x) => minus(x.nombre) === minus(nombre))) {
      setError(tipo === 'etiqueta' ? es.grupos.yaExisteEtiqueta : es.grupos.yaExistePersona)
      return
    }
    setCreando(false)
    void hacer(async () => {
      const t = await api(tipo).crear(nombre)
      if (color) await api(tipo).color(t.id, color)
    })
  }

  const abrirMenu = (item: Etiqueta, x: number, y: number): void =>
    setFlotante({ que: 'menu', item, x, y })

  // Si lo elegido ya no existe (fusionado o eliminado) se vuelve a la lista
  const elegido = sel ? lista?.find((x) => x.id === sel) : undefined
  const entradas = elegido && deSel?.de === elegido.id ? deSel.lista : null

  const pestanas = (
    <div className="eti-pestanas" role="tablist">
      {(['etiqueta', 'persona'] as const).map((t) => {
        const Icono = t === 'etiqueta' ? Tag : User
        return (
          <button
            key={t}
            role="tab"
            aria-selected={tipo === t}
            className={tipo === t ? 'sel' : ''}
            onClick={() => cambiarTipo(t)}
          >
            <Icono size={15} strokeWidth={1.7} />
            {t === 'etiqueta' ? es.grupos.etiquetas : es.grupos.personas}
          </button>
        )
      })}
      <div className="eti-orden">
        <button title={es.grupos.ordenar} onClick={() => setMenuOrden((v) => !v)}>
          <ArrowUpDown size={15} strokeWidth={1.7} />
          <ChevronDown size={12} />
        </button>
        {menuOrden && (
          <div className="eti-menu eti-menu-orden" onMouseLeave={() => setMenuOrden(false)}>
            {(['nombre', 'cantidad'] as const).map((o) => (
              <button
                key={o}
                onClick={() => {
                  setOrden(o)
                  setMenuOrden(false)
                }}
              >
                <span className="eti-check">{orden === o && <Check size={14} />}</span>
                {o === 'nombre' ? es.grupos.porNombre : es.grupos.porCantidad}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <>
      <Barra
        alAgregar={() => {
          setSel(null)
          setRenombrando(null)
          setError('')
          setCreando(true)
        }}
        tituloAgregar={tipo === 'etiqueta' ? es.grupos.nuevaEtiqueta : es.grupos.nuevaPersona}
      >
        {pestanas}
      </Barra>
      <div className="contenido eti">
        {error && (
          <div className="eti-error" onClick={() => setError('')}>
            {error}
          </div>
        )}

        {elegido ? (
          <>
            <div className="eti-detalle">
              <button className="eti-volver" onClick={() => setSel(null)} title={es.grupos.volver}>
                <ChevronLeft size={18} />
              </button>
              <span className="chip eti-chip-grande" style={colorChip(elegido)}>
                <IconoGrupo tipo={tipo} />
                {elegido.nombre}
              </span>
              <span className="eti-detalle-cant">
                {tn(elegido.cantidad ?? 0, t('1 entrada'), t('{n} entradas'))}
              </span>
              <button
                className="eti-mas"
                title={es.grupos.opciones}
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect()
                  abrirMenu(elegido, r.right - 190, r.bottom + 4)
                }}
              >
                <MoreHorizontal size={18} />
              </button>
            </div>
            {entradas && entradas.length === 0 && (
              <div className="eti-vacio">{es.grupos.sinEntradas}</div>
            )}
            <div className="eti-entradas">
              {entradas?.map((e) => (
                <Tarjeta key={e.id} e={e} alAbrir={() => abrir({ id: e.id, fecha: e.fecha })} />
              ))}
            </div>
          </>
        ) : (
          <>
            {creando && (
              <NuevaFila tipo={tipo} alCrear={crear} alCancelar={() => setCreando(false)} />
            )}
            {lista && lista.length === 0 && !creando && (
              <div className="eti-vacio">
                {tipo === 'etiqueta' ? es.grupos.vacioEtiquetas : es.grupos.vacioPersonas}
              </div>
            )}
            <div className="eti-lista">
              {ordenada.map((t) =>
                renombrando === t.id ? (
                  <Renombrar
                    key={t.id}
                    inicial={t.nombre}
                    alTerminar={(n) => {
                      setRenombrando(null)
                      if (n && n !== t.nombre) void hacer(() => api(tipo).renombrar(t.id, n))
                    }}
                  />
                ) : (
                  <div
                    key={t.id}
                    className="eti-fila"
                    role="button"
                    tabIndex={0}
                    onClick={() => setSel(t.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') setSel(t.id)
                      if (e.key === 'F2') setRenombrando(t.id)
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      abrirMenu(t, e.clientX, e.clientY)
                    }}
                  >
                    <span className="eti-nombre">{t.nombre}</span>
                    <button
                      className="eti-mas"
                      title={es.grupos.opciones}
                      onClick={(e) => {
                        e.stopPropagation()
                        const r = e.currentTarget.getBoundingClientRect()
                        abrirMenu(t, r.right - 190, r.bottom + 4)
                      }}
                    >
                      <MoreHorizontal size={18} />
                    </button>
                    <span className="eti-cant" style={colorChip(t)}>
                      {t.cantidad ?? 0}
                    </span>
                  </div>
                )
              )}
            </div>
          </>
        )}
      </div>

      {flotante && (
        <div
          className="eti-capa"
          onMouseDown={() => setFlotante(null)}
          onContextMenu={(e) => {
            e.preventDefault()
            setFlotante(null)
          }}
        >
          {flotante.que === 'menu' ? (
            <Posicionado x={flotante.x} y={flotante.y} className="eti-menu">
              <button
                onClick={() => {
                  setFlotante(null)
                  setSel(null)
                  setRenombrando(flotante.item.id)
                }}
              >
                {es.grupos.renombrar}
              </button>
              <button onClick={() => setFlotante({ ...flotante, que: 'color' })}>
                {es.grupos.cambiarColor}
              </button>
              <button
                disabled={(lista?.length ?? 0) < 2}
                onClick={() => {
                  setFlotante(null)
                  setFusionando(flotante.item)
                }}
              >
                {es.grupos.fusionar}
              </button>
              <button
                className="peligro"
                onClick={() => {
                  const it = flotante.item
                  setFlotante(null)
                  void confirmar(es.grupos.confirmarEliminar(tipo, it.nombre, it.cantidad ?? 0), {
                    aceptar: es.grupos.eliminar,
                    peligro: true
                  }).then((ok) => {
                    if (ok) void hacer(() => api(tipo).eliminar(it.id))
                  })
                }}
              >
                {es.grupos.eliminar}
              </button>
            </Posicionado>
          ) : (
            <Posicionado x={flotante.x} y={flotante.y} className="eti-menu eti-colores">
              <Paleta
                valor={flotante.item.color}
                alElegir={(c) => {
                  const it = flotante.item
                  setFlotante(null)
                  void hacer(() => api(tipo).color(it.id, c))
                }}
              />
            </Posicionado>
          )}
        </div>
      )}

      {fusionando && (
        <Fusionar
          origen={fusionando}
          otras={(lista ?? []).filter((x) => x.id !== fusionando.id)}
          cerrar={() => setFusionando(null)}
          alFusionar={(destino) => {
            const o = fusionando
            setFusionando(null)
            if (sel === o.id) setSel(destino.id)
            void hacer(() => api(tipo).fusionar(o.id, destino.id))
          }}
        />
      )}
    </>
  )
}

/** Caja flotante en (x, y) que no se sale de la ventana. */
function Posicionado({
  x,
  y,
  className,
  children
}: {
  x: number
  y: number
  className: string
  children: React.ReactNode
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({
      left: Math.max(6, Math.min(x, window.innerWidth - r.width - 6)),
      top: Math.max(6, Math.min(y, window.innerHeight - r.height - 6))
    })
  }, [x, y])
  return (
    <div
      ref={ref}
      className={className}
      style={{ position: 'fixed', ...pos }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  )
}

/** Fila para crear una etiqueta o persona con el + de la barra: nombre y color. */
function NuevaFila({
  tipo,
  alCrear,
  alCancelar
}: {
  tipo: TipoGrupo
  alCrear: (nombre: string, color: string | null) => void
  alCancelar: () => void
}): React.JSX.Element {
  const [v, setV] = useState('')
  const [color, setColor] = useState<string | null>(null)
  return (
    <div className="eti-fila editando eti-nueva">
      <IconoGrupo tipo={tipo} />
      <input
        className="eti-renombrar"
        autoFocus
        value={v}
        maxLength={60}
        placeholder={tipo === 'etiqueta' ? es.grupos.nombreEtiqueta : es.grupos.nombrePersona}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && v.trim()) alCrear(v.trim(), color)
          if (e.key === 'Escape') alCancelar()
        }}
        onBlur={() => !v.trim() && alCancelar()}
      />
      <Paleta chica valor={color} alElegir={setColor} />
      <button
        className="eti-crear"
        disabled={!v.trim()}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => alCrear(v.trim(), color)}
      >
        {es.grupos.crear}
      </button>
    </div>
  )
}

function Renombrar({
  inicial,
  alTerminar
}: {
  inicial: string
  alTerminar: (n: string | null) => void
}): React.JSX.Element {
  const [v, setV] = useState(inicial)
  const hecho = useRef(false)
  const terminar = (n: string | null): void => {
    if (hecho.current) return
    hecho.current = true
    alTerminar(n === null ? null : n.trim())
  }
  return (
    <div className="eti-fila editando">
      <input
        className="eti-renombrar"
        autoFocus
        value={v}
        maxLength={60}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') terminar(v)
          if (e.key === 'Escape') terminar(null)
        }}
        onBlur={() => terminar(v)}
      />
    </div>
  )
}

function Fusionar({
  origen,
  otras,
  cerrar,
  alFusionar
}: {
  origen: Etiqueta
  otras: Etiqueta[]
  cerrar: () => void
  alFusionar: (destino: Etiqueta) => void
}): React.JSX.Element {
  const [filtro, setFiltro] = useState('')
  const [destino, setDestino] = useState<Etiqueta | null>(null)
  const f = filtro.toLocaleLowerCase('es')
  const visibles = otras.filter((x) => x.nombre.toLocaleLowerCase('es').includes(f))
  return (
    <div className="eti-modal-fondo" onMouseDown={cerrar}>
      <div
        className="eti-modal"
        role="dialog"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && cerrar()}
      >
        <div className="eti-modal-titulo">{es.grupos.fusionarTitulo(origen.nombre)}</div>
        {!destino ? (
          <>
            <input
              autoFocus
              className="eti-modal-filtro"
              placeholder={es.grupos.buscar}
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && visibles.length === 1) setDestino(visibles[0])
              }}
            />
            <div className="eti-modal-lista">
              {visibles.map((x) => (
                <button key={x.id} onClick={() => setDestino(x)}>
                  <span
                    className="eti-muestra chica"
                    style={{ background: x.color ?? 'var(--chip)' }}
                  />
                  <span className="eti-nombre">{x.nombre}</span>
                  <span className="eti-modal-cant">{x.cantidad ?? 0}</span>
                </button>
              ))}
            </div>
            <div className="eti-modal-botones">
              <button onClick={cerrar}>{es.grupos.cancelar}</button>
            </div>
          </>
        ) : (
          <>
            <p className="eti-modal-aviso">
              {es.grupos.fusionarAviso(origen.nombre, destino.nombre, origen.cantidad ?? 0)}
            </p>
            <div className="eti-modal-botones">
              <button onClick={() => setDestino(null)}>{es.grupos.volver}</button>
              <button className="primario" autoFocus onClick={() => alFusionar(destino)}>
                {es.grupos.confirmarFusion}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
