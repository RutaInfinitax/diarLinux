/**
 * Puente seguro: expone SOLO window.diario con funciones concretas (nunca ipcRenderer crudo).
 */
import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { ApiGrupo, DiarioApi } from '../shared/tipos'

async function llamar<T>(canal: string, ...args: unknown[]): Promise<T> {
  const r = (await ipcRenderer.invoke(canal, ...args)) as { valor?: T; error?: string }
  if (r && 'error' in r && r.error) throw new Error(r.error)
  return r.valor as T
}

const grupo = (p: 'etiquetas' | 'personas'): ApiGrupo => ({
  listar: () => llamar(`${p}:listar`),
  crear: (n) => llamar(`${p}:crear`, n),
  asignar: (id, ids) => llamar(`${p}:asignar`, id, ids),
  renombrar: (id, n) => llamar(`${p}:renombrar`, id, n),
  color: (id, c) => llamar(`${p}:color`, id, c),
  fusionar: (o, d) => llamar(`${p}:fusionar`, o, d),
  eliminar: (id) => llamar(`${p}:eliminar`, id),
  entradas: (id) => llamar(`${p}:entradas`, id)
})

const api: Omit<DiarioApi, 'app'> = {
  vault: {
    estado: () => llamar('vault:estado'),
    elegirCarpeta: () => llamar('vault:elegirCarpeta'),
    crear: (carpeta, contrasena) => llamar('vault:crear', carpeta, contrasena),
    desbloquear: (c) => llamar('vault:desbloquear', c),
    desbloquearConCodigo: (codigo, nueva) => llamar('vault:desbloquearConCodigo', codigo, nueva),
    bloquear: () => llamar('vault:bloquear'),
    cambiarContrasena: (a, n) => llamar('vault:cambiarContrasena', a, n),
    regenerarCodigo: (c) => llamar('vault:regenerarCodigo', c),
    actividad: () => ipcRenderer.send('vault:actividad'),
    alBloquear: (fn) => {
      const f = (): void => fn()
      ipcRenderer.on('vault:bloqueado', f)
      return () => ipcRenderer.removeListener('vault:bloqueado', f)
    },
    alAbrirse: (fn) => {
      const f = (): void => fn()
      ipcRenderer.on('vault:abierto', f)
      return () => ipcRenderer.removeListener('vault:abierto', f)
    }
  },
  entradas: {
    listar: (d, h) => llamar('entradas:listar', d, h),
    delDia: (f) => llamar('entradas:delDia', f),
    diasConEntrada: (a) => llamar('entradas:diasConEntrada', a),
    obtener: (id) => llamar('entradas:obtener', id),
    guardar: (e) => llamar('entradas:guardar', e),
    eliminar: (id) => llamar('entradas:eliminar', id),
    vecina: (f, s) => llamar('entradas:vecina', f, s),
    rangoAnios: () => llamar('entradas:rangoAnios'),
    buscar: (f) => llamar('entradas:buscar', f),
    enEsteDia: (f) => llamar('entradas:enEsteDia', f)
  },
  clima: {
    ajustes: () => llamar('clima:ajustes'),
    guardarAjustes: (a) => llamar('clima:guardarAjustes', a),
    buscarCiudad: (t) => llamar('clima:buscarCiudad', t),
    paraEntrada: (id) => llamar('clima:paraEntrada', id),
    quitar: (id) => llamar('clima:quitar', id)
  },
  etiquetas: grupo('etiquetas'),
  personas: grupo('personas'),
  adjuntos: {
    listar: (id) => llamar('adjuntos:listar', id),
    agregarFoto: (id, f) => llamar('adjuntos:agregarFoto', id, f),
    agregarRuta: (id, ruta, extra) => llamar('adjuntos:agregarRuta', id, ruta, extra),
    agregarDatos: (id, nombre, datos, extra) =>
      llamar('adjuntos:agregarDatos', id, nombre, datos, extra),
    abrir: (id) => llamar('adjuntos:abrir', id),
    guardarCopia: (id) => llamar('adjuntos:guardarCopia', id),
    eliminar: (id) => llamar('adjuntos:eliminar', id)
  },
  plantillas: {
    listar: () => llamar('plantillas:listar'),
    guardar: (p) => llamar('plantillas:guardar', p),
    eliminar: (id) => llamar('plantillas:eliminar', id),
    defecto: () => llamar('plantillas:defecto'),
    elegirDefecto: (id) => llamar('plantillas:elegirDefecto', id)
  },
  diarioExtra: {
    duplicar: (id) => llamar('diario:duplicar', id),
    estadisticas: () => llamar('diario:estadisticas'),
    acercaDe: () => llamar('diario:acercaDe'),
    abrirCarpeta: () => llamar('diario:abrirCarpeta'),
    vaciar: (c) => llamar('diario:vaciar', c)
  },
  exportar: {
    hacer: (o) => llamar('exportar:hacer', o),
    contar: (o) => llamar('exportar:contar', o),
    mostrar: (r) => llamar('exportar:mostrar', r),
    alAvanzar: (fn) => {
      const f = (_: unknown, h: number, t: number): void => fn(h, t)
      ipcRenderer.on('exportar:avance', f)
      return () => ipcRenderer.removeListener('exportar:avance', f)
    }
  },
  importar: {
    elegirJoplin: (c) => llamar('importar:elegirJoplin', c),
    analizarJoplin: (r) => llamar('importar:analizarJoplin', r),
    notaJoplin: (i, l) => llamar('importar:notaJoplin', i, l),
    elegirDiarium: () => llamar('importar:elegirDiarium'),
    analizarDiarium: (r) => llamar('importar:analizarDiarium', r),
    notaDiarium: (i) => llamar('importar:notaDiarium', i),
    leerRecurso: (id) => llamar('importar:leerRecurso', id),
    adjuntarRecurso: (e, id, x) => llamar('importar:adjuntarRecurso', e, id, x),
    marcar: (j, e) => llamar('importar:marcar', j, e),
    terminar: () => llamar('importar:terminar')
  },
  ajustes: {
    obtener: () => llamar('ajustes:obtener'),
    guardar: (a) => llamar('ajustes:guardar', a)
  },
  backups: {
    listar: () => llamar('backups:listar'),
    ahora: () => llamar('backups:ahora'),
    elegirCarpeta: () => llamar('backups:elegirCarpeta'),
    elegirArchivo: () => llamar('backups:elegirArchivo'),
    restaurar: (archivo, contrasena) => llamar('backups:restaurar', archivo, contrasena)
  }
}

// Antes de cerrar la ventana, main pide guardar lo pendiente
const app = {
  rutaDe: (archivo: File): string => {
    try {
      return webUtils.getPathForFile(archivo)
    } catch {
      return ''
    }
  },
  alNuevaEntrada: (fn: () => void): (() => void) => {
    const f = (): void => fn()
    ipcRenderer.on('app:nuevaEntrada', f)
    return () => ipcRenderer.removeListener('app:nuevaEntrada', f)
  },
  alPreguntarPendiente: (fn: () => boolean): void => {
    ipcRenderer.on('app:hayPendiente', () => ipcRenderer.send('app:pendiente', fn()))
  },
  enfocar: (motivo = ''): void => ipcRenderer.send('app:enfocar', motivo),
  idioma: (): Promise<'es' | 'en'> => llamar('app:idioma'),
  registroFoco: (m: string): void => ipcRenderer.send('app:registroFoco', m),
  alCerrar: (fn: () => Promise<void>): void => {
    ipcRenderer.on('app:guardar', async () => {
      try {
        await fn()
      } finally {
        ipcRenderer.send('app:guardado')
      }
    })
  }
}

contextBridge.exposeInMainWorld('diario', { ...api, app })
