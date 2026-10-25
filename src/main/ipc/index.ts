/**
 * Handlers IPC tipados. Cada canal = una función concreta (nunca ipcRenderer crudo).
 * Los errores vuelven como { error: 'mensaje en español' } y el preload los relanza.
 * Nunca se manda contenido del diario a la consola ni a logs.
 */
import { aplicarIdioma } from '../idioma'
import { idioma, t } from '../../shared/i18n'
import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { ContrasenaIncorrecta, VaultInvalido } from '../../core/crypto/vault'
import type {
  AdjuntoExtra,
  Ajustes,
  AjustesClima,
  FiltrosBusqueda,
  FormatoExportar,
  FotoNueva,
  OpcionesExportar,
  GuardarEntrada
} from '../../shared/tipos'
import { ajustesClima, buscarCiudad, climaParaEntrada, guardarAjustesClima } from '../clima'
import {
  abrirAdjunto,
  agregarDatos,
  agregarDesdeRuta,
  agregarFoto,
  borrarTodosLosAdjuntos,
  copiarAdjunto,
  eliminarAdjunto,
  eliminarAdjuntosDe,
  guardarCopia,
  listarAdjuntos,
  tamanoAdjuntos
} from '../adjuntos'
import { crearBackup, listarBackups, restaurarBackup } from '../backup'
import {
  adjuntarRecurso,
  analizarDiarium,
  analizarJoplin,
  leerRecurso,
  notaDiarium,
  marcarImportada,
  notaJoplin,
  terminarImportacion
} from '../importar'
import { guardarConfig, leerConfig, type Config } from '../config'
import { ACENTOS, ACENTO_SKIN, SKIN_CLASICO, skinPorId } from '../../shared/temas'
import { fondoApariencia } from '../apariencia'
import { diario, ErrorDiario } from '../diario'
import { tocarActividad } from '../bloqueo'
import { contarExportables, exportar } from '../exportar'
import { actualizarBandeja, aplicarAutostart } from '../bandeja'
import { horaValida } from '../../core/services/recordatorio'

type Fn = (...args: never[]) => unknown

let ventana: BrowserWindow | null = null
export const ZOOM_MIN = 0.8
export const ZOOM_MAX = 2
export function usarVentana(v: BrowserWindow): void {
  ventana = v
}

function mensaje(e: unknown): string {
  // Los errores se generan en español (el texto es la clave) y se traducen aquí, al mostrarlos
  if (e instanceof ContrasenaIncorrecta) return t('Contraseña incorrecta')
  if (e instanceof VaultInvalido || e instanceof ErrorDiario) return t(e.message)
  const m = (e as Error)?.message ?? ''
  // Errores esperables con mensaje propio en español; el resto, genérico (sin filtrar datos)
  if (/^(La |El |Ese |Esa |En esa |Ya |Elige |Fecha|Hora|Espera|No |Sin conexión|Eso )/.test(m))
    return t(m)
  console.error('[ipc] error inesperado:', (e as Error)?.name)
  return t('Ocurrió un error inesperado')
}

function manejar(canal: string, fn: Fn): void {
  ipcMain.handle(canal, async (ev: IpcMainInvokeEvent, ...args: unknown[]) => {
    // Solo la ventana del diario puede llamar
    if (!ventana || ev.sender !== ventana.webContents) return { error: 'No permitido' }
    try {
      return { valor: await (fn as (...a: unknown[]) => unknown)(...args) }
    } catch (e) {
      return { error: mensaje(e) }
    }
  })
}

const str = (x: unknown, max = 10_000_000): string => {
  if (typeof x !== 'string' || x.length > max) throw new ErrorDiario('Dato inválido')
  return x
}

/** Las preferencias que ve la ventana (sin la carpeta ni datos internos). */
const FORMATOS: FormatoExportar[] = ['docx', 'pdf', 'html', 'md', 'txt', 'json']
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

function opcionesExportar(o: unknown): OpcionesExportar {
  const x = (o ?? {}) as Partial<OpcionesExportar>
  const fecha = (f: unknown): string => {
    if (typeof f !== 'string' || !FECHA_RE.test(f)) throw new ErrorDiario('Fecha inválida')
    return f
  }
  if (!FORMATOS.includes(x.formato as FormatoExportar)) throw new ErrorDiario('Formato inválido')
  const d = (x.datos ?? {}) as Partial<OpcionesExportar['datos']>
  const si = (v: unknown): boolean => v === true
  const desde = fecha(x.desde)
  const hasta = fecha(x.hasta)
  if (desde > hasta) throw new ErrorDiario('La fecha «Desde» es posterior a «Hasta»')
  return {
    desde,
    hasta,
    formato: x.formato as FormatoExportar,
    datos: {
      adjuntos: si(d.adjuntos),
      personas: si(d.personas),
      clima: si(d.clima),
      sol: si(d.sol),
      luna: si(d.luna),
      calificacion: si(d.calificacion),
      etiquetas: si(d.etiquetas)
    },
    porFecha: si(x.porFecha),
    adjuntosAparte: si(x.adjuntosAparte),
    soloEtiquetas: Array.isArray(x.soloEtiquetas)
      ? x.soloEtiquetas.slice(0, 10_000).map((t) => str(t, 64))
      : null,
    entradaId: x.entradaId === undefined ? undefined : str(x.entradaId, 64)
  }
}

function publicos(c: Config): Ajustes {
  return {
    idioma: c.idioma,
    primerDia: c.primerDia,
    bloqueoMinutos: c.bloqueoMinutos,
    backupCarpeta: c.backupCarpeta,
    backupConservar: c.backupConservar,
    backupCadaHoras: c.backupCadaHoras,
    zoom: c.zoom,
    compresion: c.compresion,
    fotosEnListas: c.fotosEnListas,
    contadorPalabras: c.contadorPalabras,
    objetivoPalabras: c.objetivoPalabras,
    tema: c.tema,
    acento: c.acento,
    skin: c.skin,
    barra: c.barra,
    lateralTinte: c.lateralTinte,
    fondoTinte: c.fondoTinte,
    fondoLuz: c.fondoLuz,
    fondoCalidez: c.fondoCalidez,
    textoSuave: c.textoSuave,
    fuenteTexto: c.fuenteTexto,
    tamTexto: c.tamTexto,
    encabezados: c.encabezados,
    etiquetasEnListas: c.etiquetasEnListas,
    recordatorio: c.recordatorio,
    recordatorioHora: c.recordatorioHora,
    bandeja: c.bandeja,
    cerrarABandeja: c.cerrarABandeja,
    iniciarConSistema: c.iniciarConSistema,
    autoguardadoSeg: c.autoguardadoSeg
  }
}

export function registrarIpc(): void {
  // ── vault ──
  manejar('vault:estado', () => diario.estado())
  manejar('vault:elegirCarpeta', async () => {
    const r = await dialog.showOpenDialog(ventana!, {
      title: t('Carpeta del diario'),
      defaultPath: leerConfig().carpeta,
      properties: ['openDirectory', 'createDirectory']
    })
    return r.canceled ? null : r.filePaths[0]
  })
  manejar('vault:crear', async (carpeta: unknown, contrasena: unknown) => {
    const c = path.resolve(str(carpeta, 4096))
    const codigo = await diario.crear(c, str(contrasena, 1024))
    guardarConfig({ carpeta: c, backupCarpeta: path.join(c, 'backups') })
    return { codigo }
  })
  manejar('vault:desbloquear', (c: unknown) => diario.desbloquear(str(c, 1024)))
  manejar('vault:desbloquearConCodigo', (codigo: unknown, nueva: unknown) =>
    diario.desbloquearConCodigo(str(codigo, 200), str(nueva, 1024))
  )
  manejar('vault:bloquear', () => diario.bloquear())
  manejar('vault:cambiarContrasena', (a: unknown, n: unknown) =>
    diario.cambiarContrasena(str(a, 1024), str(n, 1024))
  )
  manejar('vault:regenerarCodigo', async (c: unknown) => ({
    codigo: await diario.regenerarCodigo(str(c, 1024))
  }))
  ipcMain.on('vault:actividad', (ev) => {
    if (ventana && ev.sender === ventana.webContents) tocarActividad()
  })

  // ── entradas ──
  manejar('entradas:listar', (d?: unknown, h?: unknown) =>
    diario.repo.listar(
      d === undefined ? undefined : str(d, 10),
      h === undefined ? undefined : str(h, 10)
    )
  )
  manejar('entradas:delDia', (f: unknown) => diario.repo.delDia(str(f, 10)))
  manejar('entradas:diasConEntrada', (a: unknown) => diario.repo.diasConEntrada(Number(a)))
  manejar('entradas:obtener', (id: unknown) => diario.repo.obtener(str(id, 64)))
  manejar('entradas:guardar', (e: unknown) => diario.repo.guardar(e as GuardarEntrada))
  manejar('entradas:eliminar', (id: unknown) => {
    eliminarAdjuntosDe(str(id, 64))
    diario.repo.eliminar(str(id, 64))
  })

  // ── adjuntos (fotos) ──
  manejar('adjuntos:listar', (id: unknown) => listarAdjuntos(str(id, 64)))
  manejar('adjuntos:agregarFoto', (id: unknown, f: unknown) =>
    agregarFoto(str(id, 64), f as FotoNueva)
  )
  manejar('adjuntos:agregarRuta', (id: unknown, ruta: unknown, extra: unknown) => {
    const r = str(ruta, 4096)
    if (!path.isAbsolute(r)) throw new ErrorDiario('Ruta inválida')
    return agregarDesdeRuta(str(id, 64), r, (extra ?? { tipo: 'file' }) as AdjuntoExtra)
  })
  manejar('adjuntos:agregarDatos', (id: unknown, nombre: unknown, datos: unknown, extra: unknown) =>
    agregarDatos(str(id, 64), str(nombre, 255), datos, (extra ?? { tipo: 'file' }) as AdjuntoExtra)
  )
  manejar('adjuntos:abrir', (id: unknown) => abrirAdjunto(str(id, 64)))
  manejar('adjuntos:guardarCopia', (id: unknown) => guardarCopia(str(id, 64), ventana))
  manejar('adjuntos:eliminar', (id: unknown) => eliminarAdjunto(str(id, 64)))
  manejar('entradas:vecina', (f: unknown, s: unknown) =>
    diario.repo.vecina(str(f, 10), s === -1 ? -1 : 1)
  )
  manejar('entradas:rangoAnios', () => diario.repo.rangoAnios())
  manejar('entradas:buscar', (f: unknown) => {
    const x = (f ?? {}) as FiltrosBusqueda
    const ids = (l: unknown): string[] =>
      Array.isArray(l) ? l.slice(0, 200).map((v) => str(v, 64)) : []
    return diario.repo.buscar({
      texto: typeof x.texto === 'string' ? x.texto.slice(0, 300) : '',
      desde: typeof x.desde === 'string' ? x.desde : undefined,
      hasta: typeof x.hasta === 'string' ? x.hasta : undefined,
      etiquetas: ids(x.etiquetas),
      personas: ids(x.personas),
      calificacionMin: Number(x.calificacionMin) || 0,
      con: Array.isArray(x.con) ? x.con : []
    })
  })
  manejar('entradas:enEsteDia', (f: unknown) => diario.repo.enEsteDia(str(f, 10)))

  // ── clima (Open-Meteo, consultado desde main) ──
  manejar('clima:ajustes', () => ajustesClima())
  manejar('clima:guardarAjustes', (a: unknown) =>
    guardarAjustesClima((a ?? {}) as Partial<AjustesClima>)
  )
  manejar('clima:buscarCiudad', (t: unknown) => buscarCiudad(str(t, 200)))
  manejar('clima:paraEntrada', (id: unknown) => climaParaEntrada(str(id, 64)))
  manejar('clima:quitar', (id: unknown) => diario.repo.guardarClima(str(id, 64), null))

  // ── etiquetas y personas ──
  for (const [prefijo, tipo] of [
    ['etiquetas', 'etiqueta'],
    ['personas', 'persona']
  ] as const) {
    manejar(`${prefijo}:listar`, () => diario.repo.listarGrupo(tipo))
    manejar(`${prefijo}:crear`, (n: unknown) => diario.repo.crearEnGrupo(tipo, str(n, 200)))
    manejar(`${prefijo}:asignar`, (id: unknown, ids: unknown) => {
      if (!Array.isArray(ids)) throw new ErrorDiario('Dato inválido')
      return diario.repo.asignarEnGrupo(
        tipo,
        str(id, 64),
        ids.map((x) => str(x, 64))
      )
    })
    manejar(`${prefijo}:renombrar`, (id: unknown, n: unknown) =>
      diario.repo.renombrarEnGrupo(tipo, str(id, 64), str(n, 200))
    )
    manejar(`${prefijo}:color`, (id: unknown, c: unknown) =>
      diario.repo.colorearEnGrupo(tipo, str(id, 64), c === null ? null : str(c, 7))
    )
    manejar(`${prefijo}:fusionar`, (o: unknown, d: unknown) =>
      diario.repo.fusionarEnGrupo(tipo, str(o, 64), str(d, 64))
    )
    manejar(`${prefijo}:eliminar`, (id: unknown) => diario.repo.eliminarDeGrupo(tipo, str(id, 64)))
    manejar(`${prefijo}:entradas`, (id: unknown) => diario.repo.entradasDeGrupo(tipo, str(id, 64)))
  }

  // ── plantillas ──
  manejar('plantillas:listar', () => diario.repo.listarPlantillas())
  manejar('plantillas:guardar', (p: unknown) => {
    const x = (p ?? {}) as { id?: unknown; nombre?: unknown; html?: unknown }
    return diario.repo.guardarPlantilla({
      id: x.id === undefined ? undefined : str(x.id, 64),
      nombre: str(x.nombre, 200),
      html: str(x.html, 2_000_000)
    })
  })
  manejar('plantillas:eliminar', (id: unknown) => diario.repo.eliminarPlantilla(str(id, 64)))
  manejar('plantillas:defecto', () => diario.repo.ajuste<string | null>('plantillaDefecto', null))
  manejar('plantillas:elegirDefecto', (id: unknown) =>
    diario.repo.guardarAjuste('plantillaDefecto', id === null ? null : str(id, 64))
  )

  // ── exportar ──
  manejar('exportar:contar', (o: unknown) => contarExportables(opcionesExportar(o)))
  manejar('exportar:hacer', (o: unknown) =>
    exportar(opcionesExportar(o), ventana, (hechas, total) =>
      ventana?.webContents.send('exportar:avance', hechas, total)
    )
  )
  manejar('exportar:mostrar', (ruta: unknown) => {
    if (process.env.DIARLINUX_OCULTA !== '1') shell.showItemInFolder(str(ruta, 4096))
  })

  // ── duplicar, estadísticas, acerca de, restablecer ──
  manejar('diario:duplicar', async (id: unknown) => {
    const origen = str(id, 64)
    const nueva = diario.repo.duplicar(origen)
    for (const a of listarAdjuntos(origen)) await copiarAdjunto(a.id, nueva)
    return nueva
  })
  manejar('diario:estadisticas', () => {
    const tam = (f: string): number => (fs.existsSync(f) ? fs.statSync(f).size : 0)
    const db = path.join(diario.carpeta, 'diario.db')
    return {
      ...diario.repo.estadisticas(),
      tamanoBase: tam(db) + tam(db + '-wal'),
      tamanoAdjuntos: tamanoAdjuntos()
    }
  })
  manejar('diario:acercaDe', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    carpeta: diario.carpeta,
    config: app.getPath('userData')
  }))
  manejar('diario:abrirCarpeta', async () => {
    if (process.env.DIARLINUX_OCULTA !== '1') await shell.openPath(diario.carpeta)
  })
  manejar('diario:vaciar', async (c: unknown) => {
    await diario.verificarContrasena(str(c, 1024))
    crearBackup() // por si acaso: se puede volver atrás restaurándolo
    borrarTodosLosAdjuntos()
    diario.repo.vaciar()
  })

  // ── importar desde Joplin ──
  manejar('importar:elegirJoplin', async (carpeta: unknown) => {
    // En las pruebas (ventana oculta) se elige sin diálogo
    if (process.env.DIARLINUX_OCULTA === '1' && process.env.DIARLINUX_ELEGIR)
      return process.env.DIARLINUX_ELEGIR
    const r = await dialog.showOpenDialog(ventana!, {
      title: carpeta
        ? t('Carpeta RAW exportada por Joplin')
        : t('Archivo JEX exportado por Joplin'),
      defaultPath: app.getPath('downloads'),
      filters: carpeta ? [] : [{ name: t('Exportación de Joplin (JEX)'), extensions: ['jex'] }],
      properties: carpeta ? ['openDirectory'] : ['openFile']
    })
    return r.canceled ? null : r.filePaths[0]
  })
  manejar('importar:analizarJoplin', (ruta: unknown) => {
    const r = str(ruta, 4096)
    if (!path.isAbsolute(r)) throw new ErrorDiario('Ruta inválida')
    return analizarJoplin(r)
  })
  manejar('importar:notaJoplin', (i: unknown, lib: unknown) => notaJoplin(Number(i), lib === true))
  // ── importar desde Diarium (.zip exportado en formato JSON) ──
  manejar('importar:elegirDiarium', async () => {
    if (process.env.DIARLINUX_OCULTA === '1' && process.env.DIARLINUX_ELEGIR)
      return process.env.DIARLINUX_ELEGIR
    const r = await dialog.showOpenDialog(ventana!, {
      title: t('Archivo .zip exportado por Diarium (formato JSON)'),
      defaultPath: app.getPath('documents'),
      filters: [{ name: t('Exportación de Diarium (.zip)'), extensions: ['zip'] }],
      properties: ['openFile']
    })
    return r.canceled ? null : r.filePaths[0]
  })
  manejar('importar:analizarDiarium', (ruta: unknown) => {
    const r = str(ruta, 4096)
    if (!path.isAbsolute(r)) throw new ErrorDiario('Ruta inválida')
    return analizarDiarium(r)
  })
  manejar('importar:notaDiarium', (i: unknown) => notaDiarium(Number(i)))
  // comunes a las dos fuentes (la de la sesión abierta)
  manejar('importar:leerRecurso', (id: unknown) => leerRecurso(str(id, 600)))
  manejar('importar:adjuntarRecurso', (e: unknown, id: unknown, extra: unknown) =>
    adjuntarRecurso(str(e, 64), str(id, 600), (extra ?? { tipo: 'file' }) as AdjuntoExtra)
  )
  manejar('importar:marcar', (j: unknown, e: unknown) => marcarImportada(str(j, 200), str(e, 64)))
  manejar('importar:terminar', () => terminarImportacion())

  // ── ajustes (preferencias fuera del diario) ──
  manejar('ajustes:obtener', () => publicos(leerConfig()))
  manejar('app:idioma', () => idioma())
  manejar('ajustes:guardar', (a: unknown) => {
    const x = (a ?? {}) as Partial<Ajustes>
    const limpio: Partial<Ajustes> & { ultimoRecordatorio?: null } = {}
    if (['auto', 'es', 'en'].includes(String(x.idioma))) limpio.idioma = x.idioma
    if (x.primerDia === 0 || x.primerDia === 1) limpio.primerDia = x.primerDia
    if ([0, 1, 5, 15, 30, 60].includes(Number(x.bloqueoMinutos)))
      limpio.bloqueoMinutos = Number(x.bloqueoMinutos)
    if (typeof x.backupCarpeta === 'string' && path.isAbsolute(x.backupCarpeta))
      limpio.backupCarpeta = x.backupCarpeta
    if (Number(x.backupConservar) >= 1 && Number(x.backupConservar) <= 365)
      limpio.backupConservar = Math.round(Number(x.backupConservar))
    if ([0, 6, 12, 24, 72, 168].includes(Number(x.backupCadaHoras)))
      limpio.backupCadaHoras = Number(x.backupCadaHoras)
    if (Number(x.zoom) >= ZOOM_MIN && Number(x.zoom) <= ZOOM_MAX)
      limpio.zoom = Math.round(Number(x.zoom) * 100) / 100
    if (['original', 'estandar', 'alta'].includes(String(x.compresion)))
      limpio.compresion = x.compresion
    if (typeof x.fotosEnListas === 'boolean') limpio.fotosEnListas = x.fotosEnListas
    if (typeof x.contadorPalabras === 'boolean') limpio.contadorPalabras = x.contadorPalabras
    if (Number.isInteger(Number(x.objetivoPalabras)) && Number(x.objetivoPalabras) >= 0)
      limpio.objetivoPalabras = Math.min(1_000_000, Number(x.objetivoPalabras))
    if (['oscuro', 'claro', 'sistema'].includes(String(x.tema))) limpio.tema = x.tema
    if (
      typeof x.acento === 'string' &&
      (x.acento === ACENTO_SKIN || ACENTOS.some((a) => a.id === x.acento))
    )
      limpio.acento = x.acento
    if (typeof x.skin === 'string' && (x.skin === SKIN_CLASICO || skinPorId(x.skin)))
      limpio.skin = x.skin
    if (['color', 'plana', 'discreta'].includes(String(x.barra))) limpio.barra = x.barra
    if (typeof x.lateralTinte === 'boolean') limpio.lateralTinte = x.lateralTinte
    if (typeof x.fondoTinte === 'boolean') limpio.fondoTinte = x.fondoTinte
    const entre = (v: unknown, a: number, b: number): number | undefined =>
      v === undefined || !Number.isFinite(Number(v))
        ? undefined
        : Math.round(Math.min(b, Math.max(a, Number(v))))
    if (entre(x.fondoLuz, -100, 100) !== undefined) limpio.fondoLuz = entre(x.fondoLuz, -100, 100)
    if (entre(x.fondoCalidez, -100, 100) !== undefined)
      limpio.fondoCalidez = entre(x.fondoCalidez, -100, 100)
    if (entre(x.textoSuave, 0, 100) !== undefined) limpio.textoSuave = entre(x.textoSuave, 0, 100)
    if (['sans', 'serif', 'mono', 'sistema'].includes(String(x.fuenteTexto)))
      limpio.fuenteTexto = x.fuenteTexto
    if (Number(x.tamTexto) >= 12 && Number(x.tamTexto) <= 34)
      limpio.tamTexto = Math.round(Number(x.tamTexto) * 2) / 2
    if (typeof x.encabezados === 'boolean') limpio.encabezados = x.encabezados
    if (typeof x.etiquetasEnListas === 'boolean') limpio.etiquetasEnListas = x.etiquetasEnListas
    if (typeof x.recordatorio === 'boolean') limpio.recordatorio = x.recordatorio
    if (horaValida(x.recordatorioHora)) limpio.recordatorioHora = x.recordatorioHora
    if (Number.isInteger(Number(x.autoguardadoSeg)) && Number(x.autoguardadoSeg) >= 0)
      limpio.autoguardadoSeg = Math.min(3600, Number(x.autoguardadoSeg))
    if (typeof x.bandeja === 'boolean') limpio.bandeja = x.bandeja
    if (typeof x.cerrarABandeja === 'boolean') limpio.cerrarABandeja = x.cerrarABandeja
    if (typeof x.iniciarConSistema === 'boolean') {
      aplicarAutostart(x.iniciarConSistema) // si falla, no se guarda y la ventana ve el error
      limpio.iniciarConSistema = x.iniciarConSistema
    }
    // cambiar la hora o reactivar el aviso: hoy puede volver a avisar
    if (limpio.recordatorioHora !== undefined || limpio.recordatorio)
      limpio.ultimoRecordatorio = null
    const c = guardarConfig(limpio as Partial<Config>)
    if (limpio.idioma !== undefined) aplicarIdioma()
    if (limpio.bandeja !== undefined || limpio.idioma !== undefined)
      void actualizarBandeja(limpio.idioma !== undefined)
    ventana?.setBackgroundColor(fondoApariencia(c))
    if (limpio.zoom) ventana?.webContents.setZoomFactor(limpio.zoom)
    return publicos(c)
  })

  // ── backups ──
  manejar('backups:listar', () => listarBackups())
  manejar('backups:ahora', () => crearBackup())
  manejar('backups:elegirCarpeta', async () => {
    const r = await dialog.showOpenDialog(ventana!, {
      title: t('Carpeta de los backups'),
      defaultPath: leerConfig().backupCarpeta,
      properties: ['openDirectory', 'createDirectory']
    })
    return r.canceled ? null : r.filePaths[0]
  })
  manejar('backups:elegirArchivo', async () => {
    const r = await dialog.showOpenDialog(ventana!, {
      title: t('Elegir un backup'),
      defaultPath: leerConfig().backupCarpeta,
      filters: [{ name: t('Backup de diarLinux'), extensions: ['tar'] }],
      properties: ['openFile']
    })
    return r.canceled ? null : r.filePaths[0]
  })
  manejar('backups:restaurar', async (archivo: unknown, contrasena: unknown) => {
    const r = await restaurarBackup(
      str(archivo, 4096),
      contrasena ? str(contrasena, 1024) : undefined
    )
    // Restaurar cierra y reabre el diario por dentro: avisar a la ventana que vuelve a estar abierto
    if ('ok' in r) ventana?.webContents.send('vault:abierto')
    return r
  })
}
