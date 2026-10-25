/** Grabar audio con el micrófono (MediaRecorder, webm/opus) con indicador y tiempo. */
import { useEffect, useRef, useState } from 'react'
import { tiempo } from '../util/medios'
import { t } from '../../../shared/i18n'

export function Grabadora({
  alTerminar,
  alCancelar,
  alError
}: {
  alTerminar: (datos: Uint8Array, segundos: number) => void
  alCancelar: () => void
  alError: (m: string) => void
}): React.JSX.Element {
  const [seg, setSeg] = useState(0)
  const rec = useRef<MediaRecorder | null>(null)
  const guardar = useRef(false)
  const inicio = useRef(0)

  useEffect(() => {
    let cancelado = false
    let pista: MediaStream | null = null
    const reloj = setInterval(
      () => inicio.current && setSeg((Date.now() - inicio.current) / 1000),
      250
    )
    void (async () => {
      try {
        pista = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        if (cancelado) return pista.getTracks().forEach((x) => x.stop())
        const trozos: Blob[] = []
        const r = new MediaRecorder(pista, { mimeType: 'audio/webm;codecs=opus' })
        r.ondataavailable = (e) => e.data.size && trozos.push(e.data)
        r.onstop = async () => {
          pista?.getTracks().forEach((x) => x.stop())
          if (!guardar.current) return
          const datos = new Uint8Array(await new Blob(trozos, { type: 'audio/webm' }).arrayBuffer())
          alTerminar(datos, (Date.now() - inicio.current) / 1000)
        }
        r.start(1000)
        rec.current = r
        inicio.current = Date.now()
      } catch {
        alError(t('No se pudo usar el micrófono (¿está conectado o lo usa otro programa?)'))
      }
    })()
    return () => {
      cancelado = true
      clearInterval(reloj)
      if (rec.current?.state === 'recording') rec.current.stop()
      pista?.getTracks().forEach((x) => x.stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="grabadora">
      <span className="punto" />
      <span>Grabando… {tiempo(seg) || '0:00'}</span>
      <button
        className="guardar"
        onClick={() => {
          guardar.current = true
          rec.current?.stop()
        }}
      >
        {t('Detener y guardar')}
      </button>
      <button
        onClick={() => {
          guardar.current = false
          rec.current?.stop()
          alCancelar()
        }}
      >
        {t('Cancelar')}
      </button>
    </div>
  )
}
