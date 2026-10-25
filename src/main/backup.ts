/**
 * Backups del diario: un .tar con los archivos YA cifrados (vault.json, diario.db, adjuntos).
 * No se vuelve a cifrar nada y el backup solo se abre con la contraseña del diario.
 *
 * - La copia "en vivo" de SQLite no funciona con bases cifradas: se hace wal_checkpoint y se
 *   copia el archivo en el mismo instante (una sola conexión sincrónica: nada escribe en el medio).
 * - Restaurar: se extrae a <carpeta>/.restaurar, se verifica que abra, se marca LISTO y recién
 *   entonces se intercambia con lo actual (lo actual pasa a .anterior). Si se corta en el medio,
 *   al arrancar se termina o se deshace (recuperarRestauracionCortada).
 * - Si el backup es de este mismo diario (misma llave) se conserva el vault.json actual: así un
 *   backup viejo se recupera aunque la contraseña haya cambiado después.
 */
import fs from 'node:fs'
import path from 'node:path'
import { subllave } from '../core/crypto/vault'
import * as V from '../core/crypto/vault'
import { wipe } from '../core/crypto/bytes'
import type { InfoBackup } from '../shared/tipos'
import { abrirDb, checkpoint } from './adapters/db'
import { guardarConfig, leerConfig } from './config'
import { BASE, VAULT, diario, ErrorDiario } from './diario'
import { sincronizarCarpeta } from './fsutil'

const NOMBRE_VALIDO =
  /^(vault\.json|diario\.db|attachments\/[0-9a-f-]{36}\.enc|thumbs\/[0-9a-f-]{36}-(128|512)\.enc)$/
const PREFIJO = 'diarlinux-backup-'
const RESTAURAR = '.restaurar'
const ANTERIOR = '.anterior'
const LISTO = 'LISTO'
const ITEMS = [VAULT, BASE, 'attachments', 'thumbs']

// ── tar mínimo (ustar), escrito y leído por partes para no cargar GB en memoria ──
function cabeceraTar(nombre: string, tamano: number, mtime: number): Buffer {
  const h = Buffer.alloc(512, 0)
  const campo = (txt: string, off: number, largo: number): void => {
    h.write(txt, off, Math.min(Buffer.byteLength(txt), largo), 'utf8')
  }
  const octal = (n: number, largo: number): string => n.toString(8).padStart(largo - 1, '0') + '\0'
  campo(nombre, 0, 100)
  campo(octal(0o600, 8), 100, 8)
  campo(octal(0, 8), 108, 8)
  campo(octal(0, 8), 116, 8)
  campo(octal(tamano, 12), 124, 12)
  campo(octal(Math.floor(mtime), 12), 136, 12)
  h.fill(' ', 148, 156)
  h[156] = '0'.charCodeAt(0)
  campo('ustar\0', 257, 6)
  campo('00', 263, 2)
  let suma = 0
  for (const b of h) suma += b
  campo(suma.toString(8).padStart(6, '0') + '\0 ', 148, 8)
  return h
}

function escribirTar(destino: string, archivos: { nombre: string; ruta: string }[]): void {
  const tmp = destino + '.parcial'
  const fd = fs.openSync(tmp, 'w', 0o600)
  try {
    const buf = Buffer.alloc(1024 * 1024)
    for (const a of archivos) {
      const st = fs.statSync(a.ruta)
      fs.writeSync(fd, cabeceraTar(a.nombre, st.size, st.mtimeMs / 1000))
      const fin = fs.openSync(a.ruta, 'r')
      try {
        let leido = 0
        while (leido < st.size) {
          const n = fs.readSync(fin, buf, 0, Math.min(buf.length, st.size - leido), leido)
          if (n <= 0) throw new Error('Lectura incompleta')
          fs.writeSync(fd, buf, 0, n)
          leido += n
        }
      } finally {
        fs.closeSync(fin)
      }
      const relleno = (512 - (st.size % 512)) % 512
      if (relleno) fs.writeSync(fd, Buffer.alloc(relleno))
    }
    fs.writeSync(fd, Buffer.alloc(1024)) // fin del tar
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
  fs.renameSync(tmp, destino)
  sincronizarCarpeta(path.dirname(destino))
}

/** Extrae solo nombres esperados (nada de rutas raras) a `dir`. */
function extraerTar(origen: string, dir: string): string[] {
  const fd = fs.openSync(origen, 'r')
  const nombres: string[] = []
  try {
    const total = fs.fstatSync(fd).size
    const h = Buffer.alloc(512)
    const buf = Buffer.alloc(1024 * 1024)
    let pos = 0
    while (pos + 512 <= total) {
      fs.readSync(fd, h, 0, 512, pos)
      if (h.every((b) => b === 0)) break
      const nombre = h.subarray(0, 100).toString('utf8').replace(/\0.*$/s, '')
      const tamano = parseInt(h.subarray(124, 136).toString('utf8').replace(/\0.*$/s, '').trim(), 8)
      const tipo = String.fromCharCode(h[156])
      if (
        !NOMBRE_VALIDO.test(nombre) ||
        (tipo !== '0' && tipo !== '\0') ||
        !Number.isFinite(tamano)
      )
        throw new ErrorDiario('Ese archivo no es un backup de diarLinux')
      pos += 512
      if (pos + tamano > total) throw new ErrorDiario('El backup está incompleto')
      const destino = path.join(dir, nombre)
      fs.mkdirSync(path.dirname(destino), { recursive: true, mode: 0o700 })
      const fo = fs.openSync(destino, 'w', 0o600)
      try {
        let hecho = 0
        while (hecho < tamano) {
          const n = fs.readSync(fd, buf, 0, Math.min(buf.length, tamano - hecho), pos + hecho)
          if (n <= 0) throw new ErrorDiario('El backup está incompleto')
          fs.writeSync(fo, buf, 0, n)
          hecho += n
        }
        fs.fsyncSync(fo)
      } finally {
        fs.closeSync(fo)
      }
      nombres.push(nombre)
      pos += tamano + ((512 - (tamano % 512)) % 512)
    }
  } finally {
    fs.closeSync(fd)
  }
  if (!nombres.includes(VAULT) || !nombres.includes(BASE))
    throw new ErrorDiario('Ese archivo no es un backup de diarLinux')
  return nombres
}

// ── crear / listar ──
function sello(d = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`
}

function archivosDelDiario(carpeta: string): { nombre: string; ruta: string }[] {
  const lista = [VAULT, BASE].map((n) => ({ nombre: n, ruta: path.join(carpeta, n) }))
  for (const sub of ['attachments', 'thumbs']) {
    const d = path.join(carpeta, sub)
    if (!fs.existsSync(d)) continue
    for (const n of fs.readdirSync(d).sort())
      if (NOMBRE_VALIDO.test(`${sub}/${n}`))
        lista.push({ nombre: `${sub}/${n}`, ruta: path.join(d, n) })
  }
  return lista
}

export function crearBackup(): InfoBackup {
  const cfg = leerConfig()
  checkpoint(diario.base) // todo escrito en diario.db; better-sqlite3 es sincrónico: nada escribe hasta terminar
  fs.mkdirSync(cfg.backupCarpeta, { recursive: true, mode: 0o700 })
  const destino = path.join(cfg.backupCarpeta, `${PREFIJO}${sello()}.tar`)
  escribirTar(destino, archivosDelDiario(cfg.carpeta))
  guardarConfig({ ultimoBackup: new Date().toISOString() })
  podar()
  const st = fs.statSync(destino)
  return { archivo: destino, fecha: st.mtime.toISOString(), tamano: st.size }
}

export function listarBackups(): InfoBackup[] {
  const dir = leerConfig().backupCarpeta
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((n) => n.startsWith(PREFIJO) && n.endsWith('.tar'))
    .map((n) => {
      const st = fs.statSync(path.join(dir, n))
      return { archivo: path.join(dir, n), fecha: st.mtime.toISOString(), tamano: st.size }
    })
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
}

/** Conserva los últimos N backups automáticos/manuales de la carpeta. */
function podar(): void {
  const n = Math.max(1, leerConfig().backupConservar)
  for (const b of listarBackups().slice(n)) fs.rmSync(b.archivo, { force: true })
}

/** Backup automático si el último tiene más de `backupCadaHoras`. */
export function backupSiToca(): void {
  const cfg = leerConfig()
  if (!diario.abierto || cfg.backupCadaHoras <= 0) return
  const ultimo = cfg.ultimoBackup ? Date.parse(cfg.ultimoBackup) : 0
  if (Date.now() - ultimo < cfg.backupCadaHoras * 3600_000) return
  try {
    crearBackup()
  } catch (e) {
    console.error('[backup] no se pudo crear el backup automático:', (e as Error).name)
  }
}

// ── restaurar ──
export type ResultadoRestaurar = { ok: true } | { necesitaContrasena: true }

/**
 * Restaura `archivo`. Si el diario está abierto y el backup es del mismo diario, no hace falta
 * contraseña (se conserva la actual). Si no, se pide la contraseña que tenía el backup.
 */
export async function restaurarBackup(
  archivo: string,
  contrasena?: string
): Promise<ResultadoRestaurar> {
  const carpeta = leerConfig().carpeta
  fs.mkdirSync(carpeta, { recursive: true, mode: 0o700 })
  const tmp = path.join(carpeta, RESTAURAR)
  fs.rmSync(tmp, { recursive: true, force: true })
  fs.mkdirSync(tmp, { mode: 0o700 })
  try {
    extraerTar(archivo, tmp)
    let dek: Uint8Array | null = null
    let conservarVault = false
    // ¿Mismo diario? Probar la llave actual con la base del backup
    if (diario.abierto) {
      const llave = await subllave(diario.dekActual, 'db')
      try {
        abrirDb(path.join(tmp, BASE), llave).close()
        dek = diario.dekActual.slice()
        conservarVault = true
      } catch {
        /* es de otro diario (u otra llave): hace falta su contraseña */
      } finally {
        wipe(llave)
      }
    }
    if (!dek) {
      if (!contrasena) {
        fs.rmSync(tmp, { recursive: true, force: true })
        return { necesitaContrasena: true }
      }
      const vault = V.validarVault(JSON.parse(fs.readFileSync(path.join(tmp, VAULT), 'utf8')))
      dek = await V.abrirConContrasena(vault, contrasena)
      const llave = await subllave(dek, 'db')
      try {
        abrirDb(path.join(tmp, BASE), llave).close() // verifica que la base del backup abre
      } finally {
        wipe(llave)
      }
    }
    if (conservarVault) fs.copyFileSync(path.join(carpeta, VAULT), path.join(tmp, VAULT))
    for (const n of ['-wal', '-shm']) fs.rmSync(path.join(tmp, BASE + n), { force: true })
    fs.writeFileSync(path.join(tmp, LISTO), '')
    sincronizarCarpeta(tmp)

    diario.bloquear()
    intercambiar(carpeta)
    await diario.abrirCon(dek)
    return { ok: true }
  } catch (e) {
    fs.rmSync(tmp, { recursive: true, force: true })
    throw e
  }
}

function intercambiar(carpeta: string): void {
  const ant = path.join(carpeta, ANTERIOR)
  fs.rmSync(ant, { recursive: true, force: true })
  fs.mkdirSync(ant, { mode: 0o700 })
  for (const n of [...ITEMS, BASE + '-wal', BASE + '-shm'])
    if (fs.existsSync(path.join(carpeta, n)))
      fs.renameSync(path.join(carpeta, n), path.join(ant, n))
  sincronizarCarpeta(carpeta)
  terminarIntercambio(carpeta)
}

function terminarIntercambio(carpeta: string): void {
  const tmp = path.join(carpeta, RESTAURAR)
  for (const n of ITEMS)
    if (fs.existsSync(path.join(tmp, n)) && !fs.existsSync(path.join(carpeta, n)))
      fs.renameSync(path.join(tmp, n), path.join(carpeta, n))
  sincronizarCarpeta(carpeta)
  fs.rmSync(path.join(carpeta, ANTERIOR), { recursive: true, force: true })
  fs.rmSync(tmp, { recursive: true, force: true })
}

/** Al arrancar: si una restauración se cortó, se termina (si estaba LISTO) o se deshace. */
export function recuperarRestauracionCortada(): void {
  const carpeta = leerConfig().carpeta
  const tmp = path.join(carpeta, RESTAURAR)
  const ant = path.join(carpeta, ANTERIOR)
  if (fs.existsSync(ant)) {
    if (fs.existsSync(path.join(tmp, LISTO))) terminarIntercambio(carpeta)
    else {
      for (const n of fs.readdirSync(ant))
        if (!fs.existsSync(path.join(carpeta, n)))
          fs.renameSync(path.join(ant, n), path.join(carpeta, n))
      fs.rmSync(ant, { recursive: true, force: true })
    }
  }
  fs.rmSync(tmp, { recursive: true, force: true })
}
