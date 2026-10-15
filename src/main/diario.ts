/**
 * El diario abierto: vault.json + base cifrada + llaves en memoria.
 *
 * <carpeta>/vault.json   DEK envuelta con la contraseña y con el código de recuperación
 * <carpeta>/diario.db    SQLCipher (subllave "db")
 * <carpeta>/attachments, thumbs   archivos .enc (subllave "archivos", Fase 2)
 *
 * La DEK vive solo en este proceso mientras está abierto; al bloquear se sobrescribe con ceros.
 */
import fs from 'node:fs'
import path from 'node:path'
import { setTimeout as esperar } from 'node:timers/promises'
import { wipe } from '../core/crypto/bytes'
import { importarLlave } from '../core/crypto/encfile'
import * as V from '../core/crypto/vault'
import type { EstadoDiario } from '../shared/tipos'
import { abrirDb, checkpoint, type DB } from './adapters/db'
import { Repo } from './adapters/repo'
import { leerConfig } from './config'
import { escribirAtomico } from './fsutil'

export const VAULT = 'vault.json'
export const BASE = 'diario.db'
const LARGO_MIN = 6

export class ErrorDiario extends Error {}

class Diario {
  private dek: Uint8Array | null = null
  private llaveArchivos: Uint8Array | null = null
  private llaveArchivosCK: Promise<CryptoKey> | null = null
  private db: DB | null = null
  private _repo: Repo | null = null
  private fallos = 0
  private ocupado = false // un intento de contraseña a la vez
  oyentesBloqueo = new Set<() => void>()
  oyentesApertura = new Set<() => void>()

  get carpeta(): string {
    return leerConfig().carpeta
  }

  private ruta(nombre: string, carpeta = this.carpeta): string {
    return path.join(carpeta, nombre)
  }

  estado(): EstadoDiario {
    const carpeta = this.carpeta
    if (this.db) return { estado: 'abierto', carpeta }
    return fs.existsSync(this.ruta(VAULT))
      ? { estado: 'bloqueado', carpeta }
      : { estado: 'sin-crear', carpeta }
  }

  get abierto(): boolean {
    return this.db !== null
  }

  get repo(): Repo {
    if (!this._repo) throw new ErrorDiario('El diario está bloqueado')
    return this._repo
  }

  get base(): DB {
    if (!this.db) throw new ErrorDiario('El diario está bloqueado')
    return this.db
  }

  get dekActual(): Uint8Array {
    if (!this.dek) throw new ErrorDiario('El diario está bloqueado')
    return this.dek
  }

  /** Llave (no exportable) para cifrar y descifrar fotos y demás adjuntos. */
  llaveAdjuntos(): Promise<CryptoKey> {
    if (!this.llaveArchivos) throw new ErrorDiario('El diario está bloqueado')
    this.llaveArchivosCK ??= importarLlave(this.llaveArchivos)
    return this.llaveArchivosCK
  }

  leerVault(carpeta = this.carpeta): V.VaultFile {
    let crudo: unknown
    try {
      crudo = JSON.parse(fs.readFileSync(this.ruta(VAULT, carpeta), 'utf8'))
    } catch {
      throw new V.VaultInvalido('No se pudo leer vault.json')
    }
    return V.validarVault(crudo)
  }

  private escribirVault(v: V.VaultFile, carpeta = this.carpeta): void {
    escribirAtomico(this.ruta(VAULT, carpeta), JSON.stringify(v, null, 2))
  }

  private validarContrasena(c: string): void {
    if (c.length < LARGO_MIN)
      throw new ErrorDiario(`La contraseña debe tener al menos ${LARGO_MIN} caracteres`)
  }

  /** Abre la base con la DEK y deja todo listo. */
  async abrirCon(dek: Uint8Array, carpeta = this.carpeta): Promise<void> {
    const llaveDb = await V.subllave(dek, 'db')
    try {
      this.db = abrirDb(this.ruta(BASE, carpeta), llaveDb)
    } finally {
      wipe(llaveDb)
    }
    this.dek = dek
    this.llaveArchivos = await V.subllave(dek, 'archivos')
    this._repo = new Repo(this.db)
    this.fallos = 0
    for (const f of this.oyentesApertura) f()
  }

  async crear(carpeta: string, contrasena: string): Promise<string> {
    this.validarContrasena(contrasena)
    if (this.abierto) throw new ErrorDiario('Ya hay un diario abierto')
    fs.mkdirSync(carpeta, { recursive: true, mode: 0o700 })
    if (fs.existsSync(this.ruta(VAULT, carpeta)) || fs.existsSync(this.ruta(BASE, carpeta)))
      throw new ErrorDiario('En esa carpeta ya hay un diario')
    const { vault, dek, codigoRecuperacion } = await V.crearVault(contrasena)
    // Primero la base (vacía, cifrada); el vault al final: sin vault no "existe" el diario
    await this.abrirCon(dek, carpeta)
    this.escribirVault(vault, carpeta)
    return codigoRecuperacion
  }

  private async conEspera<T>(fn: () => Promise<T>): Promise<T> {
    if (this.ocupado) throw new ErrorDiario('Espera un momento…')
    this.ocupado = true
    try {
      // Retardo creciente tras 3 fallos seguidos: 1 s, 2 s, 4 s… hasta 30 s
      if (this.fallos >= 3) await esperar(Math.min(30_000, 1000 * 2 ** (this.fallos - 3)))
      return await fn()
    } catch (e) {
      if (e instanceof V.ContrasenaIncorrecta) this.fallos++
      throw e
    } finally {
      this.ocupado = false
    }
  }

  desbloquear(contrasena: string): Promise<void> {
    return this.conEspera(async () => {
      if (this.abierto) return
      const dek = await V.abrirConContrasena(this.leerVault(), contrasena)
      await this.abrirCon(dek)
    })
  }

  /** "¿Olvidaste tu contraseña?": entra con el código y define una contraseña nueva. */
  desbloquearConCodigo(codigo: string, nueva: string): Promise<void> {
    this.validarContrasena(nueva)
    return this.conEspera(async () => {
      const vault = this.leerVault()
      const dek = await V.abrirConCodigo(vault, codigo)
      this.escribirVault(await V.cambiarContrasena(vault, dek, nueva))
      if (!this.abierto) await this.abrirCon(dek)
    })
  }

  async cambiarContrasena(actual: string, nueva: string): Promise<void> {
    this.validarContrasena(nueva)
    const vault = this.leerVault()
    await this.conEspera(() => V.abrirConContrasena(vault, actual))
    this.escribirVault(await V.cambiarContrasena(vault, this.dekActual, nueva))
  }

  async regenerarCodigo(contrasena: string): Promise<string> {
    const vault = this.leerVault()
    await this.conEspera(() => V.abrirConContrasena(vault, contrasena))
    const r = await V.regenerarCodigo(vault, this.dekActual)
    this.escribirVault(r.vault)
    return r.codigo
  }

  /** Comprueba la contraseña (con la misma espera creciente tras fallos) sin cambiar nada. */
  async verificarContrasena(contrasena: string): Promise<void> {
    const vault = this.leerVault()
    await this.conEspera(() => V.abrirConContrasena(vault, contrasena))
  }

  bloquear(): void {
    if (!this.db) return
    try {
      checkpoint(this.db)
    } catch {
      /* igual se cierra */
    }
    this.db.close()
    this.db = null
    this._repo = null
    wipe(this.dek)
    wipe(this.llaveArchivos)
    this.dek = this.llaveArchivos = null
    this.llaveArchivosCK = null
    for (const f of this.oyentesBloqueo) f()
  }
}

export const diario = new Diario()
