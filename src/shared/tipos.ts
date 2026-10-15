// Tipos compartidos entre main, preload y renderer (sin dependencias).
import type { Ciudad, Clima } from '../core/services/clima'
import type { Tema } from './temas'
import type { PreferenciaIdioma } from './i18n'
export type { Ciudad, Clima }

export interface Etiqueta {
  id: string
  nombre: string
  color: string | null
  cantidad?: number
}

/** Etiquetas y personas comparten el mismo modelo (nombre, color, conteo). */
export type TipoGrupo = 'etiqueta' | 'persona'

export interface Entrada {
  id: string
  fecha: string // AAAA-MM-DD
  hora: string | null // HH:MM
  titulo: string
  html: string
  texto: string
  calificacion: number // 0-5
  clima: Clima | null
  creada: string
  modificada: string
  etiquetas: Etiqueta[]
  personas: Etiqueta[]
}

export interface Adjunto {
  id: string
  tipo: 'photo' | 'video' | 'audio' | 'file'
  mime: string
  nombre: string
  tamano: number
  ancho: number | null
  alto: number | null
  duracion: number | null // segundos (audio y video)
}

/** Datos extra al agregar un archivo, audio o video (la miniatura del video se saca en la ventana). */
export interface AdjuntoExtra {
  tipo: 'video' | 'audio' | 'file'
  mini512?: Uint8Array
  mini128?: Uint8Array
  ancho?: number
  alto?: number
  duracion?: number
}

/** Foto ya procesada en la ventana (rotada, comprimida, con miniaturas) para guardar cifrada. */
export interface FotoNueva {
  nombre: string
  mime: string
  original: Uint8Array
  mini512: Uint8Array // webp
  mini128: Uint8Array // webp
  ancho: number
  alto: number
}

export interface DiaCalendario {
  fecha: string
  foto: string | null // id de la primera foto del día
}

/** Resumen liviano para listas (timeline, calendario, búsqueda). */
export interface ResumenEntrada {
  foto: string | null // id de la primera foto (miniatura)
  id: string
  fecha: string
  hora: string | null
  titulo: string
  extracto: string
  calificacion: number
  etiquetas: Etiqueta[]
  personas: Etiqueta[]
  /** Solo en Buscar: título y fragmento con lo encontrado entre \u0001 y \u0002 */
  resaltado?: { titulo: string; extracto: string }
}

export type TipoAdjunto = 'photo' | 'video' | 'audio' | 'file'

export interface FiltrosBusqueda {
  texto: string
  desde?: string // AAAA-MM-DD
  hasta?: string
  etiquetas?: string[] // alguna de estas
  personas?: string[] // alguna de estas
  calificacionMin?: number // 1-5
  con?: TipoAdjunto[] // que tenga cada uno de estos tipos de adjunto
}

/** Clima: se guarda DENTRO de la base cifrada (la ciudad dice dónde vive el usuario). */
export interface AjustesClima {
  ciudad: Ciudad | null
  auto: boolean // agregar el clima a las entradas nuevas
  unidad: 'C' | 'F'
  cielo: boolean // mostrar fase lunar y amanecer/atardecer en la entrada
}

export interface GuardarEntrada {
  id?: string
  fecha: string
  hora?: string | null
  titulo: string
  html: string
  calificacion?: number
}

export type EstadoDiario =
  | { estado: 'sin-crear'; carpeta: string }
  | { estado: 'bloqueado'; carpeta: string }
  | { estado: 'abierto'; carpeta: string }

export interface InfoBackup {
  archivo: string
  fecha: string
  tamano: number
}

export interface Ajustes {
  idioma: PreferenciaIdioma // 'auto' = el del sistema (español si está en español; si no, inglés)
  primerDia: 0 | 1 // 0 = domingo
  bloqueoMinutos: number // 0 = nunca
  backupCarpeta: string
  backupConservar: number
  backupCadaHoras: number
  zoom: number // tamaño de toda la interfaz (1 = 100 %)
  compresion: 'original' | 'estandar' | 'alta' // fotos nuevas
  fotosEnListas: boolean // miniaturas en calendario y timeline
  contadorPalabras: boolean // contador de palabras en cada entrada
  objetivoPalabras: number // meta de palabras por entrada (0 = sin meta)
  tema: Tema
  acento: string // id de ACENTOS (shared/temas.ts) o 'skin' (el del skin)
  skin: string // id de SKINS o 'clasico'
  barra: 'color' | 'plana' | 'discreta' // estilo de la barra superior
  lateralTinte: boolean // barra lateral teñida con el acento
  fondoTinte: boolean // fondo con un toque del acento
  fondoLuz: number // -100 … 100: más oscuro / más claro que el skin
  fondoCalidez: number // -100 … 100: azulado / cálido
  textoSuave: number // 0 … 100: texto menos brillante
  fuenteTexto: FuenteTexto
  tamTexto: number // px del texto de las entradas
  encabezados: boolean // campo de título en las entradas
  etiquetasEnListas: boolean // chips de etiquetas/personas en línea de tiempo y búsqueda
  recordatorio: boolean // aviso diario si hoy no hay entrada
  recordatorioHora: string // HH:MM
  bandeja: boolean // ícono en la bandeja del sistema
  cerrarABandeja: boolean // cerrar la ventana la esconde en la bandeja
  iniciarConSistema: boolean // ~/.config/autostart/diarlinux.desktop
  autoguardadoSeg: number // guardar la entrada cada N segundos si hay cambios (0 = solo al salir)
}

export type FuenteTexto = 'sans' | 'serif' | 'mono' | 'sistema'

/** Operaciones de etiquetas y de personas (mismas para las dos). */
export interface ApiGrupo {
  listar(): Promise<Etiqueta[]>
  crear(nombre: string): Promise<Etiqueta>
  asignar(entradaId: string, ids: string[]): Promise<Etiqueta[]>
  renombrar(id: string, nombre: string): Promise<void>
  /** #rrggbb, o null para el color predeterminado */
  color(id: string, color: string | null): Promise<void>
  /** Pasa las entradas de `origen` a `destino` y borra `origen` */
  fusionar(origen: string, destino: string): Promise<void>
  eliminar(id: string): Promise<void>
  entradas(id: string): Promise<ResumenEntrada[]>
}

export interface Plantilla {
  id: string
  nombre: string
  html: string
}

export interface Estadisticas {
  tamanoBase: number // bytes de diario.db (+ wal)
  tamanoAdjuntos: number // bytes cifrados de adjuntos y miniaturas
  entradas: number
  dias: number
  primera: string | null
  adjuntos: number
  fotos: number
  videos: number
  audios: number
  archivos: number
  calificacionPromedio: number | null
  calificadas: number
  palabras: number
  palabrasMin: number
  palabrasMax: number
  palabrasPromedio: number
  etiquetaMasUsada: { nombre: string; cantidad: number } | null
  personaMasEtiquetada: { nombre: string; cantidad: number } | null
  rachaActual: number
  rachaMaxima: number
}

export type FormatoExportar = 'docx' | 'pdf' | 'html' | 'md' | 'txt' | 'json'

export interface OpcionesExportar {
  desde: string // AAAA-MM-DD
  hasta: string
  formato: FormatoExportar
  datos: {
    adjuntos: boolean
    personas: boolean
    clima: boolean
    sol: boolean // amanecer y atardecer
    luna: boolean
    calificacion: boolean
    etiquetas: boolean
  }
  porFecha: boolean // un archivo por fecha
  adjuntosAparte: boolean // los adjuntos como archivos en una carpeta
  soloEtiquetas: string[] | null // ids: solo las entradas con alguna de estas
  entradaId?: string // exportar solo esta entrada
}

export interface ResultadoExportar {
  ruta: string // archivo o carpeta creada
  entradas: number
  archivos: number // archivos escritos (sin contar adjuntos)
  adjuntos: number // adjuntos escritos aparte
  avisos: string[] // p. ej. fotos que no se pudieron incrustar
}

/** Resumen de una exportación de Joplin antes de importarla. */
export interface ResumenImportacion {
  ruta: string
  notas: number
  yaImportadas: number
  libretas: { nombre: string; cantidad: number }[]
  etiquetas: number
  fotos: number
  videos: number
  audios: number
  archivos: number
  bytes: number
  faltantes: number // enlazados en notas pero sin archivo en la exportación
  sinUsar: number // archivos que ninguna nota usa
  desde: string | null
  hasta: string | null
  omitidas: { papelera: number; cifradas: number; conflictos: number }
  conUbicacion: number
  personas?: number // Diarium
  invalidas?: number // Diarium: entradas sin fecha válida (no se importan)
}

export interface RecursoImportar {
  id: string
  nombre: string
  mime: string
  tipo: TipoAdjunto
  tamano: number
}

export interface NotaImportar {
  idExterno: string // id en la app de origen (para no importar dos veces)
  titulo: string
  fecha: string
  hora: string
  html: string // SIN sanear: la ventana lo pasa por DOMPurify
  etiquetas: string[]
  personas: string[]
  recursos: RecursoImportar[]
  yaImportada: boolean
}

/** Lo que el preload expone como window.diario */
export interface DiarioApi {
  app: {
    /** Se llama antes de cerrar la ventana: guardar lo pendiente. */
    alCerrar(fn: () => Promise<void>): void
    /** Ruta en el disco de un archivo elegido o arrastrado ('' si no tiene, p. ej. pegado). */
    rutaDe(archivo: File): string
    /** "Nueva entrada" desde la bandeja o la notificación del recordatorio */
    alNuevaEntrada(fn: () => void): () => void
    /** Al cerrar la app, main pregunta si hay cambios sin guardar (para ofrecer guardarlos). */
    alPreguntarPendiente(fn: () => boolean): void
    /** Devuelve el foco del teclado a la ventana (XWayland a veces lo pierde tras un diálogo). */
    enfocar(motivo?: string): void
    /** Idioma en uso (tras 'auto' ya resuelto con el del sistema). */
    idioma(): Promise<'es' | 'en'>
    /** Registro de diagnóstico del foco (sin contenido del diario). */
    registroFoco(m: string): void
  }
  vault: {
    estado(): Promise<EstadoDiario>
    elegirCarpeta(): Promise<string | null>
    crear(carpeta: string, contrasena: string): Promise<{ codigo: string }>
    desbloquear(contrasena: string): Promise<void>
    desbloquearConCodigo(codigo: string, nueva: string): Promise<void>
    bloquear(): Promise<void>
    cambiarContrasena(actual: string, nueva: string): Promise<void>
    regenerarCodigo(contrasena: string): Promise<{ codigo: string }>
    actividad(): void
    alBloquear(fn: () => void): () => void
    alAbrirse(fn: () => void): () => void
  }
  entradas: {
    listar(desde?: string, hasta?: string): Promise<ResumenEntrada[]>
    delDia(fecha: string): Promise<ResumenEntrada[]>
    diasConEntrada(anio: number): Promise<DiaCalendario[]>
    obtener(id: string): Promise<Entrada | null>
    guardar(e: GuardarEntrada): Promise<Entrada>
    eliminar(id: string): Promise<void>
    vecina(fecha: string, sentido: -1 | 1): Promise<string | null>
    rangoAnios(): Promise<{ min: number; max: number }>
    buscar(f: FiltrosBusqueda): Promise<ResumenEntrada[]>
    /** Entradas del mismo día y mes de años anteriores a `fecha` */
    enEsteDia(fecha: string): Promise<ResumenEntrada[]>
  }
  clima: {
    ajustes(): Promise<AjustesClima>
    guardarAjustes(a: Partial<AjustesClima>): Promise<AjustesClima>
    buscarCiudad(texto: string): Promise<Ciudad[]>
    /** Lo pide a Open-Meteo para la fecha (y hora) de la entrada y lo guarda en ella */
    paraEntrada(entradaId: string): Promise<Clima | null>
    quitar(entradaId: string): Promise<void>
  }
  etiquetas: ApiGrupo
  personas: ApiGrupo
  adjuntos: {
    listar(entradaId: string): Promise<Adjunto[]>
    agregarFoto(entradaId: string, foto: FotoNueva): Promise<Adjunto>
    /** Archivo o video del disco (se cifra por partes en main, sin pasar entero por la ventana). */
    agregarRuta(entradaId: string, ruta: string, extra: AdjuntoExtra): Promise<Adjunto>
    /** Datos en memoria: grabación de audio, archivo pegado. */
    agregarDatos(
      entradaId: string,
      nombre: string,
      datos: Uint8Array,
      extra: AdjuntoExtra
    ): Promise<Adjunto>
    /** Lo descifra en una carpeta en RAM y lo abre con el programa predeterminado. */
    abrir(id: string): Promise<void>
    guardarCopia(id: string): Promise<string | null>
    eliminar(id: string): Promise<void>
  }
  plantillas: {
    listar(): Promise<Plantilla[]>
    guardar(p: { id?: string; nombre: string; html: string }): Promise<Plantilla>
    eliminar(id: string): Promise<void>
    defecto(): Promise<string | null>
    elegirDefecto(id: string | null): Promise<void>
  }
  diarioExtra: {
    duplicar(entradaId: string): Promise<string>
    estadisticas(): Promise<Estadisticas>
    acercaDe(): Promise<{
      version: string
      electron: string
      chrome: string
      node: string
      carpeta: string
      config: string
    }>
    abrirCarpeta(): Promise<void>
    /** Borra todo el contenido (hace un backup antes). Pide la contraseña. */
    vaciar(contrasena: string): Promise<void>
  }
  exportar: {
    /** Pregunta dónde guardar y exporta. null = se canceló el diálogo. */
    hacer(o: OpcionesExportar): Promise<ResultadoExportar | null>
    /** Cuántas entradas entrarían con estas opciones (antes de exportar). */
    contar(o: OpcionesExportar): Promise<number>
    mostrar(ruta: string): Promise<void>
    alAvanzar(fn: (hechas: number, total: number) => void): () => void
  }
  importar: {
    elegirJoplin(carpeta: boolean): Promise<string | null>
    analizarJoplin(ruta: string): Promise<ResumenImportacion>
    notaJoplin(i: number, libretasComoEtiquetas: boolean): Promise<NotaImportar>
    leerRecurso(id: string): Promise<Uint8Array>
    adjuntarRecurso(entradaId: string, id: string, extra: AdjuntoExtra): Promise<Adjunto>
    elegirDiarium(): Promise<string | null>
    analizarDiarium(ruta: string): Promise<ResumenImportacion>
    notaDiarium(i: number): Promise<NotaImportar>
    marcar(idExterno: string, entradaId: string): Promise<void>
    terminar(): Promise<void>
  }
  ajustes: {
    obtener(): Promise<Ajustes>
    guardar(a: Partial<Ajustes>): Promise<Ajustes>
  }
  backups: {
    listar(): Promise<InfoBackup[]>
    ahora(): Promise<InfoBackup>
    elegirCarpeta(): Promise<string | null>
    /** Sin contraseña si es de este mismo diario; si no, devuelve necesitaContrasena. */
    restaurar(
      archivo: string,
      contrasena?: string
    ): Promise<{ ok: true } | { necesitaContrasena: true }>
    elegirArchivo(): Promise<string | null>
  }
}
