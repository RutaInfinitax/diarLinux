/**
 * Ícono en la bandeja (abrir, nueva entrada, bloquear, salir), cerrar a la bandeja, recordatorio
 * diario con notificación nativa (KDE) e iniciar con el sistema (~/.config/autostart).
 * Todo opcional y desactivado de fábrica. El recordatorio solo funciona con la app abierta
 * (aunque sea escondida en la bandeja).
 */
import { app, BrowserWindow, nativeImage, Notification } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import iconoAsar from '../../resources/icon.png?asset'

import { diaLocal, tocaRecordar } from '../core/services/recordatorio'
import { guardarConfig, leerConfig } from './config'
import { diario } from './diario'
import { IconoBandeja } from './sni'
import { abrirMaximizada } from './ventana'
import { t } from '../shared/i18n'

// En el paquete, resources/ va fuera del .asar (asarUnpack): los avisos los muestra otro programa
// (el demonio de notificaciones), que no puede leer dentro del .asar.
const icon = iconoAsar.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1')

// En las pruebas no se crea el ícono de verdad (aparecería en la bandeja del usuario)
let bandejaDePrueba = false
let ventana: () => BrowserWindow | null = () => null
/** Se está saliendo de verdad (Salir, apagar): cerrar la ventana no la esconde. */
export let saliendo = false
export function marcarSaliendo(): void {
  saliendo = true
}
/** El usuario canceló la salida (tenía cambios sin guardar): todo sigue como antes. */
export function cancelarSalida(): void {
  saliendo = false
}

const prueba = process.env.DIARLINUX_OCULTA === '1'
// Prueba de la bandeja de verdad (scripts/e2e-bandeja.mjs): con la ventana oculta pero el ícono real
const bandejaReal = process.env.DIARLINUX_BANDEJA_REAL === '1'

export function mostrarVentana(): void {
  const v = ventana()
  if (!v) return
  if (v.isMinimized()) v.restore()
  // primera vez que se muestra (arrancó escondido en la bandeja): como se cerró la última vez
  if (!v.isVisible() && abrirMaximizada() && !v.isMaximized()) v.maximize()
  if (!prueba) v.show()
  v.focus()
}

function nuevaEntrada(): void {
  mostrarVentana()
  ventana()?.webContents.send('app:nuevaEntrada')
}

/** Cerrar la ventana la esconde en la bandeja (si está activado y hay bandeja). */
export function cerrarEsconde(): boolean {
  const c = leerConfig()
  return !saliendo && hayBandeja() && c.bandeja && c.cerrarABandeja
}

let icono: IconoBandeja | null = null
let cola: Promise<void> = Promise.resolve()
let ultimoSinFoco = 0 // cuándo perdió el foco la ventana (al tocar el ícono, el panel se lo saca)

/** Clic en el ícono: si la ventana estaba al frente, se esconde; si no, se muestra. */
function alternarVentana(): void {
  const v = ventana()
  if (!v) return
  const alFrente =
    v.isVisible() && !v.isMinimized() && (v.isFocused() || Date.now() - ultimoSinFoco < 500)
  if (alFrente) v.hide()
  else mostrarVentana()
}

/** Crea o quita el ícono de la bandeja según la configuración (en orden, nunca dos a la vez). */
export function actualizarBandeja(rehacer = false): Promise<void> {
  cola = cola.then(async () => {
    const quiere = leerConfig().bandeja
    if (rehacer && icono) {
      icono.cerrar()
      icono = null
    }
    if (prueba && !bandejaReal) {
      bandejaDePrueba = quiere
      return
    }
    if (!quiere) {
      icono?.cerrar() // cierra su conexión D-Bus: KDE lo quita en el acto
      icono = null
      return
    }
    if (icono) return
    const nuevo = new IconoBandeja(
      'diarLinux',
      nativeImage.createFromPath(icon),
      [
        { etiqueta: t('Abrir diarLinux'), accion: mostrarVentana },
        { etiqueta: t('Nueva entrada'), accion: nuevaEntrada },
        { etiqueta: t('Bloquear'), accion: () => diario.abierto && diario.bloquear() },
        {},
        {
          etiqueta: t('Salir'),
          accion: () => {
            saliendo = true
            app.quit()
          }
        }
      ],
      alternarVentana,
      (e) => console.error('Bandeja:', e.message)
    )
    try {
      await nuevo.abrir()
      icono = nuevo
    } catch (e) {
      nuevo.cerrar()
      console.error('No se pudo mostrar el ícono en la bandeja:', (e as Error).message)
    }
  })
  return cola
}

/** ¿Hay ícono en la bandeja ahora? (para "cerrar a la bandeja": sin ícono no se puede volver) */
export function hayBandeja(): boolean {
  return !!icono?.registrado || bandejaDePrueba
}

/** ¿Hay que avisar? Lo revisa cada minuto. Con el diario abierto, no avisa si hoy ya hay entrada. */
export function revisarRecordatorio(ahora = new Date()): 'aviso' | 'ya-escribio' | null {
  const c = leerConfig()
  if (!c.recordatorio || !tocaRecordar(ahora, c.recordatorioHora, c.ultimoRecordatorio)) return null
  const hoy = diaLocal(ahora)
  guardarConfig({ ultimoRecordatorio: hoy })
  if (diario.abierto && diario.repo.delDia(hoy).length > 0) return 'ya-escribio'
  // Bloqueado no se puede saber si hoy hay entrada (está cifrado): se pregunta
  const cuerpo = diario.abierto
    ? t('Todavía no has escrito nada hoy. ¿Cómo estuvo tu día?')
    : t('¿Ya escribiste hoy en tu diario?')
  if (Notification.isSupported() && !prueba) {
    const n = new Notification({ title: 'diarLinux', body: cuerpo, icon })
    n.on('click', nuevaEntrada)
    n.show()
  }
  return 'aviso'
}

export function iniciarBandeja(v: () => BrowserWindow | null): void {
  ventana = v
  v()?.on('blur', () => (ultimoSinFoco = Date.now()))
  void actualizarBandeja()
  // al salir de la app, el ícono se va con ella (y por si acaso, se cierra su conexión)
  app.on('will-quit', () => icono?.cerrar())
  setTimeout(() => revisarRecordatorio(), 5000) // al abrir la app, por si ya pasó la hora
  setInterval(() => revisarRecordatorio(), 60_000)
}

// ── iniciar con el sistema ──

/** Con un diario de prueba (DIARLINUX_DATA) se escribe dentro de esa carpeta, nunca en la real. */
function archivoAutostart(): string {
  const base = process.env.DIARLINUX_DATA
    ? path.join(process.env.DIARLINUX_DATA, 'autostart')
    : path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'autostart')
  return path.join(base, 'diarlinux.desktop')
}

/** Cómo volver a abrir esta misma app: AppImage, instalada, o desde la carpeta del proyecto. */
function comando(): string {
  const q = (s: string): string => `"${s.replace(/(["`$\\])/g, '\\$1')}"`
  // Instalada: igual que en el menú (Wayland nativo si la sesión lo es; ver index.ts)
  if (process.env.APPIMAGE) return `${q(process.env.APPIMAGE)} --ozone-platform-hint=auto`
  if (app.isPackaged) return `${q(process.execPath)} --ozone-platform-hint=auto`
  return q(path.join(app.getAppPath(), 'iniciar.sh'))
}

export function aplicarAutostart(activado: boolean): void {
  const f = archivoAutostart()
  if (!activado) {
    fs.rmSync(f, { force: true })
    return
  }
  fs.mkdirSync(path.dirname(f), { recursive: true })
  fs.writeFileSync(
    f,
    [
      '[Desktop Entry]',
      'Type=Application',
      'Name=diarLinux',
      `Comment=${t('Diario personal cifrado')}`,
      // --bandeja: si la bandeja está activada, arranca escondido en ella
      `Exec=${comando()} --bandeja`,
      `Icon=${app.isPackaged ? 'diarlinux' : icon}`,
      'Terminal=false',
      'X-GNOME-Autostart-enabled=true',
      ''
    ].join('\n')
  )
}

/** Arrancó con --bandeja (al iniciar el sistema) y la bandeja está activada: no mostrar la ventana. */
export function arrancarEscondido(): boolean {
  const si = process.argv.includes('--bandeja') && leerConfig().bandeja
  // Red de seguridad: si a los 30 s el ícono no está en la bandeja (Plasma no la tiene, se apagó
  // la opción…), se muestra la ventana: nunca queda escondida sin forma de abrirla.
  if (si && !prueba)
    setTimeout(() => {
      const v = ventana()
      if (v && !v.isDestroyed() && !v.isVisible() && !hayBandeja()) mostrarVentana()
    }, 30_000)
  return si
}
