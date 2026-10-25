import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import type { EstadoDiario } from '../../shared/tipos'
import { Lateral, type Vista } from './components/Lateral'
import { Bloqueo } from './views/Bloqueo'
import { Calendario } from './views/Calendario'
import { olvidarLugares } from './util/recuerdos'
import type { Destino } from './views/Editor'
import { Timeline } from './views/Timeline'
import { EnEsteDia } from './views/EnEsteDia'
import type { EntradaAExportar } from './views/Exportar'
import { hoyIso } from './util/fechas'

// Lo pesado (el editor con TipTap, Configuración, Exportar, Buscar, Etiquetas) se carga recién al
// usarlo: la pantalla de bloqueo y el calendario arrancan con menos código.
const Editor = lazy(() => import('./views/Editor').then((m) => ({ default: m.Editor })))
const Ajustes = lazy(() => import('./views/Ajustes').then((m) => ({ default: m.Ajustes })))
const Exportar = lazy(() => import('./views/Exportar').then((m) => ({ default: m.Exportar })))
const Buscar = lazy(() => import('./views/Buscar').then((m) => ({ default: m.Buscar })))
const Etiquetas = lazy(() => import('./views/Etiquetas').then((m) => ({ default: m.Etiquetas })))

type Lugar = { vista: Vista; editor: Destino | null; aExportar: EntradaAExportar | null }

export function App(): React.JSX.Element {
  const [estado, setEstado] = useState<EstadoDiario | null>(null)
  const [vista, setVista] = useState<Vista>('calendario')
  const [editor, setEditor] = useState<Destino | null>(null)
  const [ajustes, setAjustes] = useState(false)
  const [aExportar, setAExportar] = useState<EntradaAExportar | null>(null)
  const [sinGuardar, setSinGuardar] = useState(false)
  // Atrás: historial de lugares (una vista o una entrada)
  const historial = useRef<Lugar[]>([])
  const [hayAtras, setHayAtras] = useState(false)
  // Cambia cada vez que se abre el diario o se guarda algo: las vistas recargan sus datos
  const [version, setVersion] = useState(0)
  const guardarPendiente = useRef<(() => Promise<void>) | null>(null)
  const [ajustesVersion, setAjustesVersion] = useState(0)
  // Ctrl+F recuerda dónde estabas (vista o entrada exacta) para volver con Esc
  const editorActual = useRef<Destino | null>(null)
  const [antesDeBuscar, setAntesDeBuscar] = useState<{
    vista: Vista
    editor: Destino | null
  } | null>(null)

  const revisar = useCallback(async () => {
    setEstado(await window.diario.vault.estado())
  }, [])

  useEffect(() => {
    void window.diario.vault.estado().then(setEstado)
    // Al bloquear (botón, Ctrl+L, inactividad o suspensión) se borra todo lo descifrado de la pantalla
    const quitarAbrir = window.diario.vault.alAbrirse(() => {
      setVersion((v) => v + 1)
      void revisar()
    })
    const quitarBloquear = window.diario.vault.alBloquear(() => {
      // Primero la pantalla de bloqueo (así ninguna vista llega a pedir datos ya cerrados)
      setEstado((e) => (e ? { estado: 'bloqueado', carpeta: e.carpeta } : e))
      setEditor(null)
      setAjustes(false)
      historial.current = [] // al desbloquear se empieza de cero (no queda rastro de dónde se estaba)
      olvidarLugares()
      setHayAtras(false)
      void revisar()
    })
    return () => {
      quitarAbrir()
      quitarBloquear()
    }
  }, [revisar])

  // Actividad del usuario → reinicia el contador del bloqueo automático (como mucho cada 20 s)
  useEffect(() => {
    let ultima = 0
    const tocar = (): void => {
      const t = Date.now()
      if (t - ultima > 20_000) {
        ultima = t
        window.diario.vault.actividad()
      }
    }
    for (const ev of ['keydown', 'mousedown', 'wheel', 'mousemove'])
      window.addEventListener(ev, tocar, { passive: true })
    return () => {
      for (const ev of ['keydown', 'mousedown', 'wheel', 'mousemove'])
        window.removeEventListener(ev, tocar)
    }
  }, [])

  // ¿El editor tiene cambios sin guardar? (main lo pregunta al cerrar la app)
  const hayPendiente = useRef<(() => boolean) | null>(null)
  const registrarPendiente = useCallback((fn: (() => boolean) | null) => {
    hayPendiente.current = fn
  }, [])
  useEffect(() => {
    window.diario.app.alCerrar(async () => {
      await guardarPendiente.current?.()
    })
    window.diario.app.alPreguntarPendiente(() => hayPendiente.current?.() ?? false)
  }, [])

  // XWayland a veces deja la ventana sin teclado (tras el bloqueo automático, elegir archivos, el
  // visor…): los clics llegan pero no se puede escribir, y se arregla al cambiar de ventana y
  // volver. Si se toca un campo de texto y el foco no llega, la app hace eso mismo sola (main/foco.ts).
  useEffect(() => {
    const desc = (el: Element | null): string =>
      el
        ? el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : '')
        : '-'
    const editable = (el: Element | null): HTMLElement | null =>
      (el?.closest('input, textarea, [contenteditable="true"]') as HTMLElement | null) ?? null
    const tocar = (e: MouseEvent): void => {
      const t = e.target as Element
      const campo = editable(t)
      if (!document.hasFocus()) {
        window.diario.app.registroFoco(`clic sin foco en ${desc(t)}`)
        window.diario.app.enfocar('clic sin foco')
      }
      if (!campo) return
      setTimeout(() => {
        const llego = document.hasFocus() && !!campo.contains(document.activeElement)
        if (llego) return
        window.diario.app.registroFoco(
          `el clic en ${desc(campo)} no dio el foco (documento con foco=${document.hasFocus()}, activo=${desc(document.activeElement)})`
        )
      }, 200)
    }
    const foco = (): void => window.diario.app.registroFoco('foco')
    const sinFoco = (): void => window.diario.app.registroFoco('sin foco')
    const visible = (): void =>
      window.diario.app.registroFoco('visibilidad ' + document.visibilityState)
    window.addEventListener('mousedown', tocar, true)
    window.addEventListener('focus', foco)
    window.addEventListener('blur', sinFoco)
    document.addEventListener('visibilitychange', visible)
    return () => {
      window.removeEventListener('mousedown', tocar, true)
      window.removeEventListener('focus', foco)
      window.removeEventListener('blur', sinFoco)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [])

  // Estables: si cambiaran en cada dibujo, el editor se re-registraría a cada rato
  const registrarGuardado = useCallback((fn: (() => Promise<void>) | null) => {
    guardarPendiente.current = fn
  }, [])
  const alCambiar = useCallback(() => setVersion((v) => v + 1), [])

  const bloquear = useCallback(async () => {
    await guardarPendiente.current?.()
    await window.diario.vault.bloquear()
  }, [])

  // ── Atrás: historial de lugares (una vista o una entrada) ──
  const actualRef = useRef<Lugar>({ vista: 'calendario', editor: null, aExportar: null })
  useEffect(() => {
    actualRef.current = { vista, editor, aExportar }
  })
  /** Anota dónde se está (antes de ir a otro lado), para poder volver con Atrás. */
  const recordar = useCallback((): void => {
    const a = actualRef.current
    // la entrada tal como está ahora (si era nueva y ya se guardó, con su id)
    const l: Lugar = { ...a, editor: a.editor ? (editorActual.current ?? a.editor) : null }
    const h = historial.current
    const tope = h[h.length - 1]
    if (tope && JSON.stringify(tope) === JSON.stringify(l)) return
    h.push(l)
    if (h.length > 100) h.shift()
    setHayAtras(true)
  }, [])

  const abrirEditor = useCallback(
    async (d: Destino) => {
      await guardarPendiente.current?.()
      recordar()
      setEditor(d)
    },
    [recordar]
  )

  // "Nueva entrada" desde la bandeja o la notificación del recordatorio. Si el diario está
  // bloqueado, queda pendiente y se abre al desbloquear.
  const nuevaPendiente = useRef(false)
  const abiertoAhora = estado?.estado === 'abierto'
  useEffect(
    () =>
      window.diario.app.alNuevaEntrada(() => {
        setAjustes(false)
        if (abiertoAhora) void abrirEditor({ fecha: hoyIso() })
        else nuevaPendiente.current = true
      }),
    [abiertoAhora, abrirEditor]
  )
  useEffect(() => {
    if (abiertoAhora && nuevaPendiente.current) {
      nuevaPendiente.current = false
      void abrirEditor({ fecha: hoyIso() })
    }
  }, [abiertoAhora, abrirEditor])

  useEffect(() => {
    const tecla = (e: KeyboardEvent): void => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'l') {
        e.preventDefault()
        void bloquear()
      }
      if (
        e.ctrlKey &&
        !e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === 'n' &&
        estado?.estado === 'abierto'
      ) {
        e.preventDefault()
        void abrirEditor({ fecha: hoyIso() })
      }
      if (
        e.ctrlKey &&
        !e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === 'f' &&
        estado?.estado === 'abierto'
      ) {
        e.preventDefault()
        // Ctrl+F → Buscar (guardando antes lo que haya en el editor); Esc vuelve a donde estabas
        if (ajustes || (vista === 'buscar' && !editor)) return
        const antes = { vista, editor: editor ? (editorActual.current ?? editor) : null }
        void Promise.resolve(guardarPendiente.current?.()).then(() => {
          recordar()
          setAntesDeBuscar(antes)
          setEditor(null)
          setVista('buscar')
        })
      }
      if (
        e.key === 'Escape' &&
        antesDeBuscar &&
        vista === 'buscar' &&
        !editor &&
        !ajustes &&
        !document.querySelector('.eti-modal, .visor')
      ) {
        e.preventDefault()
        setVista(antesDeBuscar.vista)
        setEditor(antesDeBuscar.editor)
        setAntesDeBuscar(null)
      }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [bloquear, abrirEditor, recordar, estado, vista, editor, ajustes, antesDeBuscar])

  const ir = async (v: Vista): Promise<void> => {
    await guardarPendiente.current?.()
    recordar()
    setAntesDeBuscar(null)
    setEditor(null)
    setAExportar(null)
    setVista(v)
  }
  const informarEditor = useCallback((d: Destino) => {
    editorActual.current = d
  }, [])

  /** Volver al lugar anterior (salteando entradas que ya no existen). */
  const atras = useCallback(async (): Promise<void> => {
    const h = historial.current
    if (!h.length) return
    await guardarPendiente.current?.()
    let l = h.pop()
    while (l?.editor?.id && !(await window.diario.entradas.obtener(l.editor.id))) l = h.pop()
    setHayAtras(h.length > 0)
    if (!l) return
    setAntesDeBuscar(null)
    setAjustes(false)
    setVista(l.vista)
    setEditor(l.editor)
    setAExportar(l.aExportar)
  }, [])

  // Atrás también con Alt+← y con el botón "atrás" del mouse
  useEffect(() => {
    if (estado?.estado !== 'abierto') return
    const tecla = (e: KeyboardEvent): void => {
      if (e.altKey && !e.ctrlKey && e.key === 'ArrowLeft') {
        e.preventDefault()
        void atras()
      }
    }
    const raton = (e: MouseEvent): void => {
      if (e.button === 3) {
        e.preventDefault()
        void atras()
      }
    }
    window.addEventListener('keydown', tecla)
    window.addEventListener('mouseup', raton)
    return () => {
      window.removeEventListener('keydown', tecla)
      window.removeEventListener('mouseup', raton)
    }
  }, [atras, estado])

  if (!estado) return <div className="app" />

  const abierto = estado.estado === 'abierto'
  return (
    <div className="app">
      <Lateral
        actual={editor ? null : vista}
        ir={(v) => void ir(v)}
        abrirAjustes={() => setAjustes(true)}
        inactiva={!abierto}
        atras={{ activo: abierto && hayAtras, accion: () => void atras() }}
        guardar={{
          activo: abierto && !!editor,
          pendiente: abierto && !!editor && sinGuardar,
          // guardar ya: el autoguardado vuelve a contar desde cero con el próximo cambio
          accion: () => void guardarPendiente.current?.()
        }}
      />
      <main className="principal">
        <Suspense fallback={null}>
          {!abierto && (
            <Bloqueo
              key={estado.estado}
              estado={estado.estado}
              carpeta={estado.carpeta}
              alAbrir={() => {
                setVersion((v) => v + 1)
                void revisar()
              }}
            />
          )}
          {abierto && editor && (
            <Editor
              destino={editor}
              registrarGuardado={registrarGuardado}
              registrarPendiente={registrarPendiente}
              avisarSinGuardar={setSinGuardar}
              alCambiar={alCambiar}
              cerrar={() => {
                recordar()
                setEditor(null)
              }}
              irA={(d) => {
                recordar()
                setEditor(d)
              }}
              informar={informarEditor}
              ajustesVersion={ajustesVersion}
              exportar={(e) => {
                recordar()
                setAExportar(e)
                setEditor(null)
                setVista('exportar')
              }}
            />
          )}
          {abierto && !editor && vista === 'calendario' && (
            <Calendario key={version} abrir={(d) => void abrirEditor(d)} />
          )}
          {abierto && !editor && vista === 'timeline' && (
            <Timeline version={version} abrir={(d) => void abrirEditor(d)} alCambiar={alCambiar} />
          )}
          {abierto && !editor && vista === 'etiquetas' && (
            <Etiquetas version={version} abrir={(d) => void abrirEditor(d)} alCambiar={alCambiar} />
          )}
          {abierto && !editor && vista === 'buscar' && (
            <Buscar
              version={version}
              abrir={(d) => void abrirEditor(d)}
              escVuelve={!!antesDeBuscar}
            />
          )}
          {abierto && !editor && vista === 'enEsteDia' && (
            <EnEsteDia version={version} abrir={(d) => void abrirEditor(d)} />
          )}
          {abierto && !editor && vista === 'exportar' && (
            <Exportar entrada={aExportar} quitarEntrada={() => setAExportar(null)} />
          )}
        </Suspense>
      </main>
      {abierto && ajustes && (
        <Suspense fallback={null}>
          <Ajustes
            cerrar={() => {
              setAjustes(false)
              setAjustesVersion((v) => v + 1)
            }}
            bloquear={() => void bloquear()}
            alRestaurar={() => setVersion((v) => v + 1)}
          />
        </Suspense>
      )}
    </div>
  )
}
