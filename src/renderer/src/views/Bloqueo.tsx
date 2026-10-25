/**
 * Pantalla de bloqueo (captura 0): panel del color de acento con logo, contraseña y
 * "Desbloquear diario". También el asistente de primer inicio y "¿Olvidaste tu contraseña?".
 */
import { useEffect, useRef, useState } from 'react'
import { Logo } from '../components/Logo'
import { es } from '../i18n'
import { t } from '../../../shared/i18n'
import './bloqueo.css'

type Modo = 'entrar' | 'codigo' | 'crear' | 'mostrar-codigo' | 'restaurar'

function fuerza(c: string): number {
  if (!c) return 0
  let p = 0
  if (c.length >= 8) p++
  if (c.length >= 12) p++
  if (/[a-z]/.test(c) && /[A-Z]/.test(c)) p++
  if (/\d/.test(c)) p++
  if (/[^A-Za-z0-9]/.test(c)) p++
  return Math.min(4, Math.max(0, p - (c.length < 6 ? 1 : 0)))
}

interface Props {
  estado: 'sin-crear' | 'bloqueado'
  carpeta: string
  alAbrir: () => void
}

export function Bloqueo({ estado, carpeta: carpetaInicial, alAbrir }: Props): React.JSX.Element {
  const [modo, setModo] = useState<Modo>(estado === 'sin-crear' ? 'crear' : 'entrar')
  const [clave, setClave] = useState('')
  const [clave2, setClave2] = useState('')
  const [codigo, setCodigo] = useState('')
  const [carpeta, setCarpeta] = useState(carpetaInicial)
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [codigoNuevo, setCodigoNuevo] = useState('')
  const [anotado, setAnotado] = useState(false)
  const [archivo, setArchivo] = useState('')
  const primero = useRef<HTMLInputElement>(null)

  useEffect(() => {
    primero.current?.focus()
  }, [modo])

  const limpiar = (): void => {
    setClave('')
    setClave2('')
    setCodigo('')
    setError('')
  }

  async function intentar(fn: () => Promise<void>): Promise<void> {
    setError('')
    setOcupado(true)
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message)
      primero.current?.select()
    } finally {
      setOcupado(false)
    }
  }

  const entrar = (): Promise<void> =>
    intentar(async () => {
      if (!clave) return
      await window.diario.vault.desbloquear(clave)
      limpiar()
      alAbrir()
    })

  const entrarConCodigo = (): Promise<void> =>
    intentar(async () => {
      if (clave !== clave2) throw new Error(es.bloqueo.noCoinciden)
      await window.diario.vault.desbloquearConCodigo(codigo, clave)
      limpiar()
      alAbrir()
    })

  const crear = (): Promise<void> =>
    intentar(async () => {
      if (clave !== clave2) throw new Error(es.bloqueo.noCoinciden)
      const r = await window.diario.vault.crear(carpeta, clave)
      limpiar()
      setCodigoNuevo(r.codigo)
      setModo('mostrar-codigo')
    })

  const elegirBackup = (): Promise<void> =>
    intentar(async () => {
      const a = await window.diario.backups.elegirArchivo()
      if (a) {
        setArchivo(a)
        setModo('restaurar')
      }
    })

  const restaurar = (): Promise<void> =>
    intentar(async () => {
      const r = await window.diario.backups.restaurar(archivo, clave)
      if ('ok' in r) {
        limpiar()
        alAbrir()
      }
    })

  const f = fuerza(clave)
  const enviar = (e: React.FormEvent, fn: () => Promise<void>): void => {
    e.preventDefault()
    if (!ocupado) void fn()
  }

  return (
    <div className="bloqueo">
      <div className="bloqueo-marca">
        <Logo tam={modo === 'entrar' ? 44 : 36} />
        <span>{es.app}</span>
      </div>

      {modo === 'entrar' && (
        <form className="bloqueo-form" onSubmit={(e) => enviar(e, entrar)}>
          <input
            ref={primero}
            type="password"
            placeholder={es.bloqueo.contrasena}
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            autoComplete="off"
          />
          <button className="bloqueo-boton" disabled={ocupado}>
            {ocupado ? es.bloqueo.abriendo : es.bloqueo.desbloquear}
          </button>
          <p className="bloqueo-error">{error}</p>
          <button
            type="button"
            className="bloqueo-enlace"
            onClick={() => {
              limpiar()
              setModo('codigo')
            }}
          >
            {es.bloqueo.olvide}
          </button>
        </form>
      )}

      {modo === 'codigo' && (
        <form className="bloqueo-form ancho" onSubmit={(e) => enviar(e, entrarConCodigo)}>
          <input
            ref={primero}
            placeholder={es.bloqueo.codigo + ' (XXXX-XXXX-…)'}
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <input
            type="password"
            placeholder={es.bloqueo.nueva}
            value={clave}
            onChange={(e) => setClave(e.target.value)}
          />
          <input
            type="password"
            placeholder={es.bloqueo.repetir}
            value={clave2}
            onChange={(e) => setClave2(e.target.value)}
          />
          <button className="bloqueo-boton" disabled={ocupado}>
            {es.bloqueo.entrarConCodigo}
          </button>
          <p className="bloqueo-error">{error}</p>
          <button
            type="button"
            className="bloqueo-enlace"
            onClick={() => {
              limpiar()
              setModo('entrar')
            }}
          >
            {es.bloqueo.volver}
          </button>
        </form>
      )}

      {modo === 'crear' && (
        <form className="bloqueo-form ancho" onSubmit={(e) => enviar(e, crear)}>
          <h2>{es.asistente.titulo}</h2>
          <p className="bloqueo-texto">{es.asistente.texto}</p>
          <label className="bloqueo-etiqueta">{es.asistente.carpeta}</label>
          <div className="bloqueo-carpeta">
            <span title={carpeta}>{carpeta}</span>
            <button
              type="button"
              onClick={async () => {
                const c = await window.diario.vault.elegirCarpeta()
                if (c) setCarpeta(c)
              }}
            >
              {es.asistente.cambiar}
            </button>
          </div>
          <input
            ref={primero}
            type="password"
            placeholder={es.bloqueo.contrasena}
            value={clave}
            onChange={(e) => setClave(e.target.value)}
          />
          <div className="bloqueo-fuerza" data-f={clave ? f : -1}>
            <i />
            <i />
            <i />
            <i />
            <i />
            <span>{clave ? es.asistente.fuerza[f] : ''}</span>
          </div>
          <input
            type="password"
            placeholder={es.bloqueo.repetir}
            value={clave2}
            onChange={(e) => setClave2(e.target.value)}
          />
          <button className="bloqueo-boton" disabled={ocupado}>
            {ocupado ? es.asistente.creando : es.asistente.crear}
          </button>
          <p className="bloqueo-error">{error}</p>
          <button type="button" className="bloqueo-enlace" onClick={() => void elegirBackup()}>
            {es.asistente.restaurar}
          </button>
        </form>
      )}

      {modo === 'restaurar' && (
        <form className="bloqueo-form ancho" onSubmit={(e) => enviar(e, restaurar)}>
          <p className="bloqueo-texto">
            {t('Escribe la contraseña que tenía el diario cuando se hizo este backup:')}
            <br />
            <b>{archivo.split('/').pop()}</b>
          </p>
          <input
            ref={primero}
            type="password"
            placeholder={es.bloqueo.contrasena}
            value={clave}
            onChange={(e) => setClave(e.target.value)}
          />
          <button className="bloqueo-boton" disabled={ocupado}>
            {ocupado ? es.bloqueo.abriendo : t('Restaurar')}
          </button>
          <p className="bloqueo-error">{error}</p>
          <button
            type="button"
            className="bloqueo-enlace"
            onClick={() => {
              limpiar()
              setModo('crear')
            }}
          >
            {es.bloqueo.volver}
          </button>
        </form>
      )}

      {modo === 'mostrar-codigo' && (
        <div className="bloqueo-form ancho">
          <h2>{es.asistente.codigoTitulo}</h2>
          <p className="bloqueo-texto">{es.asistente.codigoTexto}</p>
          <code className="bloqueo-codigo">{codigoNuevo}</code>
          <label className="bloqueo-check">
            <input
              type="checkbox"
              checked={anotado}
              onChange={(e) => setAnotado(e.target.checked)}
            />
            {es.asistente.anotado}
          </label>
          <button
            className="bloqueo-boton"
            disabled={!anotado}
            onClick={() => {
              setCodigoNuevo('')
              alAbrir()
            }}
          >
            {es.asistente.continuar}
          </button>
        </div>
      )}
    </div>
  )
}
