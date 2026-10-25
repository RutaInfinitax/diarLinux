import { Check, Pipette, Tag, User } from 'lucide-react'
import type { TipoGrupo } from '../../../shared/tipos'
import { es } from '../i18n'
import { COLORES_CHIP, COLORES_SUAVES, COLORES_VIVOS } from '../util/chips'
import { textoSobre } from '../../../shared/temas'
import { t } from '../../../shared/i18n'
import './chips.css'

/** Ícono de los chips: etiqueta o persona (captura 2timeline). */
export function IconoGrupo({ tipo }: { tipo: TipoGrupo }): React.JSX.Element {
  const Icono = tipo === 'etiqueta' ? Tag : User
  return <Icono size={12} strokeWidth={2} />
}

/**
 * Muestras de color para etiquetas y personas: la predeterminada (null), los suaves, los vivos y
 * "otro color" (cualquiera). No roban el foco (así un campo de texto abierto sigue escribiéndose).
 */
export function Paleta({
  valor,
  alElegir,
  chica = false
}: {
  valor: string | null
  alElegir: (c: string | null) => void
  chica?: boolean
}): React.JSX.Element {
  const muestra = (c: { color: string | null; nombre: string }): React.JSX.Element => (
    <button
      key={c.color ?? 'predeterminado'}
      type="button"
      className={'paleta-muestra' + (valor === c.color ? ' sel' : '')}
      style={{
        background: c.color ?? 'var(--chip)',
        color: c.color ? textoSobre(c.color) : 'var(--chip-texto)'
      }}
      title={t(c.nombre)}
      aria-label={t(c.nombre)}
      aria-pressed={valor === c.color}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => alElegir(c.color)}
    >
      {valor === c.color && <Check size={chica ? 11 : 14} />}
    </button>
  )
  const propio = !!valor && !COLORES_CHIP.some((c) => c.color === valor)
  return (
    <div className={'paleta' + (chica ? ' chica' : '')}>
      {muestra({ color: null, nombre: es.grupos.predeterminado })}
      {COLORES_SUAVES.map(muestra)}
      <span className="paleta-corte" />
      {COLORES_VIVOS.map(muestra)}
      <label
        className={'paleta-muestra paleta-otro' + (propio ? ' sel' : '')}
        title={t('Otro color…')}
        style={propio ? { background: valor!, color: textoSobre(valor!) } : undefined}
        onMouseDown={(e) => e.preventDefault()}
      >
        {propio ? <Check size={chica ? 11 : 14} /> : <Pipette size={chica ? 11 : 14} />}
        <input type="color" value={valor ?? '#2f80ed'} onChange={(e) => alElegir(e.target.value)} />
      </label>
    </div>
  )
}
