/** Nombres de archivo (compartido entre main y la ventana, sin dependencias). */

const EXT_DE: Record<string, string[]> = {
  'image/jpeg': ['jpg', 'jpeg', 'jfif'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/gif': ['gif'],
  'image/avif': ['avif'],
  'image/bmp': ['bmp'],
  'image/heic': ['heic'],
  'image/heif': ['heif']
}

/**
 * Si la extensión no corresponde al tipo real (una foto PNG que se guardó comprimida en JPEG),
 * la cambia: «foto.png» + image/jpeg → «foto.jpg». Tipos desconocidos: el nombre queda igual.
 */
export function nombreConExtension(nombre: string, mime: string): string {
  const exts = EXT_DE[mime.toLowerCase()]
  if (!exts) return nombre
  const m = nombre.match(/^(.*)\.([A-Za-z0-9]{1,5})$/)
  if (m && exts.includes(m[2].toLowerCase())) return nombre
  return `${m ? m[1] : nombre}.${exts[0]}`
}
