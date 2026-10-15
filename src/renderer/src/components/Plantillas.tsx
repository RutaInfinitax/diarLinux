/**
 * Gestionar plantillas: lista a la izquierda; nombre y editor (el mismo de las entradas, con su
 * barra de formato) a la derecha. Se guarda con el botón; al cambiar de plantilla con cambios sin
 * guardar se pregunta.
 */
import { useEffect, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import DOMPurify from 'dompurify'
import { Plus } from 'lucide-react'
import type { Plantilla } from '../../../shared/tipos'
import { extensionesEditor } from '../util/extensiones'
import { Herramientas } from '../views/Editor'
import './plantillas.css'
import { confirmar } from '../util/dialogo'
import { t } from '../../../shared/i18n'

const NUEVA = '' // id de la plantilla que todavía no se guardó

export function Plantillas({
  cerrar,
  alCambiar
}: {
  cerrar: () => void
  /** La lista cambió (para refrescar el selector de la predeterminada) */
  alCambiar: (lista: Plantilla[]) => void
}): React.JSX.Element {
  const [lista, setLista] = useState<Plantilla[]>([])
  const [sel, setSel] = useState<string | null>(null)
  const [nombre, setNombre] = useState('')
  const [cambios, setCambios] = useState(false)
  const [msj, setMsj] = useState('')
  const editor = useEditor({
    extensions: extensionesEditor(t('Escribe el texto de la plantilla…')),
    editorProps: { attributes: { class: 'ed-cuerpo pl-doc', spellcheck: 'true' } },
    onUpdate: () => setCambios(true)
  })

  const recargar = async (): Promise<Plantilla[]> => {
    const l = await window.diario.plantillas.listar()
    setLista(l)
    alCambiar(l)
    return l
  }

  const abrir = (p: Plantilla | null): void => {
    setSel(p ? p.id : NUEVA)
    setNombre(p ? p.nombre : '')
    editor?.commands.setContent(p ? DOMPurify.sanitize(p.html) : '', { emitUpdate: false })
    setCambios(false)
    setMsj('')
  }

  // Al tener el editor: cargar la lista y abrir la primera
  useEffect(() => {
    if (!editor) return
    void window.diario.plantillas.listar().then((l) => {
      setLista(l)
      const p = l[0]
      setSel(p ? p.id : NUEVA)
      setNombre(p ? p.nombre : '')
      editor.commands.setContent(p ? DOMPurify.sanitize(p.html) : '', { emitUpdate: false })
    })
  }, [editor])

  const seguro = async (): Promise<boolean> =>
    !cambios ||
    (await confirmar(t('La plantilla tiene cambios sin guardar. ¿Descartarlos?'), {
      aceptar: t('Descartar'),
      peligro: true
    }))

  useEffect(() => {
    const esc = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.stopPropagation() // que no cierre también la Configuración
      void seguro().then((ok) => ok && cerrar())
    }
    window.addEventListener('keydown', esc, true)
    return () => window.removeEventListener('keydown', esc, true)
  })

  const guardar = async (): Promise<void> => {
    if (!editor) return
    try {
      const p = await window.diario.plantillas.guardar({
        id: sel || undefined,
        nombre: nombre.trim(),
        html: editor.isEmpty ? '' : editor.getHTML()
      })
      await recargar()
      setSel(p.id)
      setCambios(false)
      setMsj('✓ ' + t('Guardada'))
    } catch (e) {
      setMsj('⚠ ' + (e as Error).message)
    }
  }

  const eliminar = async (): Promise<void> => {
    if (sel === null) return
    if (sel === NUEVA) return abrir(lista[0] ?? null)
    const p = lista.find((x) => x.id === sel)
    if (
      !(await confirmar(
        t('¿Eliminar la plantilla «{nombre}»? Las entradas ya escritas no cambian.', {
          nombre: p?.nombre ?? ''
        }),
        { aceptar: t('Eliminar'), peligro: true }
      ))
    )
      return
    await window.diario.plantillas.eliminar(sel)
    setCambios(false)
    const l = await recargar()
    abrir(l[0] ?? null)
  }

  return (
    <div
      className="pl-fondo"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) void seguro().then((ok) => ok && cerrar())
      }}
    >
      <div className="pl-ventana" role="dialog" aria-label={t('Plantillas')}>
        <div className="pl-titulo">
          <span>{t('Plantillas')}</span>
          <button className="aj-boton" onClick={() => void seguro().then((ok) => ok && cerrar())}>
            {t('Listo')}
          </button>
        </div>
        <div className="pl-cuerpo">
          <div className="pl-lista">
            {lista.map((p) => (
              <button
                key={p.id}
                className={sel === p.id ? 'sel' : ''}
                onClick={() => sel !== p.id && void seguro().then((ok) => ok && abrir(p))}
              >
                {p.nombre}
              </button>
            ))}
            {sel === NUEVA && (
              <button className="sel pl-nueva">{nombre || t('Nueva plantilla')}</button>
            )}
            {lista.length === 0 && sel !== NUEVA && (
              <span className="pl-vacia">{t('Todavía no tienes plantillas.')}</span>
            )}
            <button
              className="pl-agregar"
              onClick={() => void seguro().then((ok) => ok && abrir(null))}
            >
              <Plus size={14} /> {t('Nueva')}
            </button>
          </div>
          {sel !== null ? (
            <div className="pl-edicion">
              <input
                className="pl-nombre"
                placeholder={t('Nombre de la plantilla')}
                value={nombre}
                maxLength={200}
                onChange={(e) => {
                  setNombre(e.target.value)
                  setCambios(true)
                }}
              />
              <Herramientas editor={editor} />
              <div className="pl-texto">
                <EditorContent editor={editor} />
              </div>
              <div className="pl-acciones">
                <span className="aj-nota">{msj}</span>
                <button className="aj-boton" onClick={() => void eliminar()}>
                  {sel === NUEVA ? t('Descartar') : t('Eliminar')}
                </button>
                <button
                  className="aj-boton pl-guardar"
                  disabled={!nombre.trim() || (!cambios && sel !== NUEVA)}
                  onClick={() => void guardar()}
                >
                  {t('Guardar')}
                </button>
              </div>
            </div>
          ) : (
            <div className="pl-edicion" />
          )}
        </div>
      </div>
    </div>
  )
}
