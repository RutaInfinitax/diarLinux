/**
 * Tira de adjuntos de la entrada (captura escribir.png): fotos, videos, audios y archivos como
 * tarjetas cuadradas en una fila. Foto/video → visor; audio → reproductor con barra de avance;
 * archivo → menú (Abrir, Guardar una copia, Quitar).
 */
import { useEffect, useRef, useState } from 'react'
import { FileText, Mic, Pause, Play, X } from 'lucide-react'
import type { Adjunto } from '../../../shared/tipos'
import { urlAdjunto, urlMini } from '../util/fotos'
import { tamanoLegible, tiempo } from '../util/medios'
import { t } from '../../../shared/i18n'
import './adjuntos.css'

interface Props {
  lista: Adjunto[]
  verMedio: (a: Adjunto) => void
  quitar: (a: Adjunto) => void
  mensaje: (m: string) => void
}

export function Adjuntos({ lista, verMedio, quitar, mensaje }: Props): React.JSX.Element | null {
  const [menu, setMenu] = useState<string | null>(null)
  if (!lista.length) return null
  return (
    <div className="ed-fotos">
      {lista.map((a) => (
        <div
          key={a.id}
          className={`ed-foto adj-${a.tipo}`}
          onMouseLeave={() => menu === a.id && setMenu(null)}
        >
          {a.tipo === 'photo' && (
            <img src={urlMini(a.id)} alt={a.nombre} onClick={() => verMedio(a)} draggable={false} />
          )}
          {a.tipo === 'video' && (
            <div className="adj-video" onClick={() => verMedio(a)} title={a.nombre}>
              <img
                src={urlMini(a.id)}
                alt=""
                draggable={false}
                onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
              />
              <span className="adj-play">
                <Play size={26} fill="currentColor" />
              </span>
              {a.duracion ? <span className="adj-dur">{tiempo(a.duracion)}</span> : null}
            </div>
          )}
          {a.tipo === 'audio' && <Audio a={a} />}
          {a.tipo === 'file' && (
            <button
              className="adj-cuadro"
              onClick={() => setMenu(menu === a.id ? null : a.id)}
              title={a.nombre}
            >
              <FileText size={34} strokeWidth={1.3} />
              <span className="adj-nombre">{a.nombre}</span>
              <span className="adj-info">{tamanoLegible(a.tamano)}</span>
            </button>
          )}
          {menu === a.id && (
            <div className="adj-menu">
              <button
                onClick={async () => {
                  setMenu(null)
                  try {
                    await window.diario.adjuntos.abrir(a.id)
                    mensaje(
                      t(
                        'Abierto: mientras esté abierto queda una copia sin cifrar en la memoria (se borra al bloquear o cerrar)'
                      )
                    )
                  } catch (e) {
                    mensaje('⚠ ' + (e as Error).message)
                  }
                }}
              >
                {t('Abrir')}
              </button>
              <button
                onClick={async () => {
                  setMenu(null)
                  try {
                    const r = await window.diario.adjuntos.guardarCopia(a.id)
                    if (r) mensaje(t('Copia guardada SIN cifrar en {ruta}', { ruta: r }))
                  } catch (e) {
                    mensaje('⚠ ' + (e as Error).message)
                  }
                }}
              >
                {t('Guardar una copia…')}
              </button>
              <button
                className="peligro"
                onClick={() => {
                  setMenu(null)
                  quitar(a)
                }}
              >
                {t('Quitar')}
              </button>
            </div>
          )}
          {a.tipo !== 'file' && (
            <button className="ed-foto-x" onClick={() => quitar(a)} title={t('Quitar')}>
              <X size={13} />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

function Audio({ a }: { a: Adjunto }): React.JSX.Element {
  const ref = useRef<HTMLAudioElement>(null)
  const [sonando, setSonando] = useState(false)
  const [avance, setAvance] = useState(0)
  const [dur, setDur] = useState(a.duracion ?? 0)
  useEffect(() => {
    const el = ref.current
    return () => el?.pause()
  }, [])
  return (
    <div className="adj-cuadro adj-audio" title={a.nombre}>
      <audio
        ref={ref}
        src={urlAdjunto(a.id)}
        preload="metadata"
        onLoadedMetadata={(e) =>
          Number.isFinite(e.currentTarget.duration) && setDur(e.currentTarget.duration)
        }
        onTimeUpdate={(e) => setAvance(e.currentTarget.currentTime)}
        onPlay={() => setSonando(true)}
        onPause={() => setSonando(false)}
        onEnded={() => setSonando(false)}
      />
      <button
        className="adj-audio-boton"
        onClick={() => (sonando ? ref.current?.pause() : void ref.current?.play())}
      >
        {sonando ? <Pause size={22} fill="currentColor" /> : <Mic size={30} strokeWidth={1.3} />}
      </button>
      <span className="adj-nombre">{a.nombre}</span>
      <div
        className="adj-barra"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          if (ref.current && dur) ref.current.currentTime = ((e.clientX - r.left) / r.width) * dur
        }}
      >
        <i style={{ width: dur ? `${(avance / dur) * 100}%` : 0 }} />
      </div>
      <span className="adj-info">
        {sonando || avance ? `${tiempo(avance) || '0:00'} / ${tiempo(dur)}` : tiempo(dur)}
      </span>
    </div>
  )
}
