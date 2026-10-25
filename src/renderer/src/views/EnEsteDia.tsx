/** En este día: entradas del mismo día y mes de años anteriores, agrupadas por "Hace N años". */
import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ResumenEntrada } from '../../../shared/tipos'
import { Barra } from '../components/Barra'
import { Tarjeta } from '../components/Tarjeta'
import { es } from '../i18n'
import { desdeIso, hoyIso, sumarDias } from '../util/fechas'
import type { Destino } from './Editor'
import { idioma } from '../../../shared/i18n'

const recuerdo = { fecha: '' } // día elegido (se conserva al abrir una entrada y volver)

const diaYMes = (f: string): string => {
  const d = desdeIso(f)
  return idioma() === 'en'
    ? `${es.meses[d.getMonth()]} ${d.getDate()}`
    : `${d.getDate()} de ${es.meses[d.getMonth()].toLowerCase()}`
}

export function EnEsteDia({
  version,
  abrir
}: {
  version: number
  abrir: (d: Destino) => void
}): React.JSX.Element {
  const [fecha, setFecha] = useState(() => recuerdo.fecha || hoyIso())
  const [res, setRes] = useState<{ de: string; lista: ResumenEntrada[] } | null>(null)

  useEffect(() => {
    recuerdo.fecha = fecha === hoyIso() ? '' : fecha
    let cancelado = false
    void window.diario.entradas.enEsteDia(fecha).then((lista) => {
      if (!cancelado) setRes({ de: fecha, lista })
    })
    return () => {
      cancelado = true
    }
  }, [fecha, version])

  const anio = Number(fecha.slice(0, 4))
  const grupos = useMemo(() => {
    const g: { hace: number; lista: ResumenEntrada[] }[] = []
    for (const e of res?.de === fecha ? res.lista : []) {
      const hace = anio - Number(e.fecha.slice(0, 4))
      if (g[g.length - 1]?.hace !== hace) g.push({ hace, lista: [] })
      g[g.length - 1].lista.push(e)
    }
    return g
  }, [res, fecha, anio])

  const esHoy = fecha === hoyIso()
  return (
    <>
      <Barra alAgregar={() => abrir({ fecha: hoyIso() })}>
        <div className="pildora">
          <button onClick={() => setFecha(sumarDias(fecha, -1))} title={es.enEsteDia.diaAnterior}>
            <ChevronLeft size={17} />
          </button>
          <span
            className="ees-dia"
            title={esHoy ? undefined : es.enEsteDia.volverHoy}
            role={esHoy ? undefined : 'button'}
            onClick={() => setFecha(hoyIso())}
          >
            {diaYMes(fecha)}
          </span>
          <button onClick={() => setFecha(sumarDias(fecha, 1))} title={es.enEsteDia.diaSiguiente}>
            <ChevronRight size={17} />
          </button>
        </div>
      </Barra>
      <div className="contenido" style={{ overflowY: 'auto', paddingBottom: 20 }}>
        {res?.de === fecha && grupos.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              color: 'var(--texto-tenue)',
              margin: '60px 30px 0',
              lineHeight: 1.5
            }}
          >
            {es.enEsteDia.vacio(diaYMes(fecha))}
          </div>
        )}
        {grupos.map((g) => (
          <section key={g.hace}>
            <div className="encabezado-mes">
              {es.enEsteDia.hace(g.hace).toUpperCase()} · {anio - g.hace}
            </div>
            {g.lista.map((e) => (
              <div key={e.id} style={{ padding: '0 4px 4px' }}>
                <Tarjeta e={e} alAbrir={() => abrir({ id: e.id, fecha: e.fecha })} />
              </div>
            ))}
          </section>
        ))}
      </div>
    </>
  )
}
