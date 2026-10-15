// Interface texts in English (same shape as es.ts). Natural English, not a word-for-word translation.
import type { es as Es } from './es'

export const en: typeof Es = {
  menuEntrada: { abrir: 'Open', eliminar: 'Delete entry…' },
  app: 'diarLinux',
  nav: {
    calendario: 'Calendar',
    timeline: 'Timeline',
    buscar: 'Search',
    etiquetas: 'Tags',
    exportar: 'Export',
    guardar: 'Save',
    atras: 'Back',
    enEsteDia: 'On This Day',
    configuracion: 'Settings'
  },
  dias: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  diasCortos: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  meses: [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December'
  ],
  bloqueo: {
    contrasena: 'Password',
    desbloquear: 'Unlock journal',
    abriendo: 'Opening…',
    olvide: 'Forgot your password?',
    codigo: 'Recovery code',
    nueva: 'New password',
    repetir: 'Repeat the password',
    entrarConCodigo: 'Unlock and change the password',
    volver: 'Back',
    noCoinciden: "The passwords don't match"
  },
  asistente: {
    titulo: 'Create your journal',
    texto:
      'Everything you write is stored encrypted in this folder. Without the password, nobody can read it.',
    carpeta: 'Journal folder',
    cambiar: 'Change…',
    crear: 'Create journal',
    creando: 'Creating…',
    restaurar: 'Restore from a backup…',
    codigoTitulo: 'Your recovery code',
    codigoTexto:
      'If you forget your password, this code is the ONLY way back in. Write it down on paper and keep it somewhere safe: it will not be shown again.',
    anotado: "I've written it down somewhere safe",
    continuar: 'Continue',
    fuerza: ['Very weak', 'Weak', 'Fair', 'Good', 'Very good']
  },
  editor: {
    titulo: 'Title',
    escribe: 'Write your entry…',
    guardado: 'Saved',
    guardando: 'Saving…',
    eliminar: 'Delete entry',
    cambiarFecha: 'Change date',
    confirmarEliminar: "Delete this entry? This can't be undone.",
    agregarFoto: 'Add photo',
    agregarEtiquetas: 'Add tags',
    agregarPersonas: 'Add people',
    agregarAudio: 'Add audio',
    agregarArchivo: 'Add file',
    nuevaEtiqueta: 'New tag…',
    nuevaPersona: "Person's name…",
    tusEtiquetas: 'Your tags (click to add)',
    tusPersonas: 'Your people (click to add)',
    colorDeLaNueva: 'New — pick a color',
    crearYAgregar: 'Create and add (Enter)',
    yaEsta: 'Already in this entry.',
    escribeEtiqueta: 'Type the name of a new tag.',
    escribePersona: 'Type the name of a new person.',
    enFase2: 'Coming soon',
    consultandoClima: 'Checking the weather…',
    duplicar: 'Duplicate entry',
    exportarEsta: 'Export this entry…',
    plantillas: 'Template',
    sinPlantillas: "You don't have any templates yet: create them in Settings → General.",
    sinGuardar: 'Unsaved',
    nadaQueExportar: 'The entry is empty: nothing to export',
    duplicando: 'Duplicating…',
    aplicarPlantilla: 'Apply template',
    sinClima: 'No weather data for that date',
    agregarClima: 'Add weather',
    actualizarClima: 'Update weather',
    quitarClima: 'Remove weather',
    elegirCiudad: 'Choose your city in Settings → Weather',
    amanecer: 'Sunrise',
    atardecer: 'Sunset',
    enlace: 'Link address (https://…)'
  },
  grupos: {
    etiquetas: 'Tags',
    personas: 'People',
    porNombre: 'By name',
    porCantidad: 'By count',
    ordenar: 'Sort',
    renombrar: 'Rename',
    cambiarColor: 'Change color',
    fusionar: 'Merge with…',
    eliminar: 'Delete',
    opciones: 'Options (or right-click)',
    predeterminado: 'Blue (default)',
    nuevaEtiqueta: 'New tag',
    nuevaPersona: 'New person',
    nombreEtiqueta: 'Name of the new tag',
    nombrePersona: 'Name of the new person',
    crear: 'Create',
    yaExisteEtiqueta: 'A tag with that name already exists',
    yaExistePersona: 'A person with that name already exists',
    volver: 'Back',
    vacioEtiquetas: 'No tags yet. Add them from an entry with “Add tags”.',
    vacioPersonas: 'No people yet. Add them from an entry with “Add people”.',
    sinEntradas: 'No entries have it.',
    fusionarTitulo: (n: string) => `Merge “${n}” with…`,
    fusionarAviso: (origen: string, destino: string, cant: number) =>
      `${cant === 1 ? 'The entry' : `The ${cant} entries`} tagged “${origen}” will move to “${destino}”, and “${origen}” will be deleted.`,
    buscar: 'Search…',
    confirmarFusion: 'Merge',
    cancelar: 'Cancel',
    confirmarEliminar: (tipo: 'etiqueta' | 'persona', n: string, cant: number) =>
      `Delete ${tipo === 'etiqueta' ? 'the tag' : 'the person'} “${n}”?` +
      (cant
        ? ` It will be removed from ${cant === 1 ? '1 entry' : `${cant} entries`} (the entries themselves are kept).`
        : '')
  },
  buscar: {
    campo: 'Search',
    filtros: 'Filters',
    limpiar: 'Clear filters',
    desde: 'From',
    hasta: 'To',
    calificacion: 'Minimum rating',
    contiene: 'Contains',
    fotos: 'Photos',
    videos: 'Videos',
    audio: 'Audio',
    archivos: 'Files',
    etiquetas: 'Tags',
    personas: 'People',
    inicio:
      'Type to search your whole journal (accents and capitals are ignored), or use the filters.',
    nada: 'No entries found.',
    cantidad: (n: number) =>
      n === 1 ? '1 entry' : n >= 500 ? 'More than 500 entries (showing 500)' : `${n} entries`
  },
  enEsteDia: {
    hace: (n: number) => (n === 1 ? '1 year ago' : `${n} years ago`),
    volverHoy: 'Back to today',
    diaAnterior: 'Previous day',
    diaSiguiente: 'Next day',
    vacio: (dia: string) =>
      `No previous year has entries on ${dia}. What you write today will show up here next year.`
  },
  vacio: {
    timeline: 'No entries yet. Tap + to write the first one.'
  }
}
