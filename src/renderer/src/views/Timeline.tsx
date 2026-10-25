/** Línea de tiempo (capturas 2timeline / 2 timeline): lista virtualizada agrupada por mes. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { GroupedVirtuoso, type GroupedVirtuosoHandle } from 'react-virtuoso'
import type { ResumenEntrada } from '../../../shared/tipos'
import { Barra } from '../components/Barra'
import { recuerdos } from '../util/recuerdos'
import { Tarjeta } from '../components/Tarjeta'
import { MenuEntrada } from '../components/MenuEntrada'
import { es } from '../i18n'
import { hoyIso, nombreMes } from '../util/fechas'
import type { Destino } from './Editor'

export function Timeline({
  version,
  abrir,
  alCambiar
}: {
  version: number
  abrir: (d: Destino) => void
  /** Se eliminó una entrada (el resto de las vistas se actualiza) */
  alCambiar: () => void
}): React.JSX.Element {
  const [menu, setMenu] = useState<{ e: ResumenEntrada; x: number; y: number } | null>(null)
  const [entradas, setEntradas] = useState<ResumenEntrada[] | null>(null)
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [conFoto, setConFoto] = useState(true)
  const ref = useRef<GroupedVirtuosoHandle>(null)

  useEffect(() => {
    void window.diario.entradas.listar().then(setEntradas)
    void window.diario.ajustes.obtener().then((a) => setConFoto(a.fotosEnListas))
  }, [version])

  // Grupos por mes (las entradas ya vienen de la más nueva a la más vieja)
  const { grupos, cuentas } = useMemo(() => {
    const grupos: string[] = []
    const cuentas: number[] = []
    for (const e of entradas ?? []) {
      const clave = e.fecha.slice(0, 7)
      if (grupos[grupos.length - 1] !== clave) {
        grupos.push(clave)
        cuentas.push(0)
      }
      cuentas[cuentas.length - 1]++
    }
    return { grupos, cuentas }
  }, [entradas])

  const irAnio = (d: -1 | 1): void => {
    const destino = anio + d
    setAnio(destino)
    // Primera entrada (la más reciente) de ese año, o la más cercana
    const lista = entradas ?? []
    let idx = lista.findIndex((e) => +e.fecha.slice(0, 4) <= destino)
    if (idx < 0) idx = lista.length - 1
    if (idx >= 0) ref.current?.scrollToIndex({ index: idx, align: 'start' })
  }

  return (
    <>
      <Barra alAgregar={() => abrir({ fecha: hoyIso() })} anio={anio} cambiarAnio={irAnio} />
      <div className="contenido">
        {entradas && entradas.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--texto-tenue)', marginTop: 60 }}>
            {es.vacio.timeline}
          </div>
        )}
        {entradas && entradas.length > 0 && (
          <GroupedVirtuoso
            ref={ref}
            groupCounts={cuentas}
            increaseViewportBy={500}
            initialTopMostItemIndex={Math.max(
              0,
              entradas.findIndex((e) => e.id === recuerdos.timeline)
            )}
            rangeChanged={({ startIndex }) => {
              const e = entradas[startIndex]
              if (e) {
                setAnio(+e.fecha.slice(0, 4))
                recuerdos.timeline = e.id
              }
            }}
            groupContent={(g) => {
              const [a, m] = grupos[g].split('-').map(Number)
              return (
                <div className="encabezado-mes" style={{ background: 'var(--fondo)' }}>
                  {nombreMes(a, m - 1)}
                </div>
              )
            }}
            itemContent={(i) => (
              <div style={{ padding: '0 4px 4px' }}>
                <Tarjeta
                  conFoto={conFoto}
                  e={entradas[i]}
                  alAbrir={() => abrir({ id: entradas[i].id, fecha: entradas[i].fecha })}
                  alMenu={(x, y) => setMenu({ e: entradas[i], x, y })}
                />
              </div>
            )}
          />
        )}
      </div>
      {menu && (
        <MenuEntrada
          e={menu.e}
          x={menu.x}
          y={menu.y}
          abrir={() => abrir({ id: menu.e.id, fecha: menu.e.fecha })}
          eliminada={() => {
            const id = menu.e.id
            setEntradas((l) => l?.filter((x) => x.id !== id) ?? null)
            alCambiar()
          }}
          cerrar={() => setMenu(null)}
        />
      )}
    </>
  )
}
