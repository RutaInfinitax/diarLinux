/** Videos y audios: miniatura de un fotograma y duración, con el reproductor de Chromium (sin librerías). */

async function aWebp(
  fuente: CanvasImageSource,
  w: number,
  h: number,
  max: number,
  calidad: number
): Promise<Uint8Array> {
  const k = Math.min(1, max / Math.max(w, h))
  const lienzo = new OffscreenCanvas(Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k)))
  const ctx = lienzo.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(fuente, 0, 0, lienzo.width, lienzo.height)
  return new Uint8Array(
    await (await lienzo.convertToBlob({ type: 'image/webp', quality: calidad })).arrayBuffer()
  )
}

export interface DatosVideo {
  mini512?: Uint8Array
  mini128?: Uint8Array
  ancho?: number
  alto?: number
  duracion?: number
}

/** Fotograma a ~1 s (o al 10 % si es corto). Si el formato no se puede leer, sin miniatura. */
export async function datosDeVideo(archivo: File): Promise<DatosVideo> {
  const url = URL.createObjectURL(archivo)
  const v = document.createElement('video')
  v.muted = true
  v.preload = 'auto'
  v.src = url
  try {
    await new Promise<void>((ok, mal) => {
      v.onloadedmetadata = () => ok()
      v.onerror = () => mal(new Error('formato'))
      setTimeout(() => mal(new Error('tiempo')), 15000)
    })
    const duracion = Number.isFinite(v.duration) ? v.duration : undefined
    v.currentTime = Math.min(1, (duracion ?? 0) * 0.1)
    await new Promise<void>((ok, mal) => {
      v.onseeked = () => ok()
      setTimeout(() => mal(new Error('tiempo')), 15000)
    })
    const w = v.videoWidth
    const h = v.videoHeight
    if (!w || !h) return { duracion }
    return {
      mini512: await aWebp(v, w, h, 512, 0.8),
      mini128: await aWebp(v, w, h, 256, 0.78),
      ancho: w,
      alto: h,
      duracion
    }
  } catch {
    return {} // se guarda igual, sin miniatura (formato que Chromium no reproduce)
  } finally {
    v.removeAttribute('src')
    v.load()
    URL.revokeObjectURL(url)
  }
}

export async function duracionDeAudio(archivo: File): Promise<number | undefined> {
  const url = URL.createObjectURL(archivo)
  const a = new Audio()
  a.src = url
  try {
    return await new Promise<number | undefined>((ok) => {
      a.onloadedmetadata = () => ok(Number.isFinite(a.duration) ? a.duration : undefined)
      a.onerror = () => ok(undefined)
      setTimeout(() => ok(undefined), 8000)
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function tiempo(seg?: number | null): string {
  if (!seg || !Number.isFinite(seg)) return ''
  const s = Math.round(seg)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function tamanoLegible(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`
  if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`
  return `${(b / 1073741824).toFixed(2)} GB`
}
