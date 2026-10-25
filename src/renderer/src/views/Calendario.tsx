/**
 * Calendario (capturas 1calendar / 1calendasr): scroll vertical continuo por meses, fila fija con los
 * días de la semana en la barra, días con entrada en color de acento, hoy con borde, hover con borde
 * claro. Clic en un día: abre su entrada, una lista si hay varias, o crea una.
 *
 * SIN virtualizar a propósito: con la lista virtual, los meses de arriba tenían un alto estimado y al
 * subir por primera vez la lista se acomodaba de golpe (se veía como un parpadeo). Unos
 * pocos años de meses son livianos de dibujar enteros, y así cada mes tiene su alto real desde el inicio.
 */
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ResumenEntrada } from '../../../shared/tipos'
import {
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ZoomIn
} from 'lucide-react'
import { Barra } from '../components/Barra'
import { recuerdos } from '../util/recuerdos'
import { es } from '../i18n'
import { diasDelMes, hoyIso, nombreMes } from '../util/fechas'
import { urlMini } from '../util/fotos'
import type { Destino } from './Editor'
import { t } from '../../../shared/i18n'
import './calendario.css'

const CAL_MIN = 360
const CAL_MAX = 2000 // el máximo = todo el ancho
function leerTamCal(): number {
  try {
    const n = Number(localStorage.getItem('diar.calAncho'))
    return Number.isFinite(n) && n >= CAL_MIN ? Math.min(n, CAL_MAX) : CAL_MAX
  } catch {
    return CAL_MAX
  }
}

/** En <html>: la usan la grilla y la fila de días de la semana (que está en la barra). */
function ponerTamCal(n: number): void {
  document.documentElement.style.setProperty('--cal-ancho', n >= CAL_MAX ? 'none' : `${n}px`)
}

interface Mes {
  anio: number
  mes: number
}

export function Calendario({ abrir }: { abrir: (d: Destino) => void }): React.JSX.Element {
  const [rango, setRango] = useState<{ min: number; max: number } | null>(null)
  const [primerDia, setPrimerDia] = useState<0 | 1>(0)
  // año → (fecha → id de la primera foto del día, o null si el día no tiene fotos)
  const [dias, setDias] = useState<Map<number, Map<string, string | null>>>(new Map())
  const [fotosEnListas, setFotosEnListas] = useState(true)
  const [anioVisible, setAnioVisible] = useState(
    recuerdos.calendario?.anio ?? new Date().getFullYear()
  )
  const [mesVisible, setMesVisible] = useState(recuerdos.calendario?.mes ?? new Date().getMonth())
  const [selector, setSelector] = useState(false)
  const [tamCal, setTamCal] = useState(leerTamCal)
  useEffect(() => ponerTamCal(tamCal), [tamCal])
  const [lista, setLista] = useState<{
    fecha: string
    entradas: ResumenEntrada[]
    x: number
    y: number
  } | null>(null)
  const caja = useRef<HTMLDivElement>(null)
  const mesArriba = useRef(-1) // índice del mes que está arriba de todo
  const irA = useRef<number | null>(null) // mes al que hay que ir después de dibujar

  useEffect(() => {
    void window.diario.entradas.rangoAnios().then((r) => {
      const a = recuerdos.calendario?.anio
      setRango({
        min: Math.min(r.min - 1, a ?? Infinity),
        max: Math.max(r.max + 1, a ?? -Infinity)
      })
    })
    void window.diario.ajustes.obtener().then((a) => {
      setPrimerDia(a.primerDia)
      setFotosEnListas(a.fotosEnListas)
    })
  }, [])

  // Días con entrada de todos los años del rango (una consulta por año, liviana; nunca repetida)
  const pedidos = useRef(new Set<number>())
  useEffect(() => {
    if (!rango) return
    for (let a = rango.min; a <= rango.max; a++) {
      if (pedidos.current.has(a)) continue
      pedidos.current.add(a)
      void window.diario.entradas
        .diasConEntrada(a)
        .then((l) =>
          setDias((prev) => new Map(prev).set(a, new Map(l.map((d) => [d.fecha, d.foto]))))
        )
    }
  }, [rango])

  const meses = useMemo<Mes[]>(() => {
    if (!rango) return []
    const l: Mes[] = []
    for (let a = rango.min; a <= rango.max; a++)
      for (let m = 0; m < 12; m++) l.push({ anio: a, mes: m })
    return l
  }, [rango])

  const seccion = (i: number): HTMLElement | null =>
    caja.current?.querySelector<HTMLElement>(`[data-i="${i}"]`) ?? null

  const ponerArriba = useCallback((i: number) => {
    const s = seccion(i)
    if (s && caja.current) caja.current.scrollTop = s.offsetTop
    mesArriba.current = i
  }, [])

  // Al abrir: el mes actual arriba, ANTES de pintar (sin saltos). También después de saltar de año.
  useLayoutEffect(() => {
    if (!rango) return
    if (mesArriba.current < 0) {
      const hoy = new Date()
      const m = recuerdos.calendario ?? { anio: hoy.getFullYear(), mes: hoy.getMonth() }
      ponerArriba((m.anio - rango.min) * 12 + m.mes)
    } else if (irA.current !== null) {
      ponerArriba(irA.current)
      irA.current = null
    }
  }, [rango, ponerArriba])

  // Qué mes/año está arriba al hacer scroll
  const alScroll = useCallback(() => {
    const c = caja.current
    if (!c || !rango) return
    const secciones = c.querySelectorAll<HTMLElement>('[data-i]')
    let i = 0
    while (i + 1 < secciones.length && secciones[i + 1].offsetTop <= c.scrollTop + 1) i++
    mesArriba.current = i
    const anio = rango.min + Math.floor(i / 12)
    setAnioVisible((v) => (v === anio ? v : anio))
    setMesVisible((v) => (v === i % 12 ? v : i % 12))
    recuerdos.calendario = { anio, mes: i % 12 }
  }, [rango])

  // Si cambia el ancho de la ventana, las celdas cambian de alto: mantener arriba el mismo mes
  useEffect(() => {
    const c = caja.current
    if (!c) return
    let ancho = c.clientWidth
    const ro = new ResizeObserver(() => {
      if (Math.abs(c.clientWidth - ancho) < 2) return
      ancho = c.clientWidth
      ponerArriba(mesArriba.current)
    })
    ro.observe(c)
    return () => ro.disconnect()
  }, [ponerArriba])

  /** Ir a un mes de cualquier año (si el año no está dibujado, se agregan los años que falten). */
  const irMes = (anio: number, mes: number): void => {
    if (!rango) return
    const min = Math.min(rango.min, anio)
    const indice = (anio - min) * 12 + mes
    setAnioVisible(anio)
    setMesVisible(mes)
    recuerdos.calendario = { anio, mes }
    if (anio < rango.min || anio > rango.max) {
      irA.current = indice // se va después de dibujar los meses nuevos
      setRango({ min, max: Math.max(rango.max, anio) })
    } else ponerArriba(indice)
  }
  const moverMeses = (n: number): void => {
    const total = anioVisible * 12 + mesVisible + n
    irMes(Math.floor(total / 12), ((total % 12) + 12) % 12)
  }

  // Tamaño del calendario: ancho máximo de la grilla (más angosta = días más chicos). Al cambiarlo
  // las celdas cambian de alto: se mantiene arriba el mismo mes.
  const cambiarTam = (n: number): void => {
    const arriba = mesArriba.current
    ponerTamCal(n) // ya mismo (no en un efecto): así se puede reacomodar enseguida
    if (arriba >= 0) ponerArriba(arriba) // leer offsetTop fuerza el nuevo tamaño
    setTamCal(n)
    try {
      localStorage.setItem('diar.calAncho', String(n))
    } catch {
      /* sin almacenamiento: no pasa nada */
    }
  }

  const clicDia = useCallback(
    async (fecha: string, e: React.MouseEvent): Promise<void> => {
      const tiene = dias.get(+fecha.slice(0, 4))?.has(fecha)
      if (!tiene) return abrir({ fecha })
      const entradas = await window.diario.entradas.delDia(fecha)
      if (entradas.length === 1) return abrir({ id: entradas[0].id, fecha })
      if (!entradas.length) return abrir({ fecha })
      setLista({ fecha, entradas, x: e.clientX, y: e.clientY })
    },
    [dias, abrir]
  )
  const alClic = useCallback((f: string, e: React.MouseEvent) => void clicDia(f, e), [clicDia])

  const etiquetasDias = Array.from({ length: 7 }, (_, i) => es.diasCortos[(i + primerDia) % 7])
  const iso = hoyIso()

  return (
    <>
      <Barra
        alAgregar={() => abrir({ fecha: iso })}
        izquierda={
          <>
            <label
              className="cal-tam"
              title={t('Tamaño del calendario (doble clic: todo el ancho)')}
            >
              <ZoomIn size={15} strokeWidth={1.8} />
              <input
                type="range"
                min={CAL_MIN}
                max={CAL_MAX}
                step={20}
                value={tamCal}
                aria-label={t('Tamaño del calendario')}
                onChange={(e) => cambiarTam(Number(e.target.value))}
                onDoubleClick={() => cambiarTam(CAL_MAX)}
              />
            </label>
            <button
              className="cal-hoy"
              onClick={() => {
                const h = new Date()
                irMes(h.getFullYear(), h.getMonth())
              }}
              title={t('Ir al mes de hoy')}
            >
              <CalendarCheck size={15} strokeWidth={1.8} />
              {t('Hoy')}
            </button>
          </>
        }
        abajo={
          <div className="cal-semana">
            {etiquetasDias.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
        }
      >
        <div className="pildora cal-nav">
          <button onClick={() => moverMeses(-12)} title={t('Año anterior')}>
            <ChevronsLeft size={16} />
          </button>
          <button onClick={() => moverMeses(-1)} title={t('Mes anterior')}>
            <ChevronLeft size={17} />
          </button>
          <span
            className="cal-nav-fecha"
            role="button"
            title={t('Elegir año y mes')}
            onClick={(e) => {
              e.stopPropagation()
              setSelector((x) => !x)
            }}
          >
            {es.meses[mesVisible]} {anioVisible}
          </span>
          <button onClick={() => moverMeses(1)} title={t('Mes siguiente')}>
            <ChevronRight size={17} />
          </button>
          <button onClick={() => moverMeses(12)} title={t('Año siguiente')}>
            <ChevronsRight size={16} />
          </button>
        </div>
        {selector && (
          <SelectorMes
            anio={anioVisible}
            mes={mesVisible}
            conEntradas={(a, m) => {
              const d = dias.get(a)
              if (!d) return false
              const pre = `${a}-${String(m + 1).padStart(2, '0')}`
              for (const f of d.keys()) if (f.startsWith(pre)) return true
              return false
            }}
            pedirAnio={(a) => {
              if (pedidos.current.has(a)) return
              pedidos.current.add(a)
              void window.diario.entradas
                .diasConEntrada(a)
                .then((l) =>
                  setDias((prev) => new Map(prev).set(a, new Map(l.map((x) => [x.fecha, x.foto]))))
                )
            }}
            elegir={(a, m) => {
              setSelector(false)
              irMes(a, m)
            }}
            cerrar={() => setSelector(false)}
          />
        )}
      </Barra>
      <div
        className="contenido cal-scroll"
        ref={caja}
        onScroll={alScroll}
        onClick={() => setLista(null)}
      >
        {meses.map((m, i) => (
          <MesVista
            key={`${m.anio}-${m.mes}`}
            i={i}
            m={m}
            primerDia={primerDia}
            dias={dias.get(m.anio)}
            fotos={fotosEnListas}
            hoy={iso}
            alClic={alClic}
          />
        ))}
        {lista && (
          <div
            className="cal-lista"
            style={{
              left: Math.min(lista.x, window.innerWidth - 280),
              top: Math.min(lista.y, window.innerHeight - 60 - lista.entradas.length * 34)
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {lista.entradas.map((en) => (
              <button
                key={en.id}
                onClick={() => {
                  setLista(null)
                  abrir({ id: en.id, fecha: en.fecha })
                }}
              >
                <span className="cal-lista-hora">{en.hora ?? ''}</span>
                <span className="cal-lista-tit">{en.titulo || en.extracto || 'Sin título'}</span>
              </button>
            ))}
            <button
              className="cal-lista-nueva"
              onClick={() => {
                setLista(null)
                abrir({ fecha: lista.fecha })
              }}
            >
              + Nueva entrada
            </button>
          </div>
        )}
      </div>
    </>
  )
}

const MesVista = memo(function MesVista({
  i,
  m,
  primerDia,
  dias,
  fotos,
  hoy,
  alClic
}: {
  i: number
  m: Mes
  primerDia: 0 | 1
  dias?: Map<string, string | null>
  fotos: boolean
  hoy: string
  alClic: (fecha: string, e: React.MouseEvent) => void
}): React.JSX.Element {
  const vacios = (new Date(m.anio, m.mes, 1).getDay() - primerDia + 7) % 7
  const n = diasDelMes(m.anio, m.mes)
  const total = Math.ceil((vacios + n) / 7) * 7
  const pre = `${m.anio}-${String(m.mes + 1).padStart(2, '0')}-`
  return (
    <section className="cal-mes" data-i={i}>
      <div className="encabezado-mes">{nombreMes(m.anio, m.mes)}</div>
      <div className="cal-grilla">
        {Array.from({ length: total }, (_, i) => {
          const d = i - vacios + 1
          if (d < 1 || d > n) return <div key={i} className="cal-dia vacio" />
          const fecha = pre + String(d).padStart(2, '0')
          const clases = ['cal-dia']
          const foto = fotos ? dias?.get(fecha) : null
          if (dias?.has(fecha)) clases.push('con-entrada')
          if (foto) clases.push('con-foto')
          if (fecha === hoy) clases.push('hoy')
          return (
            <button
              key={i}
              className={clases.join(' ')}
              data-fecha={fecha}
              style={foto ? { backgroundImage: `url(${urlMini(foto, 128)})` } : undefined}
              onClick={(e) => {
                e.stopPropagation()
                alClic(fecha, e)
              }}
            >
              {d}
            </button>
          )
        })}
      </div>
    </section>
  )
})

/**
 * Elegir año y después mes (clic en "Mes Año" del calendario). Los meses con entradas van marcados.
 * Esc o clic afuera cierra.
 */
function SelectorMes({
  anio,
  mes,
  conEntradas,
  pedirAnio,
  elegir,
  cerrar
}: {
  anio: number
  mes: number
  conEntradas: (anio: number, mes: number) => boolean
  pedirAnio: (anio: number) => void
  elegir: (anio: number, mes: number) => void
  cerrar: () => void
}): React.JSX.Element {
  const [paso, setPaso] = useState<'anio' | 'mes'>('anio')
  const [elegido, setElegido] = useState(anio)
  const [desde, setDesde] = useState(anio - (anio % 12)) // grilla de 12 años
  const ref = useRef<HTMLDivElement>(null)
  const hoy = new Date()

  useEffect(() => {
    const fuera = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) cerrar()
    }
    const tecla = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        cerrar()
      }
    }
    window.addEventListener('mousedown', fuera)
    window.addEventListener('keydown', tecla, true)
    return () => {
      window.removeEventListener('mousedown', fuera)
      window.removeEventListener('keydown', tecla, true)
    }
  }, [cerrar])
  useEffect(() => {
    if (paso === 'mes') pedirAnio(elegido)
  }, [paso, elegido, pedirAnio])

  return (
    <div className="cal-selector" ref={ref} onClick={(e) => e.stopPropagation()}>
      {paso === 'anio' ? (
        <>
          <div className="cal-selector-cab">
            <button onClick={() => setDesde(desde - 12)} title={t('Años anteriores')}>
              <ChevronLeft size={16} />
            </button>
            <span>
              {desde} – {desde + 11}
            </span>
            <button onClick={() => setDesde(desde + 12)} title={t('Años siguientes')}>
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="cal-selector-grilla">
            {Array.from({ length: 12 }, (_, i) => desde + i).map((a) => (
              <button
                key={a}
                className={(a === anio ? 'sel ' : '') + (a === hoy.getFullYear() ? 'hoy' : '')}
                onClick={() => {
                  setElegido(a)
                  setPaso('mes')
                }}
              >
                {a}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="cal-selector-cab">
            <button onClick={() => setPaso('anio')} title={t('Volver a los años')}>
              <ChevronLeft size={16} />
            </button>
            <span>{elegido}</span>
            <span className="cal-selector-hueco" />
          </div>
          <div className="cal-selector-grilla">
            {es.meses.map((nombre, m) => (
              <button
                key={nombre}
                className={
                  (elegido === anio && m === mes ? 'sel ' : '') +
                  (elegido === hoy.getFullYear() && m === hoy.getMonth() ? 'hoy ' : '') +
                  (conEntradas(elegido, m) ? 'con' : '')
                }
                onClick={() => elegir(elegido, m)}
              >
                {nombre.slice(0, 3)}
              </button>
            ))}
          </div>
        </>
      )}
      <button
        className="cal-selector-hoy"
        onClick={() => elegir(hoy.getFullYear(), hoy.getMonth())}
      >
        {t('Ir a hoy')}
      </button>
    </div>
  )
}
