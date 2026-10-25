/** Configuración (capturas 6, 7 y 8): ventana modal con pestañas e íconos arriba. */
import { Fragment, useEffect, useRef, useState } from 'react'
import {
  Bell,
  BookOpen,
  Check,
  CloudSun,
  Info,
  Palette,
  PieChart,
  Settings,
  ShieldCheck
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type {
  AjustesClima,
  Ajustes as TAjustes,
  Ciudad,
  Estadisticas,
  InfoBackup,
  Plantilla
} from '../../../shared/tipos'
import { es } from '../i18n'
import { locale, t, tn } from '../../../shared/i18n'
import { publicarAjustes } from '../util/preferencias'
import { aplicarApariencia } from '../util/apariencia'
import {
  ACENTOS,
  ACENTO_SKIN,
  CLASICO_PALETA,
  SKINS,
  SKIN_CLASICO,
  acentoDeSkin,
  skinPorId,
  type Paleta
} from '../../../shared/temas'
import { Importar, type Fuente } from '../components/Importar'
import { Plantillas } from '../components/Plantillas'
import { tamanoLegible } from '../util/medios'
import { corta } from '../util/fechas'
import './ajustes.css'
import { confirmar } from '../util/dialogo'

type Pestana =
  | 'general'
  | 'apariencia'
  | 'seguridad'
  | 'diario'
  | 'notificaciones'
  | 'clima'
  | 'estadisticas'
  | 'acerca'
const PESTANAS: { id: Pestana; texto: string; icono: LucideIcon }[] = [
  { id: 'general', texto: 'General', icono: Settings },
  { id: 'apariencia', texto: 'Apariencia', icono: Palette },
  { id: 'seguridad', texto: 'Seguridad', icono: ShieldCheck },
  { id: 'diario', texto: 'Diario', icono: BookOpen },
  { id: 'notificaciones', texto: 'Notificaciones', icono: Bell },
  { id: 'clima', texto: 'Clima', icono: CloudSun },
  { id: 'estadisticas', texto: 'Estadísticas', icono: PieChart },
  { id: 'acerca', texto: 'Acerca de', icono: Info }
]

export function Ajustes({
  cerrar,
  bloquear,
  alRestaurar
}: {
  cerrar: () => void
  bloquear: () => void
  alRestaurar: () => void
}): React.JSX.Element {
  const [p, setP] = useState<Pestana>('general')
  const [aj, setAj] = useState<TAjustes | null>(null)

  useEffect(() => {
    void window.diario.ajustes.obtener().then(setAj)
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') cerrar()
    }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [cerrar])

  const guardar = async (c: Partial<TAjustes>): Promise<void> => {
    const nuevo = await window.diario.ajustes.guardar(c)
    setAj(nuevo)
    publicarAjustes(nuevo)
  }

  return (
    <div
      className="aj-fondo"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) cerrar()
      }}
    >
      <div className="aj-ventana" role="dialog" aria-label={es.nav.configuracion}>
        <div className="aj-titulo">
          <button className="aj-cerrar" onClick={cerrar} title={t('Cerrar (Esc)')} />
          <span>{es.nav.configuracion}</span>
        </div>
        <div className="aj-pestanas">
          {PESTANAS.map(({ id, texto, icono: I }) => (
            <button key={id} className={p === id ? 'sel' : ''} onClick={() => setP(id)}>
              <I size={20} strokeWidth={1.5} />
              <span>{t(texto)}</span>
            </button>
          ))}
        </div>
        <div className="aj-cuerpo">
          {p === 'general' && aj && (
            <div className="aj-form">
              <label>{t('Idioma')} / Language:</label>
              <select
                value={aj.idioma}
                onChange={async (e) => {
                  await guardar({ idioma: e.target.value as TAjustes['idioma'] })
                  // la ventana se vuelve a abrir en el idioma nuevo (main ya cambió el suyo)
                  const q = new URLSearchParams(location.search)
                  q.set('idioma', await window.diario.app.idioma())
                  location.replace(location.pathname + '?' + q.toString())
                }}
              >
                <option value="auto">{t('Automático (el del sistema)')}</option>
                <option value="es">Español</option>
                <option value="en">English</option>
              </select>
              <label>{t('Tamaño de la interfaz:')}</label>
              <select
                value={aj.zoom}
                onChange={(e) => void guardar({ zoom: Number(e.target.value) })}
              >
                {[0.9, 1, 1.1, 1.25, 1.4, 1.5, 1.75, 2]
                  .concat([0.9, 1, 1.1, 1.25, 1.4, 1.5, 1.75, 2].includes(aj.zoom) ? [] : [aj.zoom])
                  .sort((a, b) => a - b)
                  .map((z) => (
                    <option key={z} value={z}>
                      {Math.round(z * 100)} %
                    </option>
                  ))}
              </select>
              <span className="aj-nota aj-span">
                {t('Atajos: Ctrl + agranda, Ctrl − achica, Ctrl 0 vuelve a 125 %.')}
              </span>
              <label>{t('Compresión de fotos:')}</label>
              <select
                value={aj.compresion}
                onChange={(e) =>
                  void guardar({ compresion: e.target.value as TAjustes['compresion'] })
                }
              >
                <option value="original">{t('Original (sin comprimir)')}</option>
                <option value="estandar">{t('Estándar (hasta 2560 px)')}</option>
                <option value="alta">{t('Alta (hasta 1600 px, ocupa menos)')}</option>
              </select>
              <span />
              <label className="aj-casilla">
                <input
                  type="checkbox"
                  checked={aj.fotosEnListas}
                  onChange={(e) => void guardar({ fotosEnListas: e.target.checked })}
                />
                {t('Vista previa de fotos en calendario y línea de tiempo')}
              </label>
              <label>{t('Guardar las entradas:')}</label>
              <select
                value={aj.autoguardadoSeg}
                onChange={(e) => void guardar({ autoguardadoSeg: Number(e.target.value) })}
              >
                {[60, 120, 240, 300, 600]
                  .concat(
                    [0, 60, 120, 240, 300, 600].includes(aj.autoguardadoSeg)
                      ? []
                      : [aj.autoguardadoSeg]
                  )
                  .sort((a, b) => a - b)
                  .map((n) => (
                    <option key={n} value={n}>
                      {n < 60
                        ? t('Cada {n} s', { n })
                        : t('Cada {n} min (si hay cambios)', { n: n / 60 })}
                    </option>
                  ))}
                <option value={0}>{t('Solo al salir de la entrada o con Guardar')}</option>
              </select>
              <span className="aj-nota aj-span">
                {t(
                  t(
                    'También se guarda al salir de la entrada, al bloquear y con Ctrl+S o el botón Guardar de la barra lateral. Al cerrar la app, si hay cambios, te pregunta.'
                  )
                )}
              </span>
              <label>{t('Primer día de la semana:')}</label>
              <select
                value={aj.primerDia}
                onChange={(e) => void guardar({ primerDia: Number(e.target.value) as 0 | 1 })}
              >
                <option value={0}>{es.dias[0]}</option>
                <option value={1}>{es.dias[1]}</option>
              </select>
              <span />
              <label className="aj-casilla">
                <input
                  type="checkbox"
                  checked={aj.contadorPalabras}
                  onChange={(e) => void guardar({ contadorPalabras: e.target.checked })}
                />
                {t('Contador de palabras en las entradas')}
              </label>
              {aj.contadorPalabras && (
                <>
                  <label>{t('Objetivo por entrada:')}</label>
                  <span className="aj-fila">
                    <input
                      type="number"
                      className="aj-numero"
                      min={0}
                      step={50}
                      value={aj.objetivoPalabras || ''}
                      placeholder={t('Sin objetivo')}
                      onChange={(e) =>
                        void guardar({
                          objetivoPalabras: Math.max(0, Math.round(Number(e.target.value) || 0))
                        })
                      }
                    />
                    <span className="aj-nota">{t('palabras (vacío = solo contar)')}</span>
                  </span>
                </>
              )}
              <PlantillaDefecto />
            </div>
          )}
          {p === 'seguridad' && aj && <Seguridad aj={aj} guardar={guardar} bloquear={bloquear} />}
          {p === 'diario' && aj && <Diario aj={aj} guardar={guardar} alRestaurar={alRestaurar} />}
          {p === 'apariencia' && aj && <Apariencia aj={aj} guardar={guardar} />}
          {p === 'clima' && <ClimaAjustes />}
          {p === 'notificaciones' && aj && <Notificaciones aj={aj} guardar={guardar} />}
          {p === 'estadisticas' && <EstadisticasAjustes />}
          {p === 'acerca' && <AcercaDe />}
        </div>
      </div>
    </div>
  )
}

function Seguridad({
  aj,
  guardar,
  bloquear
}: {
  aj: TAjustes
  guardar: (c: Partial<TAjustes>) => Promise<void>
  bloquear: () => void
}): React.JSX.Element {
  const [a, setA] = useState('')
  const [n, setN] = useState('')
  const [n2, setN2] = useState('')
  const [msj, setMsj] = useState('')
  const [c, setC] = useState('')
  const [codigo, setCodigo] = useState('')
  const [msjCod, setMsjCod] = useState('')

  const cambiar = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (n !== n2) return setMsj('⚠ ' + es.bloqueo.noCoinciden)
    try {
      await window.diario.vault.cambiarContrasena(a, n)
      setA('')
      setN('')
      setN2('')
      setMsj(
        '✓ ' +
          t(
            t(
              'Contraseña cambiada. Haz un backup nuevo: los anteriores se restauran sin problema estando dentro del diario.'
            )
          )
      )
    } catch (err) {
      setMsj('⚠ ' + (err as Error).message)
    }
  }

  const regenerar = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    try {
      const r = await window.diario.vault.regenerarCodigo(c)
      setC('')
      setCodigo(r.codigo)
      setMsjCod(
        t('Este es tu código NUEVO. El anterior ya no sirve. Anótalo: no se vuelve a mostrar.')
      )
    } catch (err) {
      setMsjCod('⚠ ' + (err as Error).message)
    }
  }

  return (
    <div className="aj-form">
      <label>{t('Bloqueo automático:')}</label>
      <select
        value={aj.bloqueoMinutos}
        onChange={(e) => void guardar({ bloqueoMinutos: Number(e.target.value) })}
      >
        {[1, 5, 15, 30, 60].map((m) => (
          <option key={m} value={m}>
            {t('Tras {m} min sin usarlo', { m })}
          </option>
        ))}
        <option value={0}>{t('Nunca')}</option>
      </select>
      <span />
      <button className="aj-boton" onClick={bloquear}>
        {t('Bloquear ahora (Ctrl+L)')}
      </button>

      <h4 className="aj-span">{t('Cambiar la contraseña')}</h4>
      <form className="aj-span aj-col" onSubmit={(e) => void cambiar(e)}>
        <input
          type="password"
          placeholder={t('Contraseña actual')}
          value={a}
          onChange={(e) => setA(e.target.value)}
        />
        <input
          type="password"
          placeholder={t('Contraseña nueva')}
          value={n}
          onChange={(e) => setN(e.target.value)}
        />
        <input
          type="password"
          placeholder={t('Repetir la contraseña nueva')}
          value={n2}
          onChange={(e) => setN2(e.target.value)}
        />
        <button className="aj-boton" disabled={!a || !n}>
          {t('Cambiar')}
        </button>
        {msj && <span className="aj-nota">{msj}</span>}
      </form>

      <h4 className="aj-span">{t('Código de recuperación')}</h4>
      <form className="aj-span aj-col" onSubmit={(e) => void regenerar(e)}>
        <span className="aj-nota">
          {t('Genera un código nuevo (el anterior deja de servir). Pide tu contraseña.')}
        </span>
        <input
          type="password"
          placeholder={t('Contraseña')}
          value={c}
          onChange={(e) => setC(e.target.value)}
        />
        <button className="aj-boton" disabled={!c}>
          {t('Generar código nuevo')}
        </button>
        {codigo && <code className="aj-codigo">{codigo}</code>}
        {msjCod && <span className="aj-nota">{msjCod}</span>}
      </form>
    </div>
  )
}

function Diario({
  aj,
  guardar,
  alRestaurar
}: {
  aj: TAjustes
  guardar: (c: Partial<TAjustes>) => Promise<void>
  alRestaurar: () => void
}): React.JSX.Element {
  const [lista, setLista] = useState<InfoBackup[]>([])
  const [msj, setMsj] = useState('')
  const [carpeta, setCarpeta] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [pidiendo, setPidiendo] = useState<string | null>(null)
  const [clave, setClave] = useState('')
  const [importando, setImportando] = useState<Fuente | null>(null)
  const [restableciendo, setRestableciendo] = useState(false)

  useEffect(() => {
    void window.diario.backups.listar().then(setLista)
    void window.diario.vault.estado().then((e) => setCarpeta(e.carpeta))
  }, [])

  const accion = async (fn: () => Promise<string | void>): Promise<void> => {
    setOcupado(true)
    setMsj('')
    try {
      const r = await fn()
      if (r) setMsj(r)
      setLista(await window.diario.backups.listar())
    } catch (e) {
      setMsj('⚠ ' + (e as Error).message)
    } finally {
      setOcupado(false)
    }
  }

  const restaurar = (archivo: string, contrasena?: string): Promise<void> =>
    accion(async () => {
      if (
        !(await confirmar(
          t('Se REEMPLAZA todo el diario actual por el contenido del backup. ¿Seguir?'),
          { aceptar: t('Restaurar'), peligro: true }
        ))
      )
        return
      const r = await window.diario.backups.restaurar(archivo, contrasena)
      if ('necesitaContrasena' in r) {
        setPidiendo(archivo)
        return t('Este backup es de otro diario: escribe la contraseña que tenía.')
      }
      setPidiendo(null)
      setClave('')
      alRestaurar()
      return '✓ ' + t('Backup restaurado')
    })

  return (
    <div className="aj-form">
      <label>{t('Carpeta del diario:')}</label>
      <span className="aj-ruta" title={carpeta}>
        {carpeta}
      </span>
      <label>{t('Carpeta de backups:')}</label>
      <span className="aj-fila">
        <span className="aj-ruta" title={aj.backupCarpeta}>
          {aj.backupCarpeta}
        </span>
        <button
          className="aj-boton"
          onClick={async () => {
            const c = await window.diario.backups.elegirCarpeta()
            if (c) await guardar({ backupCarpeta: c })
          }}
        >
          {t('Cambiar…')}
        </button>
      </span>
      <label>{t('Backup automático:')}</label>
      <select
        value={aj.backupCadaHoras}
        onChange={(e) => void guardar({ backupCadaHoras: Number(e.target.value) })}
      >
        <option value={6}>{t('Cada 6 horas')}</option>
        <option value={12}>{t('Cada 12 horas')}</option>
        <option value={24}>{t('Cada día')}</option>
        <option value={72}>{t('Cada 3 días')}</option>
        <option value={168}>{t('Cada semana')}</option>
        <option value={0}>{t('Desactivado')}</option>
      </select>
      <label>{t('Conservar:')}</label>
      <select
        value={aj.backupConservar}
        onChange={(e) => void guardar({ backupConservar: Number(e.target.value) })}
      >
        {[3, 7, 14, 30, 60].map((n) => (
          <option key={n} value={n}>
            {t('Los últimos {n}', { n })}
          </option>
        ))}
      </select>
      <span className="aj-nota aj-span">
        {t(
          t(
            'Consejo: elige una carpeta en OTRO disco (u otro dispositivo) para que los backups te protejan si falla este disco. Los backups van cifrados.'
          )
        )}
      </span>
      <div className="aj-span aj-botones">
        <button
          className="aj-boton"
          disabled={ocupado}
          onClick={() =>
            void accion(async () => {
              const b = await window.diario.backups.ahora()
              return (
                '✓ ' + t('Backup creado: {archivo}', { archivo: b.archivo.split('/').pop() ?? '' })
              )
            })
          }
        >
          {t('Hacer backup ahora')}
        </button>
        <button
          className="aj-boton"
          disabled={ocupado}
          onClick={async () => {
            const a = await window.diario.backups.elegirArchivo()
            if (a) void restaurar(a)
          }}
        >
          {t('Restaurar backup…')}
        </button>
        <button className="aj-boton" disabled={ocupado} onClick={() => setImportando('diarium')}>
          {t('Importar desde Diarium…')}
        </button>
        <button className="aj-boton" disabled={ocupado} onClick={() => setImportando('joplin')}>
          {t('Importar desde Joplin…')}
        </button>
        <button
          className="aj-boton aj-peligro"
          disabled={ocupado}
          onClick={() => setRestableciendo((x) => !x)}
        >
          {t('Restablecer diario…')}
        </button>
      </div>
      {restableciendo && (
        <Restablecer
          cancelar={() => setRestableciendo(false)}
          listo={() => {
            setRestableciendo(false)
            setMsj('✓ ' + t('Diario vaciado. Antes se hizo un backup por si quieres volver atrás.'))
            void window.diario.backups.listar().then(setLista)
            alRestaurar()
          }}
        />
      )}
      {importando && (
        <Importar fuente={importando} cerrar={() => setImportando(null)} alTerminar={alRestaurar} />
      )}
      {pidiendo && (
        <form
          className="aj-span aj-fila"
          onSubmit={(e) => {
            e.preventDefault()
            void restaurar(pidiendo, clave)
          }}
        >
          <input
            type="password"
            autoFocus
            placeholder={t('Contraseña del backup')}
            value={clave}
            onChange={(e) => setClave(e.target.value)}
          />
          <button className="aj-boton" disabled={!clave || ocupado}>
            {t('Restaurar')}
          </button>
        </form>
      )}
      {msj && <span className="aj-nota aj-span">{msj}</span>}
      {lista.length > 0 && (
        <div className="aj-span aj-backups">
          {lista.slice(0, 8).map((b) => (
            <div key={b.archivo}>
              <span>{new Date(b.fecha).toLocaleString(locale())}</span>
              <span>{(b.tamano / 1048576).toFixed(1)} MB</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const lugar = (c: Ciudad): string => [c.nombre, c.region, c.pais].filter(Boolean).join(', ')

/** Clima: ciudad fija (sin GPS), automático, unidades, luna y sol (cada uno por su lado). */
function ClimaAjustes(): React.JSX.Element {
  const [aj, setAj] = useState<AjustesClima | null>(null)
  const [cambiando, setCambiando] = useState(false)
  const [texto, setTexto] = useState('')
  const [res, setRes] = useState<{ para: string; lista: Ciudad[] } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    void window.diario.clima.ajustes().then((a) => {
      setAj(a)
      if (!a.ciudad) setCambiando(true)
    })
  }, [])

  // Buscar ciudades mientras se escribe (Open-Meteo, 400 ms de espera)
  useEffect(() => {
    const q = texto.trim()
    if (q.length < 2) return
    let cancelado = false
    const espera = setTimeout(() => {
      window.diario.clima
        .buscarCiudad(q)
        .then((lista) => {
          if (cancelado) return
          setError('')
          setRes({ para: q, lista })
        })
        .catch((e: Error) => !cancelado && setError(e.message))
    }, 400)
    return () => {
      cancelado = true
      clearTimeout(espera)
    }
  }, [texto])

  if (!aj) return <div />
  const guardar = async (c: Partial<AjustesClima>): Promise<void> =>
    setAj(await window.diario.clima.guardarAjustes(c))
  const lista = texto.trim().length >= 2 && res?.para === texto.trim() ? res.lista : null

  return (
    <div className="aj-form">
      <label>{t('Ciudad:')}</label>
      {cambiando ? (
        <span className="aj-fila">
          <input
            autoFocus
            className="aj-ciudad-campo"
            placeholder={t('Escribe tu ciudad…')}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          {aj.ciudad && (
            <button className="aj-boton" onClick={() => setCambiando(false)}>
              {t('Cancelar')}
            </button>
          )}
        </span>
      ) : (
        <span className="aj-fila">
          <span className="aj-ruta">{aj.ciudad ? lugar(aj.ciudad) : t('Ninguna')}</span>
          <button
            className="aj-boton"
            onClick={() => {
              setTexto('')
              setCambiando(true)
            }}
          >
            {t('Cambiar…')}
          </button>
        </span>
      )}
      {cambiando && (lista || error) && (
        <div className="aj-span aj-ciudades">
          {error && <div className="aj-nota">{error}</div>}
          {lista?.length === 0 && (
            <div className="aj-nota">{t('No se encontró ninguna ciudad con ese nombre.')}</div>
          )}
          {lista?.map((c) => (
            <button
              key={`${c.lat},${c.lon}`}
              onClick={() => {
                void guardar({ ciudad: c })
                setCambiando(false)
                setTexto('')
              }}
            >
              <span>{c.nombre}</span>
              <span className="aj-ciudad-extra">
                {[c.region, c.pais].filter(Boolean).join(', ')}
              </span>
            </button>
          ))}
        </div>
      )}
      <span />
      <label className="aj-casilla">
        <input
          type="checkbox"
          checked={aj.auto}
          onChange={(e) => void guardar({ auto: e.target.checked })}
        />
        {t('Agregar el clima automáticamente a las entradas nuevas')}
      </label>
      <label>{t('Unidades:')}</label>
      <select
        value={aj.unidad}
        onChange={(e) => void guardar({ unidad: e.target.value as 'C' | 'F' })}
      >
        <option value="C">Celsius (°C)</option>
        <option value="F">Fahrenheit (°F)</option>
      </select>
      <span />
      <label className="aj-casilla">
        <input
          type="checkbox"
          checked={aj.cielo}
          onChange={(e) => void guardar({ cielo: e.target.checked })}
        />
        {t('Mostrar la fase lunar en las entradas')}
      </label>
      <span />
      <label className="aj-casilla">
        <input
          type="checkbox"
          checked={aj.sol}
          onChange={(e) => void guardar({ sol: e.target.checked })}
        />
        {t('Mostrar el amanecer y el atardecer en las entradas')}
      </label>
      <span className="aj-nota aj-span">
        {t(
          t(
            'El clima lo da Open-Meteo (gratis, sin cuenta). Solo se envían las coordenadas de la ciudad y la fecha de la entrada; nunca el texto del diario. La ciudad se guarda cifrada dentro del diario. Para entradas viejas se usa el archivo histórico (desde 1940). La fase lunar se calcula en tu equipo.'
          )
        )}
      </span>
    </div>
  )
}

const GRUPOS_ACENTO = ['Brillantes', 'Poco brillo', 'Pastel', 'Oscuros'] as const
const GRUPOS_SKIN = [
  'Originales',
  'Originales (claros)',
  'Nuevos oscuros',
  'Nuevos claros'
] as const

/** Miniatura de un skin: barra de arriba, barra lateral y dos "días" del calendario. */
function SkinMuestra({
  nombre,
  c,
  sel,
  elegir
}: {
  nombre: string
  c: Paleta
  sel: boolean
  elegir: () => void
}): React.JSX.Element {
  const [fondo, panel, panel2, borde, texto, , acento, barra] = c
  return (
    <button
      className={'aj-skin' + (sel ? ' sel' : '')}
      style={{ borderColor: sel ? undefined : borde }}
      title={nombre}
      aria-pressed={sel}
      onClick={elegir}
    >
      <span className="aj-skin-vista" style={{ background: fondo }}>
        <span className="aj-skin-barra" style={{ background: barra }} />
        <span className="aj-skin-lat" style={{ background: panel }}>
          <i style={{ background: acento }} />
          <i style={{ background: borde }} />
          <i style={{ background: borde }} />
        </span>
        <span className="aj-skin-dias">
          <i style={{ background: panel2 }} />
          <i style={{ background: acento }} />
          <i style={{ background: panel2 }} />
          <i style={{ background: panel2 }} />
        </span>
      </span>
      <span className="aj-skin-nom" style={{ background: panel, color: texto }}>
        {sel && <Check size={12} strokeWidth={2.5} />}
        {nombre}
      </span>
    </button>
  )
}

function Apariencia({
  aj,
  guardar
}: {
  aj: TAjustes
  guardar: (c: Partial<TAjustes>) => Promise<void>
}): React.JSX.Element {
  const TAMANOS = [13, 14, 15, 15.5, 16, 17, 18, 20, 22, 24, 26, 28, 30, 32, 34]
  const skin = aj.skin === SKIN_CLASICO ? null : skinPorId(aj.skin)
  return (
    <div className="aj-form">
      <span className="aj-span aj-seccion">{t('Skin')}</span>
      <div className="aj-span aj-skins">
        <SkinMuestra
          nombre={t('Clásico')}
          c={CLASICO_PALETA[aj.tema === 'claro' ? 'claro' : 'oscuro']}
          sel={aj.skin === SKIN_CLASICO}
          elegir={() =>
            void guardar({
              skin: SKIN_CLASICO,
              ...(aj.acento === ACENTO_SKIN ? { acento: 'azul' } : {})
            })
          }
        />
        {GRUPOS_SKIN.map((g) => (
          <Fragment key={g}>
            <span className="aj-nota aj-skins-grupo">{t(g)}</span>
            {SKINS.filter((x) => x.grupo === g).map((x) => (
              <SkinMuestra
                key={x.id}
                nombre={t(x.nombre)}
                c={x.c}
                sel={aj.skin === x.id}
                elegir={() => void guardar({ skin: x.id, acento: ACENTO_SKIN })}
              />
            ))}
          </Fragment>
        ))}
      </div>
      <label>{t('Tema:')}</label>
      <select
        value={aj.tema}
        disabled={!!skin}
        title={skin ? t('El skin elegido ya decide si es claro u oscuro') : undefined}
        onChange={(e) => void guardar({ tema: e.target.value as TAjustes['tema'] })}
      >
        <option value="oscuro">{t('Oscuro')}</option>
        <option value="claro">{t('Claro')}</option>
        <option value="sistema">{t('Como el sistema')}</option>
      </select>
      <label className="aj-arriba">{t('Color de acento:')}</label>
      <div className="aj-acentos">
        {skin && (
          <div className="aj-acento-grupo">
            <span className="aj-nota">{t('El del skin')}</span>
            <div className="aj-acento-fila">
              <button
                className={'aj-acento aj-acento-skin' + (aj.acento === ACENTO_SKIN ? ' sel' : '')}
                style={{ background: skin.c[7], color: acentoDeSkin(skin).texto }}
                title={t('El de {nombre}', { nombre: t(skin.nombre) })}
                aria-label={t('Acento de {nombre}', { nombre: t(skin.nombre) })}
                aria-pressed={aj.acento === ACENTO_SKIN}
                onClick={() => void guardar({ acento: ACENTO_SKIN })}
              >
                {aj.acento === ACENTO_SKIN ? (
                  <Check size={14} strokeWidth={2.5} />
                ) : (
                  <span className="aj-acento-punto" style={{ background: skin.c[6] }} />
                )}
              </button>
            </div>
          </div>
        )}
        {GRUPOS_ACENTO.map((g) => (
          <div key={g} className="aj-acento-grupo">
            <span className="aj-nota">{t(g)}</span>
            <div className="aj-acento-fila">
              {ACENTOS.filter((a) => a.grupo === g).map((a) => (
                <button
                  key={a.id}
                  className={'aj-acento' + (aj.acento === a.id ? ' sel' : '')}
                  style={{ background: a.acento, color: a.texto }}
                  title={t(a.nombre)}
                  aria-label={t(a.nombre)}
                  aria-pressed={aj.acento === a.id}
                  onClick={() => void guardar({ acento: a.id })}
                >
                  {aj.acento === a.id && <Check size={14} strokeWidth={2.5} />}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <label>{t('Barra superior:')}</label>
      <select
        value={aj.barra}
        onChange={(e) => void guardar({ barra: e.target.value as TAjustes['barra'] })}
      >
        <option value="color">{t('Con color (degradado)')}</option>
        <option value="plana">{t('Con color (plana)')}</option>
        <option value="discreta">{t('Discreta (línea de color)')}</option>
      </select>
      <span />
      <label className="aj-casilla">
        <input
          type="checkbox"
          checked={aj.lateralTinte}
          onChange={(e) => void guardar({ lateralTinte: e.target.checked })}
        />
        {t('Barra lateral teñida con el color de acento')}
      </label>
      <span />
      <label className="aj-casilla">
        <input
          type="checkbox"
          checked={aj.fondoTinte}
          onChange={(e) => void guardar({ fondoTinte: e.target.checked })}
        />
        {t('Fondo con un toque del color de acento')}
      </label>
      <FondoYTexto aj={aj} guardar={guardar} />
      <label>{t('Fuente del texto:')}</label>
      <select
        value={aj.fuenteTexto}
        onChange={(e) => void guardar({ fuenteTexto: e.target.value as TAjustes['fuenteTexto'] })}
      >
        <option value="sans">{t('Sans (Noto Sans)')}</option>
        <option value="serif">{t('Serif (como un libro)')}</option>
        <option value="mono">{t('Monoespaciada (máquina de escribir)')}</option>
        <option value="sistema">{t('La del sistema')}</option>
      </select>
      <label>{t('Tamaño del texto:')}</label>
      <select
        value={aj.tamTexto}
        onChange={(e) => void guardar({ tamTexto: Number(e.target.value) })}
      >
        {TAMANOS.concat(TAMANOS.includes(aj.tamTexto) ? [] : [aj.tamTexto])
          .sort((a, b) => a - b)
          .map((px) => (
            <option key={px} value={px}>
              {px} px{px === 15.5 ? ` (${t('normal')})` : ''}
            </option>
          ))}
      </select>
      <span />
      <label className="aj-casilla">
        <input
          type="checkbox"
          checked={aj.encabezados}
          onChange={(e) => void guardar({ encabezados: e.target.checked })}
        />
        {t('Título en las entradas')}
      </label>
      <span />
      <label className="aj-casilla">
        <input
          type="checkbox"
          checked={aj.etiquetasEnListas}
          onChange={(e) => void guardar({ etiquetasEnListas: e.target.checked })}
        />
        {t('Mostrar etiquetas y personas en la línea de tiempo y la búsqueda')}
      </label>
      <span className="aj-nota aj-span">
        {t('El tamaño de TODA la interfaz se cambia en General (o con Ctrl + y Ctrl −).')}
      </span>
    </div>
  )
}

/** Plantilla con la que empieza cada entrada nueva + botón para gestionarlas. */
function PlantillaDefecto(): React.JSX.Element {
  const [lista, setLista] = useState<Plantilla[]>([])
  const [defecto, setDefecto] = useState<string | null>(null)
  const [gestionando, setGestionando] = useState(false)

  const leerDefecto = (): void => void window.diario.plantillas.defecto().then(setDefecto)
  useEffect(() => {
    void window.diario.plantillas.listar().then(setLista)
    leerDefecto()
  }, [])

  return (
    <>
      <label>{t('Plantilla para entradas nuevas:')}</label>
      <span className="aj-fila">
        <select
          value={defecto ?? ''}
          onChange={async (e) => {
            const id = e.target.value || null
            await window.diario.plantillas.elegirDefecto(id)
            setDefecto(id)
          }}
        >
          <option value="">{t('Ninguna (en blanco)')}</option>
          {lista.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
        <button className="aj-boton" onClick={() => setGestionando(true)}>
          {t('Gestionar plantillas…')}
        </button>
      </span>
      {gestionando && (
        <Plantillas
          cerrar={() => setGestionando(false)}
          alCambiar={(l) => {
            setLista(l)
            leerDefecto() // al eliminar la predeterminada, main la quita
          }}
        />
      )}
    </>
  )
}

const num = (n: number, dec = 0): string =>
  n.toLocaleString(locale(), { minimumFractionDigits: dec, maximumFractionDigits: dec })

/** Estadísticas del diario (captura 8): etiqueta a la derecha, valor a la izquierda. */
function EstadisticasAjustes(): React.JSX.Element {
  const [e, setE] = useState<Estadisticas | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    window.diario.diarioExtra
      .estadisticas()
      .then(setE)
      .catch((x: Error) => setError(x.message))
  }, [])
  if (error) return <p className="aj-nota">⚠ {error}</p>
  if (!e) return <p className="aj-nota">{t('Calculando…')}</p>
  const dias = (n: number): string => tn(n, t('1 día'), t('{n} días'))
  const filas: [string, string][] = [
    ['Tamaño de la base de datos', tamanoLegible(e.tamanoBase)],
    ['Tamaño de los adjuntos', tamanoLegible(e.tamanoAdjuntos)],
    ['Entradas', num(e.entradas)],
    ['Días con entrada', num(e.dias)],
    ['Primera entrada', e.primera ? corta(e.primera) : '-'],
    ['Racha actual', dias(e.rachaActual)],
    ['Racha más larga', dias(e.rachaMaxima)],
    ['Adjuntos (total)', num(e.adjuntos)],
    ['Fotos', num(e.fotos)],
    ['Videos', num(e.videos)],
    ['Audios', num(e.audios)],
    ['Archivos', num(e.archivos)],
    [
      'Calificación promedio',
      e.calificacionPromedio === null
        ? '-'
        : `${num(e.calificacionPromedio, 2)} (${t('{n} calificadas', { n: num(e.calificadas) })})`
    ],
    ['Palabras (total)', num(e.palabras)],
    ['Mínimo de palabras por entrada', num(e.palabrasMin)],
    ['Máximo de palabras por entrada', num(e.palabrasMax)],
    ['Promedio de palabras por entrada', num(e.palabrasPromedio, 2)],
    [
      'Etiqueta más usada',
      e.etiquetaMasUsada
        ? `${e.etiquetaMasUsada.nombre} (${num(e.etiquetaMasUsada.cantidad)})`
        : '-'
    ],
    [
      'Persona más etiquetada',
      e.personaMasEtiquetada
        ? `${e.personaMasEtiquetada.nombre} (${num(e.personaMasEtiquetada.cantidad)})`
        : '-'
    ]
  ]
  return (
    <div className="aj-stats">
      {filas.map(([k, v]) => (
        <Fragment key={k}>
          <span className="aj-stats-k">{t(k)}:</span>
          <span className="aj-stats-v">{v}</span>
        </Fragment>
      ))}
    </div>
  )
}

// Licencias de lo que va dentro de la app (todas libres)
const LICENCIAS: [string, string][] = [
  ['Electron', 'MIT'],
  ['React', 'MIT'],
  ['TipTap / ProseMirror', 'MIT'],
  ['better-sqlite3-multiple-ciphers (SQLite + SQLCipher)', 'MIT / dominio público / BSD'],
  ['hash-wasm (Argon2id)', 'MIT'],
  ['DOMPurify', 'MPL-2.0 o Apache-2.0'],
  ['marked', 'MIT'],
  ['react-virtuoso', 'MIT'],
  ['Lucide (íconos)', 'ISC'],
  ['docx', 'MIT'],
  ['node-html-parser', 'MIT'],
  ['Open-Meteo (datos del clima)', 'CC BY 4.0']
]

function AcercaDe(): React.JSX.Element {
  const [a, setA] = useState<Awaited<ReturnType<typeof window.diario.diarioExtra.acercaDe>> | null>(
    null
  )
  useEffect(() => {
    void window.diario.diarioExtra.acercaDe().then(setA)
  }, [])
  if (!a) return <div />
  return (
    <div className="aj-acerca">
      <div className="aj-acerca-nombre">diarLinux</div>
      <div className="aj-nota">
        {t('Versión {v} · tu diario personal, cifrado y solo en tu equipo', { v: a.version })}
      </div>
      <div className="aj-stats">
        <span className="aj-stats-k">{t('Carpeta del diario:')}</span>
        <span className="aj-stats-v aj-fila">
          <span className="aj-ruta" title={a.carpeta}>
            {a.carpeta}
          </span>
          <button
            className="aj-boton"
            onClick={() => void window.diario.diarioExtra.abrirCarpeta()}
          >
            {t('Abrir')}
          </button>
        </span>
        <span className="aj-stats-k">{t('Configuración:')}</span>
        <span className="aj-stats-v aj-ruta" title={a.config}>
          {a.config}
        </span>
        <span className="aj-stats-k">Electron:</span>
        <span className="aj-stats-v">{a.electron}</span>
        <span className="aj-stats-k">Chromium:</span>
        <span className="aj-stats-v">{a.chrome}</span>
        <span className="aj-stats-k">Node.js:</span>
        <span className="aj-stats-v">{a.node}</span>
      </div>
      <h4>{t('Licencias')}</h4>
      <div className="aj-stats">
        {LICENCIAS.map(([n, l]) => (
          <Fragment key={n}>
            <span className="aj-stats-k">{t(n)}</span>
            <span className="aj-stats-v">{t(l)}</span>
          </Fragment>
        ))}
      </div>
    </div>
  )
}

/** Vaciar el diario: hay que escribir BORRAR TODO y la contraseña (main hace un backup antes). */
function Restablecer({
  cancelar,
  listo
}: {
  cancelar: () => void
  listo: () => void
}): React.JSX.Element {
  const [palabra, setPalabra] = useState('')
  const [clave, setClave] = useState('')
  const [msj, setMsj] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const PALABRA_BORRAR = t('BORRAR TODO')
  const ok = palabra.trim() === PALABRA_BORRAR && !!clave

  const enviar = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!ok) return
    setOcupado(true)
    setMsj('')
    try {
      await window.diario.diarioExtra.vaciar(clave)
      listo()
    } catch (err) {
      setMsj('⚠ ' + (err as Error).message)
    } finally {
      setOcupado(false)
    }
  }

  return (
    <form className="aj-span aj-col aj-restablecer" onSubmit={(e) => void enviar(e)}>
      <span className="aj-nota">
        {t(
          t(
            'Se borran TODAS las entradas, fotos, audios, videos, archivos, etiquetas, personas y plantillas. La contraseña, el código de recuperación y los ajustes se mantienen. Antes se hace un backup automático: si te arrepientes, lo puedes restaurar.'
          )
        )}
      </span>
      <span className="aj-nota">
        {t('Para confirmar, escribe')} <b>{PALABRA_BORRAR}</b> {t('y tu contraseña:')}
      </span>
      <input
        autoFocus
        placeholder={PALABRA_BORRAR}
        value={palabra}
        onChange={(e) => setPalabra(e.target.value)}
      />
      <input
        type="password"
        placeholder={t('Contraseña')}
        value={clave}
        onChange={(e) => setClave(e.target.value)}
      />
      <span className="aj-fila">
        <button type="button" className="aj-boton" onClick={cancelar}>
          {t('Cancelar')}
        </button>
        <button className="aj-boton aj-peligro" disabled={!ok || ocupado}>
          {ocupado ? t('Borrando…') : t('Borrar todo el diario')}
        </button>
      </span>
      {msj && <span className="aj-nota">{msj}</span>}
    </form>
  )
}

/** Recordatorio diario, bandeja del sistema e iniciar con el sistema. */
function Notificaciones({
  aj,
  guardar
}: {
  aj: TAjustes
  guardar: (c: Partial<TAjustes>) => Promise<void>
}): React.JSX.Element {
  const [error, setError] = useState('')
  const intentar = async (c: Partial<TAjustes>): Promise<void> => {
    setError('')
    try {
      await guardar(c)
    } catch (e) {
      setError('⚠ ' + (e as Error).message)
    }
  }
  return (
    <div className="aj-form">
      <span className="aj-span aj-seccion">{t('Recordatorio diario')}</span>
      <span />
      <label className="aj-casilla">
        <input
          type="checkbox"
          checked={aj.recordatorio}
          onChange={(e) => void intentar({ recordatorio: e.target.checked })}
        />
        {t('Avisarme si todavía no he escrito ese día')}
      </label>
      <label>{t('Hora:')}</label>
      <input
        type="time"
        className="aj-hora"
        disabled={!aj.recordatorio}
        value={aj.recordatorioHora}
        onChange={(e) => e.target.value && void intentar({ recordatorioHora: e.target.value })}
      />
      <span className="aj-nota aj-span">
        {t(
          t(
            'Llega como una notificación del sistema; al tocarla se abre una entrada nueva para hoy. Solo funciona mientras diarLinux está abierto (también si está escondido en la bandeja). Con el diario bloqueado no se puede saber si ya escribiste, así que pregunta igual.'
          )
        )}
      </span>

      <span className="aj-span aj-seccion">{t('Bandeja del sistema')}</span>
      <span />
      <label className="aj-casilla">
        <input
          type="checkbox"
          checked={aj.bandeja}
          onChange={(e) =>
            void intentar(
              e.target.checked ? { bandeja: true } : { bandeja: false, cerrarABandeja: false }
            )
          }
        />
        {t('Mostrar el ícono en la bandeja (abrir, nueva entrada, bloquear, salir)')}
      </label>
      <span />
      <label className="aj-casilla">
        <input
          type="checkbox"
          disabled={!aj.bandeja}
          checked={aj.cerrarABandeja}
          onChange={(e) => void intentar({ cerrarABandeja: e.target.checked })}
        />
        {t('Al cerrar la ventana, esconderla en la bandeja en vez de salir')}
      </label>
      <span />
      <label className="aj-casilla">
        <input
          type="checkbox"
          checked={aj.iniciarConSistema}
          onChange={(e) => void intentar({ iniciarConSistema: e.target.checked })}
        />
        {t('Abrir diarLinux al iniciar la sesión')}
      </label>
      <span className="aj-nota aj-span">
        {t(
          t(
            'Con la bandeja activada, al iniciar la sesión arranca escondido en ella (listo para el recordatorio). Para salir del todo usa «Salir» en el menú del ícono.'
          )
        )}
      </span>
      {error && <span className="aj-nota aj-span">{error}</span>}
    </div>
  )
}

/**
 * Luz y calidez del fondo y suavidad del texto (ni tan oscuro ni tan blanco que
 * canse la vista). Se ve en vivo mientras se mueve y se guarda al soltar; el texto siempre se lee.
 */
function FondoYTexto({
  aj,
  guardar
}: {
  aj: TAjustes
  guardar: (c: Partial<TAjustes>) => Promise<void>
}): React.JSX.Element {
  type Clave = 'fondoLuz' | 'fondoCalidez' | 'textoSuave'
  const [v, setV] = useState({
    fondoLuz: aj.fondoLuz,
    fondoCalidez: aj.fondoCalidez,
    textoSuave: aj.textoSuave
  })
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cambiar = (c: Partial<Record<Clave, number>>): void => {
    const nuevo = { ...v, ...c }
    setV(nuevo)
    aplicarApariencia({ ...aj, ...nuevo }) // se ve al instante
    if (espera.current) clearTimeout(espera.current)
    espera.current = setTimeout(() => void guardar(nuevo), 250) // los tres juntos: no se pierde ninguno
  }
  useEffect(
    () => () => {
      if (espera.current) clearTimeout(espera.current)
    },
    []
  )
  const fila = (
    clave: Clave,
    titulo: string,
    min: number,
    izq: string,
    der: string
  ): React.JSX.Element => (
    <>
      <label htmlFor={'aj-' + clave}>{t(titulo)}:</label>
      <span className="aj-fila aj-deslizador">
        <span className="aj-nota">{t(izq)}</span>
        <input
          id={'aj-' + clave}
          type="range"
          min={min}
          max={100}
          step={1}
          value={v[clave]}
          onChange={(e) => cambiar({ [clave]: Number(e.target.value) })}
          onDoubleClick={() => cambiar({ [clave]: 0 })}
        />
        <span className="aj-nota">{t(der)}</span>
      </span>
    </>
  )
  const tocado = v.fondoLuz !== 0 || v.fondoCalidez !== 0 || v.textoSuave !== 0
  return (
    <>
      <span className="aj-span aj-seccion">{t('Fondo y texto')}</span>
      {fila('fondoLuz', 'Luz del fondo', -100, 'Más oscuro', 'Más claro')}
      {fila('fondoCalidez', 'Calidez', -100, 'Azulado', 'Cálido')}
      {fila('textoSuave', 'Brillo del texto', 0, 'Normal', 'Más suave')}
      <span />
      <span className="aj-fila">
        <button
          className="aj-boton"
          disabled={!tocado}
          onClick={() => cambiar({ fondoLuz: 0, fondoCalidez: 0, textoSuave: 0 })}
        >
          {t('Como el skin')}
        </button>
        <span className="aj-nota">
          {t('Doble clic en un deslizador lo vuelve al medio. El texto siempre queda legible.')}
        </span>
      </span>
    </>
  )
}
