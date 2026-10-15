// Textos de la interfaz en español neutro (tuteo). Para otro idioma: copiar este archivo.
export const es = {
  menuEntrada: { abrir: 'Abrir', eliminar: 'Eliminar entrada…' },
  app: 'diarLinux',
  nav: {
    calendario: 'Calendario',
    timeline: 'Línea de tiempo',
    buscar: 'Buscar',
    etiquetas: 'Etiquetas',
    exportar: 'Exportar',
    guardar: 'Guardar',
    atras: 'Atrás',
    enEsteDia: 'En este día',
    configuracion: 'Configuración'
  },
  dias: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
  diasCortos: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
  meses: [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre'
  ],
  bloqueo: {
    contrasena: 'Contraseña',
    desbloquear: 'Desbloquear diario',
    abriendo: 'Abriendo…',
    olvide: '¿Olvidaste tu contraseña?',
    codigo: 'Código de recuperación',
    nueva: 'Contraseña nueva',
    repetir: 'Repetir la contraseña',
    entrarConCodigo: 'Entrar y cambiar la contraseña',
    volver: 'Volver',
    noCoinciden: 'Las contraseñas no coinciden'
  },
  asistente: {
    titulo: 'Crea tu diario',
    texto:
      'Todo lo que escribas se guarda cifrado en esta carpeta. Sin la contraseña nadie puede leerlo.',
    carpeta: 'Carpeta del diario',
    cambiar: 'Cambiar…',
    crear: 'Crear diario',
    creando: 'Creando…',
    restaurar: 'Restaurar desde un backup…',
    codigoTitulo: 'Tu código de recuperación',
    codigoTexto:
      'Si olvidas la contraseña, este código es la ÚNICA forma de entrar. Anótalo en papel y guárdalo en un lugar seguro: no se vuelve a mostrar.',
    anotado: 'Lo anoté en un lugar seguro',
    continuar: 'Continuar',
    fuerza: ['Muy débil', 'Débil', 'Aceptable', 'Buena', 'Muy buena']
  },
  editor: {
    titulo: 'Título',
    escribe: 'Escribe tu entrada…',
    guardado: 'Guardado',
    guardando: 'Guardando…',
    eliminar: 'Eliminar entrada',
    cambiarFecha: 'Cambiar fecha',
    confirmarEliminar: '¿Eliminar esta entrada? No se puede deshacer.',
    agregarFoto: 'Agregar foto',
    agregarEtiquetas: 'Agregar etiquetas',
    agregarPersonas: 'Agregar personas',
    agregarAudio: 'Agregar audio',
    agregarArchivo: 'Agregar archivo',
    nuevaEtiqueta: 'Nueva etiqueta…',
    nuevaPersona: 'Nombre de la persona…',
    tusEtiquetas: 'Tus etiquetas (clic para agregar)',
    tusPersonas: 'Tus personas (clic para agregar)',
    colorDeLaNueva: 'Nueva — elige el color',
    crearYAgregar: 'Crear y agregar (Enter)',
    yaEsta: 'Ya está en esta entrada.',
    escribeEtiqueta: 'Escribe el nombre de una etiqueta nueva.',
    escribePersona: 'Escribe el nombre de una persona nueva.',
    enFase2: 'Disponible en la Fase 2',
    consultandoClima: 'Consultando el clima…',
    duplicar: 'Duplicar entrada',
    exportarEsta: 'Exportar esta entrada…',
    plantillas: 'Plantilla',
    sinPlantillas: 'Todavía no tienes plantillas: créalas en Configuración → General.',
    sinGuardar: 'Sin guardar',
    nadaQueExportar: 'La entrada está vacía: no hay nada que exportar',
    duplicando: 'Duplicando…',
    aplicarPlantilla: 'Aplicar plantilla',
    sinClima: 'No hay datos del clima para esa fecha',
    agregarClima: 'Agregar clima',
    actualizarClima: 'Actualizar clima',
    quitarClima: 'Quitar el clima',
    elegirCiudad: 'Elige tu ciudad en Configuración → Clima',
    amanecer: 'Amanecer',
    atardecer: 'Atardecer',
    enlace: 'Dirección del enlace (https://…)'
  },
  grupos: {
    etiquetas: 'Etiquetas',
    personas: 'Personas',
    porNombre: 'Por nombre',
    porCantidad: 'Por cantidad',
    ordenar: 'Ordenar',
    renombrar: 'Renombrar',
    cambiarColor: 'Cambiar color',
    fusionar: 'Fusionar con…',
    eliminar: 'Eliminar',
    opciones: 'Opciones (o clic derecho)',
    predeterminado: 'Azul (predeterminado)',
    nuevaEtiqueta: 'Nueva etiqueta',
    nuevaPersona: 'Nueva persona',
    nombreEtiqueta: 'Nombre de la etiqueta nueva',
    nombrePersona: 'Nombre de la persona nueva',
    crear: 'Crear',
    yaExisteEtiqueta: 'Ya existe una etiqueta con ese nombre',
    yaExistePersona: 'Ya existe una persona con ese nombre',
    volver: 'Volver',
    vacioEtiquetas:
      'Todavía no hay etiquetas. Agrégalas desde una entrada con «Agregar etiquetas».',
    vacioPersonas: 'Todavía no hay personas. Agrégalas desde una entrada con «Agregar personas».',
    sinEntradas: 'Ninguna entrada la tiene.',
    fusionarTitulo: (n: string) => `Fusionar «${n}» con…`,
    fusionarAviso: (origen: string, destino: string, cant: number) =>
      `${cant === 1 ? 'La entrada' : `Las ${cant} entradas`} de «${origen}» ${cant === 1 ? 'pasa' : 'pasan'} a «${destino}», y «${origen}» se borra.`,
    buscar: 'Buscar…',
    confirmarFusion: 'Fusionar',
    cancelar: 'Cancelar',
    confirmarEliminar: (tipo: 'etiqueta' | 'persona', n: string, cant: number) =>
      `¿Eliminar ${tipo === 'etiqueta' ? 'la etiqueta' : 'a la persona'} «${n}»?` +
      (cant
        ? ` Se quita de ${cant === 1 ? '1 entrada' : `${cant} entradas`} (las entradas no se borran).`
        : '')
  },
  buscar: {
    campo: 'Buscar',
    filtros: 'Filtros',
    limpiar: 'Limpiar filtros',
    desde: 'Desde',
    hasta: 'Hasta',
    calificacion: 'Calificación mínima',
    contiene: 'Contiene',
    fotos: 'Fotos',
    videos: 'Videos',
    audio: 'Audio',
    archivos: 'Archivos',
    etiquetas: 'Etiquetas',
    personas: 'Personas',
    inicio:
      'Escribe para buscar en todo tu diario (sin importar acentos ni mayúsculas), o usa los filtros.',
    nada: 'No se encontró ninguna entrada.',
    cantidad: (n: number) =>
      n === 1 ? '1 entrada' : n >= 500 ? 'Más de 500 entradas (se muestran 500)' : `${n} entradas`
  },
  enEsteDia: {
    hace: (n: number) => (n === 1 ? 'Hace 1 año' : `Hace ${n} años`),
    volverHoy: 'Volver a hoy',
    diaAnterior: 'Día anterior',
    diaSiguiente: 'Día siguiente',
    vacio: (dia: string) =>
      `Ningún año anterior tiene entradas un ${dia}. Lo que escribas hoy aparecerá aquí el año que viene.`
  },
  vacio: {
    timeline: 'Todavía no hay entradas. Toca + para escribir la primera.'
  }
}
