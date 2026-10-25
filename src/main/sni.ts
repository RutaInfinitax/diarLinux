/**
 * Ícono de la bandeja de KDE hablando D-Bus directo (StatusNotifierItem + menú DBusMenu), con una
 * conexión PROPIA para cada ícono.
 *
 * Por qué no el Tray de Electron: en Linux registra el ícono en la conexión D-Bus compartida de
 * Chromium y al destruirlo no le avisa a KDE, así que el ícono queda en la bandeja hasta cerrar
 * la app; si se crea otro, choca con el primero ("already exported") y aparecen dos. Acá, apagar = cerrar la conexión: KDE lo quita en el acto. Si Plasma se reinicia,
 * el ícono se vuelve a registrar solo.
 */
import dbus from 'dbus-next'
import type { NativeImage } from 'electron'

const { Interface } = dbus.interface
const ACCESO = dbus.interface.ACCESS_READ
const V = dbus.Variant

export interface ItemMenu {
  etiqueta?: string // sin etiqueta = separador
  accion?: () => void
}

/** ARGB32 en orden de red, como pide StatusNotifierItem (toBitmap de Electron da BGRA). */
function pixmaps(img: NativeImage): [number, number, Buffer][] {
  return [22, 32, 48, 64].map((t) => {
    const b = img.resize({ width: t, height: t, quality: 'best' }).toBitmap()
    const out = Buffer.alloc(b.length)
    for (let i = 0; i < b.length; i += 4) {
      out[i] = b[i + 3] // A
      out[i + 1] = b[i + 2] // R
      out[i + 2] = b[i + 1] // G
      out[i + 3] = b[i] // B
    }
    return [t, t, out]
  })
}

class Item extends Interface {
  constructor(
    private titulo: string,
    private iconos: [number, number, Buffer][],
    private alActivar: () => void
  ) {
    super('org.kde.StatusNotifierItem')
  }
  get Category(): string {
    return 'ApplicationStatus'
  }
  get Id(): string {
    return 'diarlinux'
  }
  get Title(): string {
    return this.titulo
  }
  get Status(): string {
    return 'Active'
  }
  get WindowId(): number {
    return 0
  }
  get IconName(): string {
    return ''
  }
  get IconThemePath(): string {
    return ''
  }
  get IconPixmap(): [number, number, Buffer][] {
    return this.iconos
  }
  get OverlayIconName(): string {
    return ''
  }
  get OverlayIconPixmap(): [number, number, Buffer][] {
    return []
  }
  get AttentionIconName(): string {
    return ''
  }
  get AttentionIconPixmap(): [number, number, Buffer][] {
    return []
  }
  get AttentionMovieName(): string {
    return ''
  }
  get ToolTip(): [string, [number, number, Buffer][], string, string] {
    return ['', [], this.titulo, '']
  }
  get ItemIsMenu(): boolean {
    return false
  }
  get Menu(): string {
    return '/MenuBar'
  }
  Activate(): void {
    this.alActivar()
  }
  SecondaryActivate(): void {
    this.alActivar()
  }
  ContextMenu(): void {
    /* el menú lo muestra KDE con DBusMenu */
  }
  Scroll(): void {
    /* nada */
  }
}
Item.configureMembers({
  properties: {
    Category: { signature: 's', access: ACCESO },
    Id: { signature: 's', access: ACCESO },
    Title: { signature: 's', access: ACCESO },
    Status: { signature: 's', access: ACCESO },
    WindowId: { signature: 'i', access: ACCESO },
    IconName: { signature: 's', access: ACCESO },
    IconThemePath: { signature: 's', access: ACCESO },
    IconPixmap: { signature: 'a(iiay)', access: ACCESO },
    OverlayIconName: { signature: 's', access: ACCESO },
    OverlayIconPixmap: { signature: 'a(iiay)', access: ACCESO },
    AttentionIconName: { signature: 's', access: ACCESO },
    AttentionIconPixmap: { signature: 'a(iiay)', access: ACCESO },
    AttentionMovieName: { signature: 's', access: ACCESO },
    ToolTip: { signature: '(sa(iiay)ss)', access: ACCESO },
    ItemIsMenu: { signature: 'b', access: ACCESO },
    Menu: { signature: 'o', access: ACCESO }
  },
  methods: {
    Activate: { inSignature: 'ii', outSignature: '' },
    SecondaryActivate: { inSignature: 'ii', outSignature: '' },
    ContextMenu: { inSignature: 'ii', outSignature: '' },
    Scroll: { inSignature: 'is', outSignature: '' }
  },
  signals: {
    NewIcon: { signature: '' },
    NewTitle: { signature: '' },
    NewStatus: { signature: 's' },
    NewToolTip: { signature: '' }
  }
})

type Fila = [number, Record<string, InstanceType<typeof V>>, InstanceType<typeof V>[]]

class Menu extends Interface {
  private revision = 1
  constructor(private items: ItemMenu[]) {
    super('com.canonical.dbusmenu')
  }
  private propiedades(id: number): Record<string, InstanceType<typeof V>> {
    if (id === 0) return { 'children-display': new V('s', 'submenu') }
    const it = this.items[id - 1]
    if (!it) return {}
    return it.etiqueta
      ? { label: new V('s', it.etiqueta), enabled: new V('b', true), visible: new V('b', true) }
      : { type: new V('s', 'separator'), visible: new V('b', true) }
  }
  private fila(id: number): Fila {
    const hijos =
      id === 0
        ? this.items.map((_, i) => new V('(ia{sv}av)', [i + 1, this.propiedades(i + 1), []]))
        : []
    return [id, this.propiedades(id), hijos]
  }
  get Version(): number {
    return 3
  }
  get TextDirection(): string {
    return 'ltr'
  }
  get Status(): string {
    return 'normal'
  }
  get IconThemePath(): string[] {
    return []
  }
  GetLayout(parentId: number): [number, Fila] {
    return [this.revision, this.fila(parentId)]
  }
  GetGroupProperties(ids: number[]): [number, Record<string, InstanceType<typeof V>>][] {
    const lista = ids.length ? ids : this.items.map((_, i) => i + 1)
    return lista.map((id) => [id, this.propiedades(id)])
  }
  GetProperty(id: number, nombre: string): InstanceType<typeof V> {
    return this.propiedades(id)[nombre] ?? new V('s', '')
  }
  Event(id: number, evento: string): void {
    if (evento === 'clicked') setTimeout(() => this.items[id - 1]?.accion?.(), 0)
  }
  EventGroup(eventos: [number, string, unknown, number][]): number[] {
    for (const [id, ev] of eventos) this.Event(id, ev)
    return []
  }
  AboutToShow(): boolean {
    return false
  }
  AboutToShowGroup(): [number[], number[]] {
    return [[], []]
  }
}
Menu.configureMembers({
  properties: {
    Version: { signature: 'u', access: ACCESO },
    TextDirection: { signature: 's', access: ACCESO },
    Status: { signature: 's', access: ACCESO },
    IconThemePath: { signature: 'as', access: ACCESO }
  },
  methods: {
    GetLayout: { inSignature: 'iias', outSignature: 'u(ia{sv}av)' },
    GetGroupProperties: { inSignature: 'aias', outSignature: 'a(ia{sv})' },
    GetProperty: { inSignature: 'is', outSignature: 'v' },
    Event: { inSignature: 'isvu', outSignature: '' },
    EventGroup: { inSignature: 'a(isvu)', outSignature: 'ai' },
    AboutToShow: { inSignature: 'i', outSignature: 'b' },
    AboutToShowGroup: { inSignature: 'ai', outSignature: 'aiai' }
  },
  signals: {
    LayoutUpdated: { signature: 'ui' },
    ItemsPropertiesUpdated: { signature: 'a(ia{sv})a(ias)' }
  }
})

let contador = 0

/** Un ícono en la bandeja. `cerrar()` lo quita de verdad (cierra su conexión D-Bus). */
export class IconoBandeja {
  private bus: ReturnType<typeof dbus.sessionBus> | null = null
  private nombre = `org.kde.StatusNotifierItem-${process.pid}-${++contador}`
  /** KDE ya lo muestra (al iniciar sesión la bandeja puede aparecer después que la app). */
  registrado = false

  constructor(
    private titulo: string,
    private imagen: NativeImage,
    private items: ItemMenu[],
    private alActivar: () => void,
    private alError: (e: Error) => void = () => {}
  ) {}

  async abrir(): Promise<void> {
    const bus = dbus.sessionBus()
    this.bus = bus
    bus.on('error', (e: Error) => this.alError(e))
    await bus.requestName(this.nombre, 0)
    bus.export('/StatusNotifierItem', new Item(this.titulo, pixmaps(this.imagen), this.alActivar))
    bus.export('/MenuBar', new Menu(this.items))
    // Cuando la bandeja de Plasma aparece (al iniciar sesión, o si Plasma se reinicia): registrarse
    const dbusObj = await bus.getProxyObject('org.freedesktop.DBus', '/org/freedesktop/DBus')
    dbusObj
      .getInterface('org.freedesktop.DBus')
      .on('NameOwnerChanged', (nombre: string, _viejo: string, nuevo: string) => {
        if (nombre !== 'org.kde.StatusNotifierWatcher' || this.bus !== bus) return
        this.registrado = false
        if (nuevo) void this.registrar().catch(this.alError)
      })
    try {
      await this.registrar()
    } catch {
      /* todavía no hay bandeja: se registra cuando aparezca */
    }
  }

  private async registrar(): Promise<void> {
    if (!this.bus) return
    const w = await this.bus.getProxyObject(
      'org.kde.StatusNotifierWatcher',
      '/StatusNotifierWatcher'
    )
    await w.getInterface('org.kde.StatusNotifierWatcher').RegisterStatusNotifierItem(this.nombre)
    this.registrado = true
  }

  cerrar(): void {
    const b = this.bus
    this.bus = null
    this.registrado = false
    try {
      b?.disconnect()
    } catch {
      /* ya estaba cerrada */
    }
  }
}
