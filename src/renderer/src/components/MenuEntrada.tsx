/**
 * Menú de clic derecho sobre una tarjeta de entrada (Línea de tiempo): Abrir y Eliminar.
 * Se cierra con un clic afuera, Esc o al elegir. Eliminar pide confirmación (se borran también sus
 * fotos, audios, videos y archivos, como desde la entrada).
 */
import { useEffect, useRef } from 'react'
import { ExternalLink, Trash2 } from 'lucide-react'
import type { ResumenEntrada } from '../../../shared/tipos'
import { es } from '../i18n'
import { corta } from '../util/fechas'
import './menuEntrada.css'
import { confirmar } from '../util/dialogo'
import { t } from '../../../shared/i18n'

export function MenuEntrada({
  e,
  x,
  y,
  abrir,
  eliminada,
  cerrar
}: {
  e: ResumenEntrada
  x: number
  y: number
  abrir: () => void
  eliminada: () => void
  cerrar: () => void
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const fuera = (ev: MouseEvent): void => {
      if (!ref.current?.contains(ev.target as Node)) cerrar()
    }
    const tecla = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') cerrar()
    }
    window.addEventListener('mousedown', fuera)
    window.addEventListener('keydown', tecla)
    window.addEventListener('blur', cerrar)
    return () => {
      window.removeEventListener('mousedown', fuera)
      window.removeEventListener('keydown', tecla)
      window.removeEventListener('blur', cerrar)
    }
  }, [cerrar])

  const eliminar = async (): Promise<void> => {
    cerrar()
    const pregunta = e.titulo
      ? t('¿Eliminar «{titulo}» ({fecha})?', { titulo: e.titulo, fecha: corta(e.fecha) })
      : t('¿Eliminar la entrada del {fecha}?', { fecha: corta(e.fecha) })
    if (
      !(await confirmar(
        pregunta + '\n\n' + t('Se borra también todo lo que tiene adjunto. No se puede deshacer.'),
        { aceptar: t('Eliminar'), peligro: true }
      ))
    )
      return
    await window.diario.entradas.eliminar(e.id)
    eliminada()
  }

  return (
    <div
      ref={ref}
      className="menu-entrada"
      role="menu"
      style={{
        left: Math.min(x, window.innerWidth - 220),
        top: Math.min(y, window.innerHeight - 90)
      }}
      onContextMenu={(ev) => ev.preventDefault()}
    >
      <button
        role="menuitem"
        onClick={() => {
          cerrar()
          abrir()
        }}
      >
        <ExternalLink size={15} /> {es.menuEntrada.abrir}
      </button>
      <button role="menuitem" className="peligro" onClick={() => void eliminar()}>
        <Trash2 size={15} /> {es.menuEntrada.eliminar}
      </button>
    </div>
  )
}
