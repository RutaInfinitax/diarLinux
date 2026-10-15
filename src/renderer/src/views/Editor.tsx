/**
 * Editor de entrada (captura escribir.png): ‹ fecha › arriba, barra de formato, título y cuerpo con
 * TipTap ocupando casi toda la pantalla; abajo, juntos y compactos: adjuntos (tamaño a elección),
 * etiquetas, personas, clima, luna, calificación y contador; y la fila de acciones.
 * Guardado: cada N minutos (Configuración → General, 4 por defecto) y solo si hay cambios; también
 * con Ctrl+S, al salir de la entrada y al bloquear. Al cerrar la app, main pregunta si guardar.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor, type Editor as TipTap } from '@tiptap/react'
import { extensionesEditor } from '../util/extensiones'
import DOMPurify from 'dompurify'
import {
  Bold,
  Check,
  ChevronLeft,
  ChevronRight,
  Heading2,
  Image,
  Italic,
  Link2,
  List,
  ListChecks,
  LayoutTemplate,
  ListOrdered,
  Mic,
  MoveHorizontal,
  MoreHorizontal,
  Paperclip,
  Quote,
  Redo2,
  Star,
  Strikethrough,
  Sunrise,
  Sunset,
  Tag,
  Underline,
  Undo2,
  User,
  X
} from 'lucide-react'
import type {
  Adjunto,
  AdjuntoExtra,
  AjustesClima,
  Clima,
  Etiqueta,
  Plantilla,
  TipoGrupo
} from '../../../shared/tipos'
import { resumenClima, temperatura } from '../../../core/services/clima'
import { faseDeFecha } from '../../../core/services/luna'
import { contarPalabras } from '../../../core/services/texto'
import { IconoClima, IconoLuna } from '../components/Cielo'
import { IconoGrupo, Paleta } from '../components/Chips'
import { colorChip } from '../util/chips'
import { Visor } from '../components/Visor'
import { Adjuntos } from '../components/Adjuntos'
import { Grabadora } from '../components/Grabadora'
import { esImagen, procesarFoto } from '../util/fotos'
import { datosDeVideo, duracionDeAudio } from '../util/medios'
import { es } from '../i18n'
import { conDia, sumarDias } from '../util/fechas'
import { useAjustes } from '../util/preferencias'
import './editor.css'
import { confirmar, pedirTexto } from '../util/dialogo'
import { locale, t, tn } from '../../../shared/i18n'

export interface Destino {
  id?: string
  fecha: string
}

interface Props {
  destino: Destino
  registrarGuardado: (fn: (() => Promise<void>) | null) => void
  alCambiar: () => void
  cerrar: () => void
  irA: (d: Destino) => void
  /** Avisa qué entrada se está mostrando (para volver a ella después de Ctrl+F) */
  informar?: (d: Destino) => void
  /** Cambia al cerrar Configuración: recargar contador y clima */
  ajustesVersion?: number
  /** Menú ⋯ → Exportar esta entrada */
  exportar?: (e: { id: string; fecha: string; titulo: string }) => void
  /** Para que App sepa si hay cambios sin guardar (al cerrar la app se pregunta) */
  registrarPendiente?: (fn: (() => boolean) | null) => void
  /** Avisa cuando cambia "hay cambios sin guardar" (punto en el botón Guardar de la barra lateral) */
  avisarSinGuardar?: (b: boolean) => void
}

// Ancho del texto y tamaño de los adjuntos: preferencias de este equipo (como en iabot)
const ANCHO_MIN = 480
const ANCHO_MAX = 1800 // el máximo = todo el ancho
const leerNumero = (clave: string, defecto: number): number => {
  try {
    const n = Number(localStorage.getItem(clave))
    return Number.isFinite(n) && n > 0 ? n : defecto
  } catch {
    return defecto
  }
}
const guardarNumero = (clave: string, n: number): void => {
  try {
    localStorage.setItem(clave, String(n))
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}

export function Editor({
  destino,
  registrarGuardado,
  alCambiar,
  cerrar,
  irA,
  informar,
  ajustesVersion = 0,
  exportar,
  registrarPendiente,
  avisarSinGuardar
}: Props): React.JSX.Element {
  const [id, setId] = useState<string | undefined>(destino.id)
  const [fecha, setFecha] = useState(destino.fecha)
  const [titulo, setTitulo] = useState('')
  const [calificacion, setCalificacion] = useState(0)
  // Etiquetas y personas: mismo manejo (chips con ✕ y un campo con sugerencias)
  const [grupos, setGrupos] = useState<Record<TipoGrupo, Etiqueta[]>>(SIN_GRUPOS)
  const [todos, setTodos] = useState<Record<TipoGrupo, Etiqueta[]>>(SIN_GRUPOS)
  const [agregando, setAgregando] = useState<TipoGrupo | null>(null)
  const [estado, setEstado] = useState<'' | 'guardando' | 'guardado' | string>('')
  const [menu, setMenu] = useState(false)
  const [menuPlantillas, setMenuPlantillas] = useState(false)
  const [colorDe, setColorDe] = useState<{ tipo: TipoGrupo; id: string } | null>(null)
  const [sinGuardar, setSinGuardar] = useState(false)
  const [ancho, setAncho] = useState(() => leerNumero('diar.edAncho', ANCHO_MAX))
  const [tamAdj, setTamAdj] = useState(() => leerNumero('diar.adjTam', 96))
  const [cargado, setCargado] = useState(false)
  const [clima, setClima] = useState<Clima | null>(null)
  const [plantillas, setPlantillas] = useState<Plantilla[]>([])
  const [palabras, setPalabras] = useState(0)
  const [contador, setContador] = useState({ ver: false, objetivo: 0 })
  const [ajClima, setAjClima] = useState<AjustesClima | null>(null)
  const [adjuntos, setAdjuntos] = useState<Adjunto[]>([])
  const [grabando, setGrabando] = useState(false)
  const [menuAudio, setMenuAudio] = useState(false)
  const inputAudio = useRef<HTMLInputElement>(null)
  const inputArchivos = useRef<HTMLInputElement>(null)
  const [visor, setVisor] = useState<number | null>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const inputFotos = useRef<HTMLInputElement>(null)

  // Lo último escrito, para que el guardado (también el de "salir") use siempre lo más nuevo
  const actual = useRef({
    id: destino.id,
    fecha: destino.fecha,
    titulo: '',
    html: '',
    calificacion: 0,
    existe: !!destino.id
  })
  const sucio = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cola = useRef<Promise<void>>(Promise.resolve())
  // Funciones estables (refs): guardar NUNCA debe hacer que el editor se recargue ni pierda el foco
  const editorRef = useRef<TipTap | null>(null)
  const alCambiarRef = useRef(alCambiar)
  const registrarRef = useRef(registrarGuardado)
  const exportarRef = useRef(exportar)
  useEffect(() => {
    alCambiarRef.current = alCambiar
    registrarRef.current = registrarGuardado
    exportarRef.current = exportar
  })

  const editor = useEditor({
    extensions: extensionesEditor(es.editor.escribe),
    editorProps: { attributes: { class: 'ed-cuerpo', spellcheck: 'true' } },
    onUpdate: ({ editor }) => {
      actual.current.html = editor.getHTML()
      setPalabras(contarPalabras(editor.getText({ blockSeparator: ' ' })))
      marcarCambioRef.current()
    }
  })
  useEffect(() => {
    editorRef.current = editor
  }, [editor])

  const guardarYa = useCallback((): Promise<void> => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    cola.current = cola.current.then(async () => {
      if (!sucio.current) return
      const a = actual.current
      const vacio =
        !a.titulo.trim() && !(editorRef.current?.getText().trim() ?? '') && a.calificacion === 0
      if (!a.existe && vacio) {
        sucio.current = false
        setSinGuardar(false)
        return // una entrada nueva sin nada escrito no se guarda
      }
      sucio.current = false
      setEstado('guardando')
      try {
        const e = await window.diario.entradas.guardar({
          id: a.id,
          fecha: a.fecha,
          titulo: a.titulo,
          html: a.html,
          calificacion: a.calificacion
        })
        if (!a.existe) {
          a.existe = true
          a.id = e.id
          setId(e.id)
          climaAutoRef.current(e.id)
        }
        setEstado('guardado')
        setSinGuardar(sucio.current) // si se siguió escribiendo mientras se guardaba
        alCambiarRef.current()
      } catch (err) {
        sucio.current = true
        setEstado('⚠ ' + (err as Error).message)
      }
    })
    return cola.current
  }, [])

  // Un cambio NO guarda enseguida: arranca la cuenta (si no estaba corriendo) y al cumplirse el
  // plazo se guarda una sola vez. 0 = solo al salir de la entrada, con Ctrl+S o al bloquear.
  const ajustes = useAjustes()
  const autoguardadoRef = useRef(240)
  useEffect(() => {
    if (ajustes) autoguardadoRef.current = ajustes.autoguardadoSeg
  }, [ajustes])
  const marcarCambio = useCallback((): void => {
    sucio.current = true
    setSinGuardar(true)
    setEstado('')
    const seg = autoguardadoRef.current
    if (!timer.current && seg > 0) timer.current = setTimeout(() => void guardarYa(), seg * 1000)
  }, [guardarYa])
  const marcarCambioRef = useRef(marcarCambio)

  // Preferencias: al abrir y cada vez que se cierra Configuración
  useEffect(() => {
    void window.diario.clima.ajustes().then(setAjClima)
    void window.diario.ajustes
      .obtener()
      .then((a) => setContador({ ver: a.contadorPalabras, objetivo: a.objetivoPalabras }))
  }, [ajustesVersion])

  const informarRef = useRef(informar)
  useEffect(() => {
    informarRef.current = informar
  })
  useEffect(() => {
    informarRef.current?.({ id, fecha })
  }, [id, fecha])

  const ajClimaRef = useRef<AjustesClima | null>(null)
  /** Pide el clima de la entrada a Open-Meteo (vía main) y lo muestra. */
  const pedirClima = useCallback(async (eid: string, automatico: boolean): Promise<void> => {
    const aj = ajClimaRef.current ?? (await window.diario.clima.ajustes())
    if (automatico && (!aj.auto || !aj.ciudad)) return
    setEstado(es.editor.consultandoClima)
    try {
      const c = await window.diario.clima.paraEntrada(eid)
      if (actual.current.id !== eid) return // ya se pasó a otra entrada
      setClima(c)
      setEstado(c ? 'guardado' : es.editor.sinClima)
      if (c) alCambiarRef.current()
    } catch (err) {
      if (actual.current.id === eid) setEstado('⚠ ' + (err as Error).message)
    }
  }, [])
  const climaAutoRef = useRef((eid: string) => void pedirClima(eid, true))
  useEffect(() => {
    ajClimaRef.current = ajClima
  }, [ajClima])

  // Que App pueda forzar el guardado antes de bloquear, cambiar de vista o cerrar (una sola vez)
  useEffect(() => {
    const registrar = registrarRef.current
    registrar(guardarYa)
    return () => {
      void guardarYa()
      registrar(null)
    }
  }, [guardarYa])
  const registrarPendienteRef = useRef(registrarPendiente)
  useEffect(() => {
    const r = registrarPendienteRef.current
    r?.(() => sucio.current)
    return () => r?.(null)
  }, [])

  const avisarRef = useRef(avisarSinGuardar)
  useEffect(() => {
    avisarRef.current = avisarSinGuardar
  })
  useEffect(() => {
    avisarRef.current?.(sinGuardar)
  }, [sinGuardar])
  useEffect(() => () => avisarRef.current?.(false), [])

  // Ctrl+S: guardar ya
  useEffect(() => {
    const tecla = (e: KeyboardEvent): void => {
      if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void guardarYa()
      }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [guardarYa])

  // Cargar la entrada (o preparar una nueva) cuando cambia el destino
  useEffect(() => {
    if (!editor) return
    let cancelado = false
    void (async () => {
      setCargado(false)
      const e = destino.id ? await window.diario.entradas.obtener(destino.id) : null
      if (cancelado) return
      const nuevoId = e?.id ?? crypto.randomUUID()
      actual.current = {
        id: nuevoId,
        fecha: e?.fecha ?? destino.fecha,
        titulo: e?.titulo ?? '',
        html: e?.html ?? '',
        calificacion: e?.calificacion ?? 0,
        existe: !!e
      }
      sucio.current = false
      setSinGuardar(false)
      setId(e ? nuevoId : undefined)
      setFecha(actual.current.fecha)
      setTitulo(actual.current.titulo)
      setCalificacion(actual.current.calificacion)
      setGrupos({ etiqueta: e?.etiquetas ?? [], persona: e?.personas ?? [] })
      setClima(e?.clima ?? null)
      setAdjuntos(e ? await window.diario.adjuntos.listar(e.id) : [])
      // entrada nueva: empieza con la plantilla predeterminada (si no se escribe nada, no se guarda)
      if (!e) {
        const pid = await window.diario.plantillas.defecto()
        const p = pid ? (await window.diario.plantillas.listar()).find((x) => x.id === pid) : null
        if (p) actual.current.html = p.html
      }
      if (cancelado) return
      setEstado('')
      editor.commands.setContent(DOMPurify.sanitize(actual.current.html), { emitUpdate: false })
      setPalabras(contarPalabras(editor.getText({ blockSeparator: ' ' })))
      setCargado(true)
      if (!e) editor.commands.focus('end')
    })()
    void cargarTodos().then(setTodos)
    return () => {
      cancelado = true
    }
    // La instancia (no solo "hay editor"): TipTap puede recrearla al montar (p. ej. con la carga
    // diferida de la vista) y la anterior queda destruida.
  }, [destino.id, destino.fecha, editor])

  const cambiarTitulo = (v: string): void => {
    setTitulo(v)
    actual.current.titulo = v
    marcarCambio()
  }

  const cambiarCalificacion = (n: number): void => {
    const v = n === calificacion ? 0 : n
    setCalificacion(v)
    actual.current.calificacion = v
    marcarCambio()
  }

  /** Ir al día anterior/siguiente: su primera entrada, o una nueva. */
  const irDia = async (d: -1 | 1): Promise<void> => {
    await guardarYa()
    const f = sumarDias(fecha, d)
    const l = await window.diario.entradas.delDia(f)
    irA(l.length ? { id: l[0].id, fecha: f } : { fecha: f })
  }

  /**
   * Fotos, videos, audios y archivos desde los botones, arrastrando o pegando. Las fotos se procesan
   * aquí; los videos y archivos los lee y cifra main directo del disco (por partes).
   */
  const agregarArchivos = async (archivos: File[], soloFotos = false): Promise<void> => {
    if (!archivos.length) return
    if (soloFotos && !archivos.some(esImagen)) {
      setEstado('⚠ ' + t('Solo se pueden agregar imágenes (JPG, PNG, WebP, GIF o AVIF)'))
      return
    }
    try {
      const { compresion } = await window.diario.ajustes.obtener()
      const eid = await asegurarGuardada()
      for (let i = 0; i < archivos.length; i++) {
        const f = archivos[i]
        setEstado(
          t('Agregando {i} de {total}: {nombre}…', {
            i: i + 1,
            total: archivos.length,
            nombre: f.name
          })
        )
        let a: Adjunto
        if (esImagen(f))
          a = await window.diario.adjuntos.agregarFoto(eid, await procesarFoto(f, compresion))
        else if (soloFotos) continue
        else {
          const tipo: AdjuntoExtra['tipo'] = f.type.startsWith('video/')
            ? 'video'
            : f.type.startsWith('audio/')
              ? 'audio'
              : 'file'
          const extra: AdjuntoExtra =
            tipo === 'video'
              ? { tipo, ...(await datosDeVideo(f)) }
              : tipo === 'audio'
                ? { tipo, duracion: await duracionDeAudio(f) }
                : { tipo }
          const ruta = window.diario.app.rutaDe(f)
          a = ruta
            ? await window.diario.adjuntos.agregarRuta(eid, ruta, extra)
            : await window.diario.adjuntos.agregarDatos(
                eid,
                f.name,
                new Uint8Array(await f.arrayBuffer()),
                extra
              )
        }
        setAdjuntos((l) => [...l, a])
      }
      setEstado('guardado')
      alCambiarRef.current()
    } catch (err) {
      setEstado('⚠ ' + (err as Error).message)
    }
  }

  const guardarGrabacion = async (datos: Uint8Array, segundos: number): Promise<void> => {
    setGrabando(false)
    try {
      const eid = await asegurarGuardada()
      const d = new Date()
      const nombre =
        `${t('grabación')} ${d.toLocaleDateString(locale())} ${d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })}.webm`.replace(
          /\//g,
          '-'
        )
      const a = await window.diario.adjuntos.agregarDatos(eid, nombre, datos, {
        tipo: 'audio',
        duracion: segundos
      })
      setAdjuntos((l) => [...l, a])
      setEstado('guardado')
      alCambiarRef.current()
    } catch (err) {
      setEstado('⚠ ' + (err as Error).message)
    }
  }

  const quitarAdjunto = async (f: Adjunto): Promise<void> => {
    const pregunta = {
      photo: t('¿Quitar esta foto de la entrada? Se borra del diario.'),
      video: t('¿Quitar este video de la entrada? Se borra del diario.'),
      audio: t('¿Quitar este audio de la entrada? Se borra del diario.'),
      file: t('¿Quitar este archivo de la entrada? Se borra del diario.')
    }[f.tipo]
    if (
      !(await confirmar(pregunta, {
        aceptar: t('Quitar'),
        peligro: true
      }))
    )
      return
    await window.diario.adjuntos.eliminar(f.id)
    setAdjuntos((l) => l.filter((x) => x.id !== f.id))
    alCambiarRef.current()
  }

  const medios = adjuntos.filter((a) => a.tipo === 'photo' || a.tipo === 'video')

  const conArchivos = (e: React.DragEvent): boolean => [...e.dataTransfer.types].includes('Files')

  const asegurarGuardada = async (): Promise<string> => {
    if (!actual.current.existe) {
      sucio.current = true
      actual.current.existe = false
      // forzar el guardado aunque esté vacía: el usuario quiere etiquetarla
      const a = actual.current
      const e = await window.diario.entradas.guardar({
        id: a.id,
        fecha: a.fecha,
        titulo: a.titulo,
        html: a.html,
        calificacion: a.calificacion
      })
      a.existe = true
      a.id = e.id
      setId(e.id)
      sucio.current = false
      climaAutoRef.current(e.id)
      alCambiarRef.current()
    }
    return actual.current.id!
  }

  const agregarAGrupo = async (
    tipo: TipoGrupo,
    nombre: string,
    color: string | null
  ): Promise<void> => {
    const n = nombre.trim()
    if (!n) return
    const api = API_GRUPO[tipo]()
    let t = todos[tipo].find((x) => x.nombre.toLowerCase() === n.toLowerCase())
    if (!t) {
      t = await api.crear(n)
      if (color) await api.color(t.id, color)
    }
    const eid = await asegurarGuardada()
    const nuevos = await api.asignar(eid, [...grupos[tipo].map((x) => x.id), t.id])
    setGrupos((g) => ({ ...g, [tipo]: nuevos }))
    setTodos(await cargarTodos())
    alCambiarRef.current()
  }

  // Menús ⋯, Agregar audio y Plantilla: se cierran con un clic afuera, al elegir o con Esc; nunca
  // por mover el mouse (pedido del usuario: si el mouse se sale por el costado, no se tiene que cerrar)
  useEffect(() => {
    if (!menu && !menuAudio && !menuPlantillas) return
    const dentro = (t: EventTarget | null, zona: string): boolean =>
      !!(t as Element | null)?.closest?.(`[data-menu="${zona}"]`)
    const fuera = (e: MouseEvent): void => {
      if (!dentro(e.target, 'mas')) setMenu(false)
      if (!dentro(e.target, 'audio')) setMenuAudio(false)
      if (!dentro(e.target, 'plantillas')) setMenuPlantillas(false)
    }
    const tecla = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      setMenu(false)
      setMenuAudio(false)
      setMenuPlantillas(false)
    }
    window.addEventListener('mousedown', fuera)
    window.addEventListener('keydown', tecla)
    return () => {
      window.removeEventListener('mousedown', fuera)
      window.removeEventListener('keydown', tecla)
    }
  }, [menu, menuAudio, menuPlantillas])

  // el panel de color se cierra con un clic afuera o Esc (no al salir el mouse: "otro color" abre
  // una ventana del sistema y el panel tiene que seguir ahí)
  useEffect(() => {
    if (!colorDe) return
    const fuera = (e: MouseEvent): void => {
      if (!(e.target as Element).closest('.ed-chip')) setColorDe(null)
    }
    const tecla = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setColorDe(null)
    }
    window.addEventListener('mousedown', fuera)
    window.addEventListener('keydown', tecla)
    return () => {
      window.removeEventListener('mousedown', fuera)
      window.removeEventListener('keydown', tecla)
    }
  }, [colorDe])

  /** Color de una etiqueta o persona desde la entrada: cambia en todas las entradas. */
  const cambiarColor = async (
    tipo: TipoGrupo,
    tid: string,
    color: string | null
  ): Promise<void> => {
    await API_GRUPO[tipo]().color(tid, color)
    setGrupos((g) => ({ ...g, [tipo]: g[tipo].map((x) => (x.id === tid ? { ...x, color } : x)) }))
    setTodos(await cargarTodos())
    alCambiarRef.current()
  }

  const quitarDeGrupo = async (tipo: TipoGrupo, tid: string): Promise<void> => {
    if (!id) return
    const nuevos = await API_GRUPO[tipo]().asignar(
      id,
      grupos[tipo].filter((x) => x.id !== tid).map((x) => x.id)
    )
    setGrupos((g) => ({ ...g, [tipo]: nuevos }))
    alCambiarRef.current()
  }

  const eliminar = async (): Promise<void> => {
    setMenu(false)
    if (!(await confirmar(es.editor.confirmarEliminar, { aceptar: 'Eliminar', peligro: true })))
      return
    if (timer.current) clearTimeout(timer.current)
    sucio.current = false
    if (actual.current.existe) await window.diario.entradas.eliminar(actual.current.id!)
    alCambiarRef.current()
    cerrar()
  }

  const exportarEsta = async (): Promise<void> => {
    setMenu(false)
    await guardarYa()
    const a = actual.current
    if (!a.existe || !a.id) return setEstado('⚠ ' + es.editor.nadaQueExportar)
    exportarRef.current?.({ id: a.id, fecha: a.fecha, titulo: a.titulo })
  }

  const duplicar = async (): Promise<void> => {
    setMenu(false)
    await guardarYa()
    if (!actual.current.existe || !actual.current.id) return
    setEstado(es.editor.duplicando)
    try {
      const nueva = await window.diario.diarioExtra.duplicar(actual.current.id)
      alCambiarRef.current()
      irA({ id: nueva, fecha: actual.current.fecha })
    } catch (err) {
      setEstado('⚠ ' + (err as Error).message)
    }
  }

  /** Vacía: la plantilla reemplaza el texto; con texto: se agrega al final. */
  const aplicarPlantilla = (html: string): void => {
    setMenu(false)
    setMenuPlantillas(false)
    if (!editor) return
    const limpio = DOMPurify.sanitize(html)
    if (editor.isEmpty) editor.commands.setContent(limpio)
    else editor.chain().focus('end').insertContent(limpio).run()
  }

  const cambiarFecha = (f: string): void => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return
    setFecha(f)
    const cambio = actual.current.fecha !== f
    actual.current.fecha = f
    sucio.current = true
    void guardarYa().then(() => {
      // otra fecha → el clima guardado ya no corresponde (main lo borra): pedir el nuevo
      if (cambio && actual.current.existe && actual.current.id) {
        setClima(null)
        climaAutoRef.current(actual.current.id)
      }
    })
  }

  const verTitulo = ajustes?.encabezados !== false || !!titulo
  // ancho del texto: el máximo del deslizador = todo el ancho
  const centro: React.CSSProperties = ancho >= ANCHO_MAX ? {} : { maxWidth: ancho }
  // pie: alineado con el texto; con todo el ancho, deja libre la esquina de los controles fijos
  const conFijos = adjuntos.length > 0 || contador.ver
  const centroPie: React.CSSProperties =
    ancho >= ANCHO_MAX ? (conFijos ? { paddingRight: 190 } : {}) : centro
  const unidad = ajClima?.unidad ?? 'C'
  const luna = ajClima?.cielo !== false ? faseDeFecha(fecha) : null
  const hayPie =
    adjuntos.length > 0 ||
    grupos.etiqueta.length > 0 ||
    grupos.persona.length > 0 ||
    agregando !== null ||
    !!clima ||
    !!luna ||
    calificacion > 0 ||
    contador.ver

  return (
    <div
      className={'editor' + (arrastrando ? ' arrastrando' : '')}
      onDragOver={(e) => {
        if (!conArchivos(e)) return
        e.preventDefault()
        setArrastrando(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setArrastrando(false)
      }}
      onDrop={(e) => {
        if (!conArchivos(e)) return
        e.preventDefault()
        setArrastrando(false)
        void agregarArchivos([...e.dataTransfer.files])
      }}
      onPasteCapture={(e) => {
        const archivos = [...e.clipboardData.files].filter(esImagen)
        if (!archivos.length) return
        e.preventDefault()
        e.stopPropagation()
        void agregarArchivos(archivos)
      }}
    >
      <header className="barra ed-barra">
        <div className="barra-fila">
          <div className="barra-izq">
            <label
              className="ed-ancho"
              title={t('Ancho del texto (doble clic: todo el ancho)')}
              onDoubleClick={() => {
                setAncho(ANCHO_MAX)
                guardarNumero('diar.edAncho', ANCHO_MAX)
              }}
            >
              <MoveHorizontal size={16} strokeWidth={1.8} />
              <input
                type="range"
                min={ANCHO_MIN}
                max={ANCHO_MAX}
                step={20}
                value={ancho}
                aria-label={t('Ancho del texto')}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  setAncho(n)
                  guardarNumero('diar.edAncho', n)
                }}
              />
            </label>
          </div>
          <div className="barra-centro ed-fecha">
            <button
              className="barra-boton"
              onClick={() => void irDia(-1)}
              title={t('Día anterior')}
            >
              <ChevronLeft size={18} />
            </button>
            <label className="ed-fecha-texto" title={es.editor.cambiarFecha}>
              {conDia(fecha)}
              <input type="date" value={fecha} onChange={(e) => cambiarFecha(e.target.value)} />
            </label>
            <button
              className="barra-boton"
              onClick={() => void irDia(1)}
              title={t('Día siguiente')}
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="barra-der">
            <span className="ed-estado">
              {estado === 'guardando' ? (
                es.editor.guardando
              ) : estado && estado !== 'guardado' ? (
                estado
              ) : sinGuardar ? (
                <button
                  className="ed-sin-guardar"
                  onClick={() => void guardarYa()}
                  title={t(
                    'Se guarda solo cada pocos minutos, al salir de la entrada o con Ctrl+S. Clic: guardar ahora'
                  )}
                >
                  ● {es.editor.sinGuardar}
                </button>
              ) : estado === 'guardado' ? (
                es.editor.guardado
              ) : (
                ''
              )}
            </span>
            <button
              className="barra-boton"
              data-menu="mas"
              onClick={() => {
                if (!menu) void window.diario.plantillas.listar().then(setPlantillas)
                setMenu((m) => !m)
              }}
              title={t('Más opciones')}
            >
              <MoreHorizontal size={19} />
            </button>
            {menu && (
              <div className="ed-menu" data-menu="mas">
                <button
                  className="neutro"
                  onClick={() => {
                    setMenu(false)
                    if (!ajClima?.ciudad) setEstado('⚠ ' + es.editor.elegirCiudad)
                    else void asegurarGuardada().then((eid) => pedirClima(eid, false))
                  }}
                >
                  {clima ? es.editor.actualizarClima : es.editor.agregarClima}
                </button>
                <button className="neutro" onClick={() => void duplicar()}>
                  {es.editor.duplicar}
                </button>
                {exportar && (
                  <button className="neutro" onClick={() => void exportarEsta()}>
                    {es.editor.exportarEsta}
                  </button>
                )}
                {plantillas.length > 0 && (
                  <>
                    <div className="ed-menu-titulo">{es.editor.aplicarPlantilla}</div>
                    {plantillas.map((p) => (
                      <button
                        key={p.id}
                        className="neutro ed-menu-sub"
                        onClick={() => aplicarPlantilla(p.html)}
                      >
                        {p.nombre}
                      </button>
                    ))}
                  </>
                )}
                <div className="ed-menu-linea" />
                <button onClick={() => void eliminar()}>{es.editor.eliminar}</button>
              </div>
            )}
          </div>
        </div>
        <Herramientas editor={editor} />
      </header>

      <div
        className="ed-hoja"
        style={{ visibility: cargado ? 'visible' : 'hidden' }}
        onMouseDown={(e) => {
          // clic en cualquier lugar vacío de la hoja → a escribir (al final del texto)
          const t = e.target as HTMLElement
          if (t.closest('.ed-cuerpo, input, button, a')) return
          e.preventDefault()
          editor?.commands.focus('end')
        }}
      >
        <div className="ed-centro" style={centro}>
          {verTitulo && (
            <input
              className="ed-titulo"
              placeholder={es.editor.titulo}
              value={titulo}
              onChange={(e) => cambiarTitulo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  editor?.commands.focus('start')
                }
              }}
              maxLength={500}
            />
          )}
          <EditorContent editor={editor} className="ed-contenido" />
        </div>
      </div>

      {/* Abajo y compacto (pedido del usuario): adjuntos, etiquetas, personas, clima, luna,
          calificación y contador, para que el texto tenga casi toda la pantalla */}
      {cargado && (hayPie || grabando) && (
        <div
          className={'ed-pie' + (adjuntos.length > 0 || contador.ver ? ' con-fijos' : '')}
          style={{ ['--adj-tam' as string]: `${tamAdj}px` }}
        >
          <div className="ed-centro" style={centroPie}>
            {adjuntos.length > 0 && (
              <div className="ed-pie-adjuntos">
                <Adjuntos
                  lista={adjuntos}
                  verMedio={(a) => setVisor(medios.findIndex((m) => m.id === a.id))}
                  quitar={(a) => void quitarAdjunto(a)}
                  mensaje={setEstado}
                />
              </div>
            )}
            {grabando && (
              <Grabadora
                alTerminar={(d, s) => void guardarGrabacion(d, s)}
                alCancelar={() => setGrabando(false)}
                alError={(m) => {
                  setGrabando(false)
                  setEstado('⚠ ' + m)
                }}
              />
            )}
            <div className="ed-pie-fila">
              {(['etiqueta', 'persona'] as const).map(
                (tipo) =>
                  (grupos[tipo].length > 0 || agregando === tipo) && (
                    <div key={tipo} className={'ed-etiquetas ed-' + tipo}>
                      {grupos[tipo].map((g) => (
                        <span
                          key={g.id}
                          className="chip ed-chip"
                          style={colorChip(g)}
                          title={t('Clic: cambiar el color')}
                          onClick={() =>
                            setColorDe((c) => (c?.id === g.id ? null : { tipo, id: g.id }))
                          }
                        >
                          <IconoGrupo tipo={tipo} />
                          {g.nombre}
                          <button
                            className="chip-x"
                            onClick={(e) => {
                              e.stopPropagation()
                              void quitarDeGrupo(tipo, g.id)
                            }}
                            title={t('Quitar')}
                          >
                            <X size={11} />
                          </button>
                          {colorDe?.id === g.id && (
                            <span className="ed-chip-color" onClick={(e) => e.stopPropagation()}>
                              <span className="ed-panel-titulo">
                                {t('Color de «{nombre}» (en todas las entradas)', {
                                  nombre: g.nombre
                                })}
                              </span>
                              <Paleta
                                chica
                                valor={g.color}
                                alElegir={(c) => void cambiarColor(tipo, g.id, c)}
                              />
                            </span>
                          )}
                        </span>
                      ))}
                      {agregando === tipo && (
                        <NuevaEtiqueta
                          tipo={tipo}
                          todas={todos[tipo]}
                          ya={grupos[tipo]}
                          alElegir={(n, c) => void agregarAGrupo(tipo, n, c)}
                          // solo se cierra a sí mismo: si ya se abrió el otro, no lo toca
                          alCerrar={() => setAgregando((a) => (a === tipo ? null : a))}
                        />
                      )}
                    </div>
                  )
              )}
              {clima && (
                <span
                  className="chip ed-clima"
                  title={[
                    clima.max != null && `${t('Máx.')} ${temperatura(clima.max, unidad)}`,
                    clima.min != null && `${t('Mín.')} ${temperatura(clima.min, unidad)}`,
                    `${clima.ciudad}, ${clima.hora}`
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                >
                  <IconoClima codigo={clima.codigo} />
                  {resumenClima(clima, unidad)}
                  <button
                    className="chip-x"
                    title={es.editor.quitarClima}
                    onClick={() => {
                      if (!id) return
                      void window.diario.clima.quitar(id).then(() => {
                        setClima(null)
                        alCambiarRef.current()
                      })
                    }}
                  >
                    <X size={11} />
                  </button>
                </span>
              )}
              {luna && (
                <span
                  className="ed-dato"
                  title={t('Iluminada al {p} %', { p: Math.round(luna.iluminacion * 100) })}
                >
                  <IconoLuna elong={luna.elongacion} sur={(ajClima?.ciudad?.lat ?? 1) < 0} />
                  {t(luna.nombre)}
                </span>
              )}
              {luna && clima?.amanecer && (
                <span className="ed-dato" title={es.editor.amanecer}>
                  <Sunrise size={14} strokeWidth={1.7} />
                  {clima.amanecer}
                </span>
              )}
              {luna && clima?.atardecer && (
                <span className="ed-dato" title={es.editor.atardecer}>
                  <Sunset size={14} strokeWidth={1.7} />
                  {clima.atardecer}
                </span>
              )}
              {/* calificación: solo se muestra si la entrada ya tiene (p. ej. importada); clic en la
                  misma estrella la quita. No hay botón para agregar (el usuario no la usa) */}
              {calificacion > 0 && (
                <div className="ed-estrellas">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => cambiarCalificacion(n)}
                      title={t('{n} de 5', { n })}
                    >
                      <Star
                        size={18}
                        strokeWidth={1.5}
                        fill={n <= calificacion ? 'currentColor' : 'none'}
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {/* Fijos en la esquina derecha (no se mueven con el ancho del texto) */}
          {(adjuntos.length > 0 || contador.ver) && (
            <div className="ed-pie-fijos">
              {adjuntos.length > 0 && (
                <label className="ed-tam-adj" title={t('Tamaño de las fotos y adjuntos')}>
                  <Image size={13} strokeWidth={1.8} />
                  <input
                    type="range"
                    min={56}
                    max={240}
                    step={4}
                    value={tamAdj}
                    aria-label={t('Tamaño de los adjuntos')}
                    onChange={(e) => {
                      const n = Number(e.target.value)
                      setTamAdj(n)
                      guardarNumero('diar.adjTam', n)
                    }}
                  />
                </label>
              )}
              {contador.ver && (
                <ContadorPalabras palabras={palabras} objetivo={contador.objetivo} />
              )}
            </div>
          )}
        </div>
      )}

      <div className="ed-acciones">
        <button onClick={() => inputFotos.current?.click()}>
          <Image size={19} strokeWidth={1.5} />
          {es.editor.agregarFoto}
        </button>
        <input
          ref={inputFotos}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
          multiple
          hidden
          onChange={(e) => {
            const l = [...(e.target.files ?? [])]
            e.target.value = ''
            window.diario.app.enfocar()
            void agregarArchivos(l, true)
          }}
        />
        <button onClick={() => setAgregando('etiqueta')}>
          <Tag size={19} strokeWidth={1.5} />
          {es.editor.agregarEtiquetas}
        </button>
        <button onClick={() => setAgregando('persona')}>
          <User size={19} strokeWidth={1.5} />
          {es.editor.agregarPersonas}
        </button>
        {/* Agregar audio: grabar con el micrófono o elegir un archivo (mp3, wav…) */}
        <div className="ed-accion-menu" data-menu="audio">
          <button onClick={() => setMenuAudio((m) => !m)} disabled={grabando}>
            <Mic size={19} strokeWidth={1.5} />
            {es.editor.agregarAudio}
          </button>
          {menuAudio && (
            <div className="adj-menu ed-menu-audio">
              <button
                onClick={() => {
                  setMenuAudio(false)
                  setGrabando(true)
                }}
              >
                {t('🎙 Grabar con el micrófono')}
              </button>
              <button
                onClick={() => {
                  setMenuAudio(false)
                  inputAudio.current?.click()
                }}
              >
                {t('🎵 Elegir un archivo de audio…')}
              </button>
            </div>
          )}
          <input
            ref={inputAudio}
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.oga,.opus,.flac,.weba"
            multiple
            hidden
            onChange={(e) => {
              const l = [...(e.target.files ?? [])]
              e.target.value = ''
              window.diario.app.enfocar()
              void agregarArchivos(l)
            }}
          />
        </div>
        <button onClick={() => inputArchivos.current?.click()}>
          <Paperclip size={19} strokeWidth={1.5} />
          {es.editor.agregarArchivo}
        </button>
        <input
          ref={inputArchivos}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            const l = [...(e.target.files ?? [])]
            e.target.value = ''
            window.diario.app.enfocar()
            void agregarArchivos(l)
          }}
        />
        {/* Plantillas: elegir una y se agrega a la entrada */}
        <div className="ed-accion-menu" data-menu="plantillas">
          <button
            onClick={() => {
              if (!menuPlantillas) void window.diario.plantillas.listar().then(setPlantillas)
              setMenuPlantillas((m) => !m)
            }}
          >
            <LayoutTemplate size={19} strokeWidth={1.5} />
            {es.editor.plantillas}
          </button>
          {menuPlantillas && (
            <div className="adj-menu ed-menu-audio ed-menu-plantillas">
              {plantillas.length === 0 ? (
                <span className="ed-menu-vacio">{es.editor.sinPlantillas}</span>
              ) : (
                plantillas.map((p) => (
                  <button key={p.id} onClick={() => aplicarPlantilla(p.html)} title={p.nombre}>
                    {p.nombre}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
      {visor !== null && visor >= 0 && medios.length > 0 && (
        <Visor
          fotos={medios}
          indice={Math.min(visor, medios.length - 1)}
          cambiar={setVisor}
          cerrar={() => {
            setVisor(null)
            window.diario.app.enfocar()
          }}
        />
      )}
    </div>
  )
}

/** Contador de palabras, chico, en la esquina de abajo a la derecha de la hoja. */
function ContadorPalabras({
  palabras,
  objetivo
}: {
  palabras: number
  objetivo: number
}): React.JSX.Element {
  const n = palabras.toLocaleString(locale())
  if (!objetivo)
    return (
      <div className="ed-contador" title={t('Palabras de esta entrada')}>
        {tn(palabras, t('1 palabra'), t('{n} palabras'))}
      </div>
    )
  const parte = Math.min(1, palabras / objetivo)
  const logrado = palabras >= objetivo
  return (
    <div
      className={'ed-contador' + (logrado ? ' logrado' : '')}
      title={t('{n} de {obj} palabras ({p} %)', {
        n,
        obj: objetivo.toLocaleString(locale()),
        p: Math.round((palabras / objetivo) * 100)
      })}
    >
      {logrado && <Check size={12} strokeWidth={2.5} />}
      <span>
        {n} / {objetivo.toLocaleString(locale())}
      </span>
      <span className="ed-contador-barra">
        <span style={{ width: `${parte * 100}%` }} />
      </span>
    </div>
  )
}

const SIN_GRUPOS: Record<TipoGrupo, Etiqueta[]> = { etiqueta: [], persona: [] }
const API_GRUPO = {
  etiqueta: () => window.diario.etiquetas,
  persona: () => window.diario.personas
}
async function cargarTodos(): Promise<Record<TipoGrupo, Etiqueta[]>> {
  const [etiqueta, persona] = await Promise.all([
    window.diario.etiquetas.listar(),
    window.diario.personas.listar()
  ])
  return { etiqueta, persona }
}

/**
 * Campo para agregar etiquetas o personas: muestra todas las que ya existen (clic y se agrega)
 * y, si lo escrito es nuevo, ofrece crearla eligiendo el color.
 */
function NuevaEtiqueta({
  tipo,
  todas,
  ya,
  alElegir,
  alCerrar
}: {
  tipo: TipoGrupo
  todas: Etiqueta[]
  ya: Etiqueta[]
  alElegir: (nombre: string, color: string | null) => void
  alCerrar: () => void
}): React.JSX.Element {
  const [v, setV] = useState('')
  const [color, setColor] = useState<string | null>(null)
  const texto = v.trim()
  const minus = (x: string): string => x.toLocaleLowerCase('es')
  const disponibles = todas.filter(
    (t) => !ya.some((x) => x.id === t.id) && minus(t.nombre).includes(minus(texto))
  )
  const existe = [...todas, ...ya].some((t) => minus(t.nombre) === minus(texto))
  const elegir = (nombre: string, c: string | null): void => {
    alElegir(nombre, c)
    setV('')
    setColor(null)
  }
  return (
    <span className="ed-nueva-etiqueta">
      <input
        autoFocus
        value={v}
        placeholder={tipo === 'etiqueta' ? es.editor.nuevaEtiqueta : es.editor.nuevaPersona}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (texto) elegir(texto, existe ? null : color)
          }
          if (e.key === 'Escape') alCerrar()
        }}
        onBlur={() => setTimeout(alCerrar, 150)}
      />
      <span className="ed-panel" onMouseDown={(e) => e.preventDefault()}>
        {disponibles.length > 0 && (
          <>
            <span className="ed-panel-titulo">
              {tipo === 'etiqueta' ? es.editor.tusEtiquetas : es.editor.tusPersonas}
            </span>
            <span className="ed-panel-lista">
              {disponibles.map((t) => (
                <button
                  key={t.id}
                  className="chip"
                  style={colorChip(t)}
                  onClick={() => elegir(t.nombre, null)}
                >
                  <IconoGrupo tipo={tipo} />
                  {t.nombre}
                </button>
              ))}
            </span>
          </>
        )}
        {texto && !existe ? (
          <span className="ed-panel-crear">
            <span className="ed-panel-titulo">{es.editor.colorDeLaNueva}</span>
            <Paleta chica valor={color} alElegir={setColor} />
            <button className="ed-panel-boton" onClick={() => elegir(texto, color)}>
              <span className="chip" style={color ? { background: color } : undefined}>
                <IconoGrupo tipo={tipo} />
                {texto}
              </span>
              {es.editor.crearYAgregar}
            </button>
          </span>
        ) : (
          disponibles.length === 0 && (
            <span className="ed-panel-nota">
              {texto
                ? es.editor.yaEsta
                : tipo === 'etiqueta'
                  ? es.editor.escribeEtiqueta
                  : es.editor.escribePersona}
            </span>
          )
        )}
      </span>
    </span>
  )
}

export function Herramientas({ editor }: { editor: TipTap | null }): React.JSX.Element {
  const [, refrescar] = useState(0)
  useEffect(() => {
    if (!editor) return
    const f = (): void => refrescar((n) => n + 1)
    editor.on('transaction', f)
    return () => {
      editor.off('transaction', f)
    }
  }, [editor])
  if (!editor) return <div className="ed-herramientas" />
  const b = (
    activo: boolean,
    accion: () => void,
    icono: React.ReactNode,
    titulo: string,
    deshabilitado = false
  ): React.JSX.Element => (
    <button
      className={activo ? 'on' : ''}
      onMouseDown={(e) => e.preventDefault()}
      onClick={accion}
      title={titulo}
      disabled={deshabilitado}
    >
      {icono}
    </button>
  )
  // OJO: el comando se arma recién al tocar el botón. chain().focus() ejecuta el foco en el
  // momento: si se armara al dibujar, cada letra del título le devolvería el foco al cuerpo.
  const c = (): ReturnType<TipTap['chain']> => editor.chain().focus()
  const enlace = async (): Promise<void> => {
    if (editor.isActive('link')) return void editor.chain().focus().unsetLink().run()
    const url = await pedirTexto(es.editor.enlace, 'https://')
    if (url && /^https?:\/\/\S+$/.test(url.trim()))
      editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run()
  }
  const s = 16
  return (
    <div className="ed-herramientas">
      {b(
        editor.isActive('bold'),
        () => c().toggleBold().run(),
        <Bold size={s} />,
        t('Negrita (Ctrl+B)')
      )}
      {b(
        editor.isActive('italic'),
        () => c().toggleItalic().run(),
        <Italic size={s} />,
        t('Cursiva (Ctrl+I)')
      )}
      {b(
        editor.isActive('underline'),
        () => c().toggleUnderline().run(),
        <Underline size={s} />,
        t('Subrayado (Ctrl+U)')
      )}
      {b(
        editor.isActive('strike'),
        () => c().toggleStrike().run(),
        <Strikethrough size={s} />,
        t('Tachado')
      )}
      <i />
      {b(
        editor.isActive('heading'),
        () => c().toggleHeading({ level: 2 }).run(),
        <Heading2 size={s} />,
        t('Encabezado')
      )}
      {b(
        editor.isActive('bulletList'),
        () => c().toggleBulletList().run(),
        <List size={s} />,
        t('Lista')
      )}
      {b(
        editor.isActive('orderedList'),
        () => c().toggleOrderedList().run(),
        <ListOrdered size={s} />,
        t('Lista numerada')
      )}
      {b(
        editor.isActive('taskList'),
        () => c().toggleTaskList().run(),
        <ListChecks size={s} />,
        t('Lista de tareas')
      )}
      {b(editor.isActive('link'), enlace, <Link2 size={s} />, t('Enlace'))}
      {b(
        editor.isActive('blockquote'),
        () => c().toggleBlockquote().run(),
        <Quote size={s} />,
        t('Cita')
      )}
      <i />
      {b(
        false,
        () => c().undo().run(),
        <Undo2 size={s} />,
        t('Deshacer (Ctrl+Z)'),
        !editor.can().undo()
      )}
      {b(
        false,
        () => c().redo().run(),
        <Redo2 size={s} />,
        t('Rehacer (Ctrl+Shift+Z)'),
        !editor.can().redo()
      )}
    </div>
  )
}
