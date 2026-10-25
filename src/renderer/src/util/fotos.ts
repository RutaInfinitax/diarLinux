/**
 * Fotos procesadas con el motor de imágenes de Chromium (sin librerías nativas: sharp choca con
 * Electron en Linux). createImageBitmap aplica la rotación EXIF; volver a codificar borra los
 * metadatos (incluido el GPS). Todo en memoria: el resultado va cifrado al proceso main.
 */
import type { Ajustes, FotoNueva } from '../../../shared/tipos'
import { nombreConExtension } from '../../../shared/archivos'

const ACEPTADAS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
export const esImagen = (f: File): boolean => ACEPTADAS.includes(f.type)

async function escalar(
  bmp: ImageBitmap,
  max: number,
  tipo: 'image/jpeg' | 'image/webp',
  calidad: number
): Promise<{ datos: Uint8Array; ancho: number; alto: number }> {
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const ancho = Math.max(1, Math.round(bmp.width * k))
  const alto = Math.max(1, Math.round(bmp.height * k))
  const lienzo = new OffscreenCanvas(ancho, alto)
  const ctx = lienzo.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  if (tipo === 'image/jpeg') {
    ctx.fillStyle = '#ffffff' // JPEG no tiene transparencia (PNG con fondo transparente)
    ctx.fillRect(0, 0, ancho, alto)
  }
  ctx.drawImage(bmp, 0, 0, ancho, alto)
  const blob = await lienzo.convertToBlob({ type: tipo, quality: calidad })
  return { datos: new Uint8Array(await blob.arrayBuffer()), ancho, alto }
}

export async function procesarFoto(
  archivo: File,
  compresion: Ajustes['compresion']
): Promise<FotoNueva> {
  if (!esImagen(archivo))
    throw new Error(`«${archivo.name}» no es una imagen compatible (JPG, PNG, WebP, GIF o AVIF)`)
  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(archivo, { imageOrientation: 'from-image' })
  } catch {
    throw new Error(`No se pudo leer la imagen «${archivo.name}»`)
  }
  try {
    let original: Uint8Array
    let mime = archivo.type
    let ancho = bmp.width
    let alto = bmp.height
    if (compresion === 'original' || archivo.type === 'image/gif') {
      original = new Uint8Array(await archivo.arrayBuffer()) // tal cual (un GIF animado sigue animado)
    } else {
      const r = await escalar(
        bmp,
        compresion === 'alta' ? 1600 : 2560,
        'image/jpeg',
        compresion === 'alta' ? 0.75 : 0.86
      )
      original = r.datos
      mime = 'image/jpeg'
      ancho = r.ancho
      alto = r.alto
    }
    const m512 = await escalar(bmp, 512, 'image/webp', 0.8)
    // la "chica" del calendario se genera a 256 px para que se vea nítida con el zoom
    const m128 = await escalar(bmp, 256, 'image/webp', 0.78)
    return {
      nombre: nombreConExtension(archivo.name, mime),
      mime,
      original,
      mini512: m512.datos,
      mini128: m128.datos,
      ancho,
      alto
    }
  } finally {
    bmp.close()
  }
}

export const urlMini = (id: string, tam: 128 | 512 = 512): string => `diario://mini/${id}/${tam}`
export const urlAdjunto = (id: string): string => `diario://adjunto/${id}`
