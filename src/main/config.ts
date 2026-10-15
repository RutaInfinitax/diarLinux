/**
 * Preferencias de la app que NO son contenido del diario (carpeta de datos, backups, bloqueo,
 * primer día de la semana). Se guardan en ~/.config/diarlinux/config.json para poder mostrarlas
 * antes de desbloquear. Lo del diario (ciudad del clima, plantillas…) va dentro de la base cifrada.
 */
import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { Ajustes } from '../shared/tipos'
import { escribirAtomico } from './fsutil'
import type { EstadoVentana } from './ventana'

/** Para quien instala la app por primera vez: ~/Documentos/diarLinux (cambiable en el asistente). */
export const carpetaDefecto = (): string => path.join(app.getPath('documents'), 'diarLinux')

export interface Config extends Ajustes {
  carpeta: string
  ultimoBackup: string | null
  ultimoRecordatorio: string | null // AAAA-MM-DD del último aviso
  ventana?: EstadoVentana // cómo quedó la ventana (tamaño, posición, maximizada)
}

const archivo = (): string => path.join(app.getPath('userData'), 'config.json')

function defecto(): Config {
  const carpeta = process.env.DIARLINUX_DATA || carpetaDefecto()
  return {
    carpeta,
    // pruebas: español salvo que pidan otro (DIARLINUX_IDIOMA = es / en / auto)
    idioma:
      (process.env.DIARLINUX_IDIOMA as Config['idioma'] | undefined) ||
      (process.env.DIARLINUX_OCULTA === '1' ? 'es' : 'auto'),
    primerDia: 0,
    bloqueoMinutos: 15,
    backupCarpeta: path.join(carpeta, 'backups'),
    backupConservar: 14,
    backupCadaHoras: 24,
    // Más grande por defecto (el usuario lo veía todo muy chico); en las pruebas, 100 %
    zoom: process.env.DIARLINUX_OCULTA === '1' ? 1 : 1.25,
    compresion: 'estandar',
    fotosEnListas: true,
    contadorPalabras: false,
    objetivoPalabras: 0,
    tema: 'oscuro',
    acento: 'azul',
    skin: 'clasico',
    barra: 'color',
    lateralTinte: false,
    fondoTinte: false,
    fondoLuz: 0,
    fondoCalidez: 0,
    textoSuave: 0,
    fuenteTexto: 'sans',
    tamTexto: 15.5,
    encabezados: true,
    etiquetasEnListas: true,
    recordatorio: false,
    recordatorioHora: '21:00',
    bandeja: false,
    cerrarABandeja: false,
    iniciarConSistema: false,
    // pedido del usuario: guardar cada 4 minutos (y solo si hay cambios); en las pruebas, al toque
    autoguardadoSeg: process.env.DIARLINUX_OCULTA === '1' ? 1 : 240,
    ultimoBackup: null,
    ultimoRecordatorio: null
  }
}

let cache: Config | null = null

export function leerConfig(): Config {
  if (cache) return cache
  let guardada: Partial<Config> = {}
  // Con DIARLINUX_DATA (diario de prueba) no se lee ni se toca la configuración real
  if (!process.env.DIARLINUX_DATA) {
    try {
      guardada = JSON.parse(fs.readFileSync(archivo(), 'utf8'))
    } catch {
      /* primera vez */
    }
  }
  cache = { ...defecto(), ...guardada }
  return cache
}

export function guardarConfig(cambios: Partial<Config>): Config {
  cache = { ...leerConfig(), ...cambios }
  if (!process.env.DIARLINUX_DATA) {
    fs.mkdirSync(path.dirname(archivo()), { recursive: true })
    escribirAtomico(archivo(), JSON.stringify(cache, null, 2))
  }
  return cache
}
