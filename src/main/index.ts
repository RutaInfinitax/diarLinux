/**
 * diarLinux — proceso main.
 * Seguridad: contextIsolation + sandbox + sin nodeIntegration, CSP estricta, sin ventanas nuevas
 * ni navegación externa, sin permisos (micrófono se habilita en la Fase 2), interfaz servida
 * desde app:// (no file://). Todo el disco, la base y el cifrado viven aquí.
 */
import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, session, shell } from 'electron'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { borrarTemporales, limpiarHuerfanos, responderProtocolo, vaciarCache } from './adjuntos'
import { backupSiToca, recuperarRestauracionCortada } from './backup'
import { iniciarBloqueoAutomatico } from './bloqueo'
import { diario } from './diario'
import { registrarIpc, usarVentana, ZOOM_MAX, ZOOM_MIN } from './ipc'
import { guardarConfig, leerConfig } from './config'
import { consultaApariencia, fondoApariencia } from './apariencia'
import { sembrarSiHaceFalta } from './seed'
import { aplicarIdioma } from './idioma'
import { registrarEventosVentana, registrarFoco, vigilarFoco } from './foco'
import { abrirMaximizada, medidasIniciales, recordarVentana } from './ventana'
import { t } from '../shared/i18n'
import {
  arrancarEscondido,
  cancelarSalida,
  cerrarEsconde,
  iniciarBandeja,
  marcarSaliendo,
  mostrarVentana
} from './bandeja'

// Plataforma: Wayland nativo si la sesión es Wayland (--ozone-platform-hint=auto). Con XWayland el
// teclado se quedaba sin foco tras los diálogos; el parpadeo que tenía Wayland al principio ya no
// aparece. SOLO se puede elegir al lanzar Electron (appendSwitch acá llega tarde, verificado): lo pasan
// iniciar.sh, npm run dev, el .desktop del paquete y el autostart. `iniciar.sh --x11` fuerza X11.
app.setName('diarLinux')
// Diario de prueba (pruebas automáticas o uno aparte): perfil propio, para que lo que la ventana
// recuerda (ancho del texto, opciones de exportar…) no se mezcle con la app de verdad.
if (process.env.DIARLINUX_DATA)
  app.setPath('userData', path.resolve(process.env.DIARLINUX_DATA) + '.perfil') // al lado, no adentro

// Una sola instancia: abrirla otra vez (menú, autostart) muestra la que ya está (p. ej. en la bandeja).
// En las pruebas y con un diario de prueba (DIARLINUX_DATA) no, para no chocar con la app real.
const unaSola = process.env.DIARLINUX_OCULTA !== '1' && !process.env.DIARLINUX_DATA
if (unaSola && !app.requestSingleInstanceLock()) app.exit(0)
app.on('second-instance', () => mostrarVentana())

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  // Adjuntos descifrados en memoria (fotos, audio, video): diario://adjunto/<id>, diario://mini/<id>/<tam>
  {
    scheme: t('diario'),
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
])

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: diario:",
  "media-src 'self' blob: diario:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'"
].join('; ')

const RENDERER = path.join(__dirname, '../renderer')

/** app://diario/<ruta> → archivo de out/renderer (sin salirse de esa carpeta). */
function registrarProtocoloApp(): void {
  protocol.handle('app', async (req) => {
    const url = new URL(req.url)
    const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)
    const destino = path.normalize(path.join(RENDERER, rel))
    if (!destino.startsWith(RENDERER + path.sep))
      return new Response('No encontrado', { status: 404 })
    const r = await net.fetch(pathToFileURL(destino).toString())
    const h = new Headers(r.headers)
    h.set('Content-Security-Policy', CSP)
    h.set('X-Content-Type-Options', 'nosniff')
    return new Response(r.body, { status: r.status, headers: h })
  })
}

let ventana: BrowserWindow | null = null

function crearVentana(): void {
  ventana = new BrowserWindow({
    ...medidasIniciales(),
    minWidth: 640,
    minHeight: 460,
    show: false,
    title: 'diarLinux',
    backgroundColor: fondoApariencia(),
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
      // Pruebas automáticas: se dibuja fuera de pantalla (no aparece ninguna ventana)
      offscreen: process.env.DIARLINUX_OCULTA === '1'
    }
  })
  usarVentana(ventana)
  if (process.env.DIARLINUX_OCULTA !== '1') recordarVentana(ventana)
  registrarEventosVentana(ventana)

  // Al cerrar la ventana: primero que la página guarde lo que se estaba escribiendo (autoguardado
  // pendiente) y recién después cerrar. Si no contesta en 3 s, se cierra igual.
  let listoParaCerrar = false
  let preguntando = false
  ventana.on('close', (ev) => {
    if (cerrarEsconde()) {
      // a la bandeja: la ventana sigue viva (el autoguardado y el bloqueo automático siguen igual)
      ev.preventDefault()
      ventana?.hide()
      return
    }
    if (listoParaCerrar || !diario.abierto) return
    ev.preventDefault()
    if (preguntando) return
    preguntando = true
    const cerrar = (): void => {
      listoParaCerrar = true
      ventana?.close()
    }
    const guardarYCerrar = (): void => {
      const t = setTimeout(cerrar, 3000)
      ipcMain.once('app:guardado', () => {
        clearTimeout(t)
        cerrar()
      })
      ventana?.webContents.send('app:guardar')
    }
    // ¿Hay cambios sin guardar en la entrada? Si los hay, se pregunta (pedido del usuario: el
    // autoguardado es cada pocos minutos). Si la ventana no contesta, se guarda por las dudas.
    const alContestar = async (_e: unknown, hay: boolean): Promise<void> => {
      clearTimeout(sinRespuesta)
      if (!hay) return cerrar()
      const r =
        process.env.DIARLINUX_OCULTA === '1'
          ? process.env.DIARLINUX_AL_CERRAR === 'descartar'
            ? 1
            : 0
          : (
              await dialog.showMessageBox(ventana!, {
                type: 'question',
                title: 'diarLinux',
                message: t('¿Guardar los cambios de la entrada?'),
                detail: t('Hay cambios que todavía no se guardaron.'),
                buttons: [t('Guardar'), t('No guardar'), t('Cancelar')],
                defaultId: 0,
                cancelId: 2,
                noLink: true
              })
            ).response
      if (r === 2) {
        preguntando = false
        cancelarSalida() // sigue abierta (y "cerrar a la bandeja" vuelve a funcionar)
        return
      }
      if (r === 1) return cerrar()
      guardarYCerrar()
    }
    const sinRespuesta = setTimeout(() => {
      ipcMain.removeListener('app:pendiente', alContestar)
      guardarYCerrar()
    }, 2000)
    ipcMain.once('app:pendiente', alContestar)
    ventana?.webContents.send('app:hayPendiente')
  })
  // DIARLINUX_OCULTA=1: pruebas automáticas (Playwright) sin mostrar la ventana en pantalla
  ventana.on('closed', () => (ventana = null))

  // Tamaño de toda la interfaz: el guardado en Configuración, y Ctrl + / Ctrl − / Ctrl 0
  ventana.webContents.on('did-finish-load', () =>
    ventana?.webContents.setZoomFactor(leerConfig().zoom)
  )
  ventana.webContents.on('before-input-event', (ev, input) => {
    if (input.type !== 'keyDown' || !input.control || input.alt) return
    const actual = leerConfig().zoom
    let nuevo: number | null = null
    if (input.key === '+' || input.key === '=') nuevo = actual + 0.1
    else if (input.key === '-') nuevo = actual - 0.1
    else if (input.key === '0') nuevo = 1.25
    if (nuevo === null) return
    ev.preventDefault()
    nuevo = Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, nuevo)) * 100) / 100
    guardarConfig({ zoom: nuevo })
    ventana?.webContents.setZoomFactor(nuevo)
  })
  ventana.on('ready-to-show', () => {
    if (process.env.DIARLINUX_OCULTA === '1' || arrancarEscondido()) return
    if (abrirMaximizada()) ventana?.maximize() // como se cerró
    ventana?.show()
  })

  // Nada de ventanas nuevas ni de navegar fuera de la app; los enlaces http(s) van al navegador
  ventana.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  ventana.webContents.on('will-navigate', (ev, url) => {
    const propio =
      url.startsWith('app://') ||
      (is.dev && url.startsWith(process.env['ELECTRON_RENDERER_URL'] ?? '\0'))
    if (!propio) ev.preventDefault()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL'])
    void ventana.loadURL(process.env['ELECTRON_RENDERER_URL'] + consultaApariencia())
  else void ventana.loadURL('app://diario/index.html' + consultaApariencia())
}

app.whenReady().then(async () => {
  aplicarIdioma()
  Menu.setApplicationMenu(null)
  // Ningún permiso, salvo el MICRÓFONO (solo audio, sin cámara) para grabar audios desde la ventana del diario
  const esMicrofono = (perm: string, tipos?: string[]): boolean =>
    perm === 'media' && !!tipos?.length && tipos.every((t) => t === 'audio')
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb, detalles) =>
    cb(
      wc === ventana?.webContents &&
        esMicrofono(perm, (detalles as { mediaTypes?: string[] }).mediaTypes)
    )
  )
  session.defaultSession.setPermissionCheckHandler(
    (wc, perm, _origen, detalles) =>
      wc === ventana?.webContents &&
      perm === 'media' &&
      (detalles as { mediaType?: string }).mediaType !== 'video'
  )
  borrarTemporales() // archivos abiertos de una sesión anterior (si se cortó)
  if (!is.dev) {
    session.defaultSession.webRequest.onHeadersReceived((d, cb) =>
      cb({ responseHeaders: { ...d.responseHeaders, 'Content-Security-Policy': [CSP] } })
    )
  }

  recuperarRestauracionCortada()
  registrarProtocoloApp()
  protocol.handle(t('diario'), responderProtocolo)
  registrarIpc()
  iniciarBloqueoAutomatico()
  await sembrarSiHaceFalta()

  // Backups automáticos: al abrir el diario y luego cada hora se revisa si toca
  diario.oyentesApertura.add(() => setTimeout(backupSiToca, 3000))
  setInterval(backupSiToca, 3600_000).unref()
  diario.oyentesBloqueo.add(() => {
    vaciarCache() // nada descifrado queda en memoria
    borrarTemporales() // ni archivos abiertos con otro programa
    ventana?.webContents.send('vault:bloqueado')
  })
  diario.oyentesApertura.add(() => {
    try {
      limpiarHuerfanos()
    } catch {
      /* no es grave */
    }
  })

  crearVentana()
  iniciarBandeja(() => ventana)
  // XWayland a veces deja la ventana sin teclado: ver foco.ts
  vigilarFoco(() => ventana)
  diario.oyentesBloqueo.add(() => registrarFoco('diario bloqueado'))
  diario.oyentesApertura.add(() => registrarFoco('diario abierto'))
})

// Salir: primero se cierra la ventana (que guarda lo pendiente) y después se bloquea el diario
app.on('before-quit', (ev) => {
  marcarSaliendo() // cerrar la ventana ya no la esconde en la bandeja
  if (ventana && !ventana.isDestroyed()) {
    ev.preventDefault()
    ventana.close()
    return
  }
  diario.bloquear()
  borrarTemporales()
})
app.on('window-all-closed', () => app.quit())
