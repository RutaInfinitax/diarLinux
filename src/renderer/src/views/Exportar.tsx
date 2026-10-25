/**
 * Exportar (captura 5): desde/hasta, formato, datos a incluir y tres opciones. Antes de exportar
 * avisa que el resultado queda SIN cifrar. También sirve para "Exportar esta entrada" (menú ⋯).
 */
import { useEffect, useState } from 'react'
import { Share } from 'lucide-react'
import type {
  Etiqueta,
  FormatoExportar,
  OpcionesExportar,
  ResultadoExportar
} from '../../../shared/tipos'
import { Barra } from '../components/Barra'
import { conDia, hoyIso } from '../util/fechas'
import { t, tn } from '../../../shared/i18n'
import './exportar.css'

export interface EntradaAExportar {
  id: string
  fecha: string
  titulo: string
}

const FORMATOS: { id: FormatoExportar; texto: string }[] = [
  { id: 'docx', texto: 'Documento de Word (.docx)' },
  { id: 'pdf', texto: 'PDF (.pdf)' },
  { id: 'html', texto: 'Página web (.html)' },
  { id: 'md', texto: 'Markdown (.md)' },
  { id: 'txt', texto: 'Texto (.txt)' },
  { id: 'json', texto: 'JSON (.json)' }
]
const DATOS: { id: keyof OpcionesExportar['datos']; texto: string }[] = [
  { id: 'adjuntos', texto: 'Adjuntos' },
  { id: 'personas', texto: 'Personas' },
  { id: 'clima', texto: 'Clima' },
  { id: 'sol', texto: 'Amanecer y atardecer' },
  { id: 'luna', texto: 'Fase lunar' },
  { id: 'calificacion', texto: 'Calificación' },
  { id: 'etiquetas', texto: 'Etiquetas' }
]

type Guardado = Pick<OpcionesExportar, 'formato' | 'datos' | 'porFecha' | 'adjuntosAparte'>
const DEFECTO: Guardado = {
  formato: 'docx',
  datos: {
    adjuntos: true,
    personas: true,
    clima: true,
    sol: false,
    luna: false,
    calificacion: true,
    etiquetas: true
  },
  porFecha: false,
  adjuntosAparte: false
}
// Las opciones (no las fechas ni las etiquetas) se recuerdan en este equipo
function leerGuardado(): Guardado {
  try {
    const g = JSON.parse(
      localStorage.getItem('diar.exportar') ?? 'null'
    ) as Partial<Guardado> | null
    return g ? { ...DEFECTO, ...g, datos: { ...DEFECTO.datos, ...g.datos } } : DEFECTO
  } catch {
    return DEFECTO
  }
}
const recuerdo = { desde: '', hasta: '' }

type Estado =
  | { que: 'form' }
  | { que: 'confirmar' }
  | { que: 'exportando'; hechas: number; total: number }
  | { que: 'listo'; r: ResultadoExportar }
  | { que: 'error'; msj: string }

export function Exportar({
  entrada,
  quitarEntrada
}: {
  entrada: EntradaAExportar | null
  quitarEntrada: () => void
}): React.JSX.Element {
  const [op, setOp] = useState<Guardado>(leerGuardado)
  const [desde, setDesde] = useState(recuerdo.desde || `${hoyIso().slice(0, 4)}-01-01`)
  const [hasta, setHasta] = useState(recuerdo.hasta || hoyIso())
  const [porEtiquetas, setPorEtiquetas] = useState(false)
  const [elegidas, setElegidas] = useState<string[]>([])
  const [etiquetas, setEtiquetas] = useState<Etiqueta[]>([])
  const [cuantas, setCuantas] = useState<number | null>(null)
  const [estado, setEstado] = useState<Estado>({ que: 'form' })

  useEffect(() => {
    void window.diario.etiquetas.listar().then(setEtiquetas)
  }, [])
  useEffect(() => {
    try {
      localStorage.setItem('diar.exportar', JSON.stringify(op))
    } catch {
      /* sin almacenamiento: no pasa nada */
    }
  }, [op])
  useEffect(() => {
    recuerdo.desde = desde
    recuerdo.hasta = hasta
  }, [desde, hasta])

  const opciones = (): OpcionesExportar => ({
    ...op,
    desde: entrada?.fecha ?? desde,
    hasta: entrada?.fecha ?? hasta,
    soloEtiquetas: porEtiquetas ? elegidas : null,
    entradaId: entrada?.id
  })

  // Cuántas entradas entran (se recalcula al cambiar fechas o etiquetas)
  const clave = JSON.stringify([desde, hasta, porEtiquetas, elegidas, entrada?.id])
  useEffect(() => {
    if (desde > hasta) return
    let cancelado = false
    const espera = setTimeout(() => {
      window.diario.exportar
        .contar(opciones())
        .then((n) => !cancelado && setCuantas(n))
        .catch(() => !cancelado && setCuantas(null))
    }, 200)
    return () => {
      cancelado = true
      clearTimeout(espera)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `clave` resume lo que cambia
  }, [clave])

  const exportar = async (): Promise<void> => {
    setEstado({ que: 'exportando', hechas: 0, total: cuantas ?? 0 })
    const quitar = window.diario.exportar.alAvanzar((hechas, total) =>
      setEstado({ que: 'exportando', hechas, total })
    )
    try {
      const r = await window.diario.exportar.hacer(opciones())
      setEstado(r ? { que: 'listo', r } : { que: 'form' })
    } catch (e) {
      setEstado({ que: 'error', msj: (e as Error).message })
    } finally {
      quitar()
    }
  }

  const cambiarDato = (id: keyof Guardado['datos'], v: boolean): void =>
    setOp((o) => ({ ...o, datos: { ...o.datos, [id]: v } }))
  const fechasMal = !entrada && desde > hasta
  const sinEtiquetas = !entrada && porEtiquetas && elegidas.length === 0
  const ocupado = estado.que === 'exportando'
  const puede = !ocupado && !fechasMal && !sinEtiquetas && cuantas !== 0

  const rapido = (d: string, h: string): void => {
    setDesde(d)
    setHasta(h)
  }
  const hoy = hoyIso()

  return (
    <>
      <Barra>
        <span className="exp-titulo">
          <Share size={16} /> {t('Exportar')}
        </span>
      </Barra>
      <div className="exp">
        <div className="exp-form">
          {entrada ? (
            <>
              <label>{t('Entrada:')}</label>
              <span className="exp-fila">
                <span className="exp-entrada">
                  {conDia(entrada.fecha)}
                  {entrada.titulo ? ` — ${entrada.titulo}` : ''}
                </span>
                <button className="exp-boton" onClick={quitarEntrada}>
                  {t('Elegir fechas…')}
                </button>
              </span>
            </>
          ) : (
            <>
              <label htmlFor="exp-desde">{t('Desde:')}</label>
              <input
                id="exp-desde"
                type="date"
                value={desde}
                max={hasta}
                onChange={(e) => e.target.value && setDesde(e.target.value)}
              />
              <label htmlFor="exp-hasta">{t('Hasta:')}</label>
              <span className="exp-fila">
                <input
                  id="exp-hasta"
                  type="date"
                  value={hasta}
                  min={desde}
                  onChange={(e) => e.target.value && setHasta(e.target.value)}
                />
                <span className="exp-rapidos">
                  <button onClick={() => rapido(hoy, hoy)}>{t('Hoy')}</button>
                  <button onClick={() => rapido(`${hoy.slice(0, 7)}-01`, hoy)}>
                    {t('Este mes')}
                  </button>
                  <button onClick={() => rapido(`${hoy.slice(0, 4)}-01-01`, hoy)}>
                    {t('Este año')}
                  </button>
                  <button
                    onClick={() =>
                      void window.diario.entradas
                        .rangoAnios()
                        .then((r) =>
                          rapido(
                            `${r.min}-01-01`,
                            `${Math.max(r.max, Number(hoy.slice(0, 4)))}-12-31`
                          )
                        )
                    }
                  >
                    {t('Todo')}
                  </button>
                </span>
              </span>
            </>
          )}
          <label htmlFor="exp-formato">{t('Formato:')}</label>
          <select
            id="exp-formato"
            value={op.formato}
            onChange={(e) => setOp((o) => ({ ...o, formato: e.target.value as FormatoExportar }))}
          >
            {FORMATOS.map((f) => (
              <option key={f.id} value={f.id}>
                {t(f.texto)}
              </option>
            ))}
          </select>
          <label className="exp-arriba">{t('Datos:')}</label>
          <div className="exp-casillas">
            {DATOS.map((d) => (
              <label key={d.id} className="exp-casilla">
                <input
                  type="checkbox"
                  checked={op.datos[d.id]}
                  onChange={(e) => cambiarDato(d.id, e.target.checked)}
                />
                {t(d.texto)}
              </label>
            ))}
          </div>
        </div>
        <div className="exp-opciones">
          <label className="exp-casilla">
            <input
              type="checkbox"
              checked={op.porFecha}
              disabled={!!entrada}
              onChange={(e) => setOp((o) => ({ ...o, porFecha: e.target.checked }))}
            />
            {t('Crear un archivo por fecha')}
          </label>
          <label className="exp-casilla">
            <input
              type="checkbox"
              checked={op.adjuntosAparte}
              disabled={!op.datos.adjuntos}
              onChange={(e) => setOp((o) => ({ ...o, adjuntosAparte: e.target.checked }))}
            />
            {t('Crear archivos separados para los adjuntos')}
          </label>
          <label className="exp-casilla">
            <input
              type="checkbox"
              checked={porEtiquetas}
              disabled={!!entrada}
              onChange={(e) => setPorEtiquetas(e.target.checked)}
            />
            {t('Exportar solo las entradas con las etiquetas elegidas')}
          </label>
          {porEtiquetas && !entrada && (
            <div className="exp-etiquetas">
              {etiquetas.length === 0 && (
                <span className="exp-nota">{t('No tienes etiquetas.')}</span>
              )}
              {etiquetas.map((g) => (
                <label key={g.id} className="exp-casilla">
                  <input
                    type="checkbox"
                    checked={elegidas.includes(g.id)}
                    onChange={(e) =>
                      setElegidas((l) =>
                        e.target.checked ? [...l, g.id] : l.filter((x) => x !== g.id)
                      )
                    }
                  />
                  {g.nombre}
                  <span className="exp-nota">({g.cantidad ?? 0})</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="exp-pie">
          <span className="exp-nota">
            {fechasMal
              ? t('«Desde» es posterior a «Hasta».')
              : sinEtiquetas
                ? t('Elige al menos una etiqueta.')
                : cuantas === null
                  ? ''
                  : cuantas === 0
                    ? t('No hay entradas con estas opciones.')
                    : tn(cuantas, t('1 entrada'), t('{n} entradas'))}
            {op.adjuntosAparte && op.datos.adjuntos
              ? ' · ' + t('se crea una carpeta con los archivos')
              : op.porFecha
                ? ' · ' + t('se crea una carpeta con un archivo por día')
                : ''}
          </span>
          <button
            className="exp-boton exp-primario"
            disabled={!puede}
            onClick={() => setEstado({ que: 'confirmar' })}
          >
            {t('Exportar…')}
          </button>
        </div>

        {estado.que === 'confirmar' && (
          <div className="exp-aviso" role="alertdialog">
            <b>⚠ {t('La exportación queda SIN cifrar.')}</b>
            <span>
              {t(
                t(
                  'Cualquiera que tenga acceso a esos archivos puede leer lo que exportes. Guárdalos en un lugar seguro y bórralos cuando ya no los necesites.'
                )
              )}
            </span>
            <span className="exp-fila exp-derecha">
              <button className="exp-boton" onClick={() => setEstado({ que: 'form' })}>
                {t('Cancelar')}
              </button>
              <button className="exp-boton exp-primario" autoFocus onClick={() => void exportar()}>
                {t('Exportar sin cifrar')}
              </button>
            </span>
          </div>
        )}
        {estado.que === 'exportando' && (
          <div className="exp-aviso">
            <span>
              {t('Exportando…')}{' '}
              {estado.total > 0 &&
                t('{hechas} de {total} entradas', { hechas: estado.hechas, total: estado.total })}
            </span>
            <progress max={estado.total || 1} value={estado.hechas} />
          </div>
        )}
        {estado.que === 'listo' && (
          <div className="exp-aviso exp-ok">
            <b>✓ {t('Listo')}</b>
            <span>
              {tn(estado.r.entradas, t('1 entrada'), t('{n} entradas'))}
              {estado.r.archivos > 1 && ' ' + t('en {n} archivos', { n: estado.r.archivos })}
              {estado.r.adjuntos > 0 && ' ' + t('y {n} adjuntos', { n: estado.r.adjuntos })}.
            </span>
            <span className="exp-ruta" title={estado.r.ruta}>
              {estado.r.ruta}
            </span>
            {estado.r.avisos.map((a) => (
              <span key={a} className="exp-nota">
                ⚠ {a}
              </span>
            ))}
            <span className="exp-fila exp-derecha">
              <button className="exp-boton" onClick={() => setEstado({ que: 'form' })}>
                {t('Cerrar')}
              </button>
              <button
                className="exp-boton exp-primario"
                onClick={() => void window.diario.exportar.mostrar(estado.r.ruta)}
              >
                {t('Mostrar en la carpeta')}
              </button>
            </span>
          </div>
        )}
        {estado.que === 'error' && (
          <div className="exp-aviso exp-error">
            <b>⚠ {t('No se pudo exportar')}</b>
            <span>{estado.msj}</span>
            <span className="exp-fila exp-derecha">
              <button className="exp-boton" onClick={() => setEstado({ que: 'form' })}>
                {t('Cerrar')}
              </button>
            </span>
          </div>
        )}
      </div>
    </>
  )
}
