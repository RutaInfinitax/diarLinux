/**
 * Llaves del diario.
 *
 * - DEK: llave de datos de 256 bits, al azar. Todo se cifra con llaves derivadas de ella.
 * - La contraseña (y el código de recuperación) pasan por Argon2id → KEK, que "envuelve"
 *   la DEK con AES-256-GCM. En vault.json solo se guardan las DEK envueltas.
 * - Cambiar la contraseña = volver a envolver la DEK (instantáneo, no se recifra nada).
 * - Con la contraseña equivocada, GCM falla al desenvolver → ContrasenaIncorrecta.
 */
import { argon2id } from 'hash-wasm'
import { ab, fromB64, randomBytes, te, toB64 } from './bytes'

export const VAULT_VERSION = 1

export interface KdfParams {
  alg: 'argon2id'
  memoryKiB: number
  iterations: number
  parallelism: number
}

export interface WrappedKey {
  salt: string // base64, 16 bytes
  iv: string // base64, 12 bytes
  data: string // base64: DEK cifrada + etiqueta GCM
}

export interface VaultFile {
  version: number
  kdf: KdfParams
  password: WrappedKey
  recovery: WrappedKey
  createdAt: string
}

export const KDF_DEFAULT: KdfParams = {
  alg: 'argon2id',
  memoryKiB: 64 * 1024,
  iterations: 3,
  parallelism: 1
}

export class ContrasenaIncorrecta extends Error {
  constructor() {
    super('Contraseña incorrecta')
    this.name = 'ContrasenaIncorrecta'
  }
}

export class VaultInvalido extends Error {
  constructor(msg = 'El archivo vault.json no tiene el formato esperado') {
    super(msg)
    this.name = 'VaultInvalido'
  }
}

async function derivarKek(secreto: string, salt: Uint8Array, kdf: KdfParams): Promise<Uint8Array> {
  const out = await argon2id({
    password: secreto.normalize('NFC'),
    salt,
    parallelism: kdf.parallelism,
    iterations: kdf.iterations,
    memorySize: kdf.memoryKiB,
    hashLength: 32,
    outputType: 'binary'
  })
  return out
}

async function aesKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', ab(raw), 'AES-GCM', false, ['encrypt', 'decrypt'])
}

const AAD = {
  password: te.encode('diarlinux-vault-v1:password'),
  recovery: te.encode('diarlinux-vault-v1:recovery')
}

async function envolver(
  dek: Uint8Array,
  secreto: string,
  kdf: KdfParams,
  cual: keyof typeof AAD
): Promise<WrappedKey> {
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const kek = await aesKey(await derivarKek(secreto, salt, kdf))
  const data = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: ab(iv), additionalData: ab(AAD[cual]) },
      kek,
      ab(dek)
    )
  )
  return { salt: toB64(salt), iv: toB64(iv), data: toB64(data) }
}

async function desenvolver(
  w: WrappedKey,
  secreto: string,
  kdf: KdfParams,
  cual: keyof typeof AAD
): Promise<Uint8Array> {
  let salt: Uint8Array, iv: Uint8Array, data: Uint8Array
  try {
    salt = fromB64(w.salt)
    iv = fromB64(w.iv)
    data = fromB64(w.data)
  } catch {
    throw new VaultInvalido()
  }
  const kek = await aesKey(await derivarKek(secreto, salt, kdf))
  try {
    const dek = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: ab(iv), additionalData: ab(AAD[cual]) },
        kek,
        ab(data)
      )
    )
    if (dek.length !== 32) throw new VaultInvalido()
    return dek
  } catch (e) {
    if (e instanceof VaultInvalido) throw e
    throw new ContrasenaIncorrecta()
  }
}

// ── Código de recuperación: 24 caracteres (120 bits) sin letras ambiguas, en grupos de 4 ──
const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ' // Crockford base32 (sin I, L, O, U)

export function generarCodigoRecuperacion(): string {
  const bytes = randomBytes(24)
  const chars = Array.from(bytes, (b) => ALFABETO[b & 31])
  return chars.join('').match(/.{4}/g)!.join('-')
}

/** Acepta el código con o sin guiones, en minúsculas, y con O/I/L confundidas. */
export function normalizarCodigo(codigo: string): string {
  return codigo
    .toUpperCase()
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/[^0-9A-Z]/g, '')
}

// ── API ──
export interface VaultCreado {
  vault: VaultFile
  dek: Uint8Array
  codigoRecuperacion: string
}

export async function crearVault(
  contrasena: string,
  kdf: KdfParams = KDF_DEFAULT
): Promise<VaultCreado> {
  const dek = randomBytes(32)
  const codigoRecuperacion = generarCodigoRecuperacion()
  const vault: VaultFile = {
    version: VAULT_VERSION,
    kdf,
    password: await envolver(dek, contrasena, kdf, 'password'),
    recovery: await envolver(dek, normalizarCodigo(codigoRecuperacion), kdf, 'recovery'),
    createdAt: new Date().toISOString()
  }
  return { vault, dek, codigoRecuperacion }
}

export function validarVault(x: unknown): VaultFile {
  const v = x as VaultFile
  const ok =
    v &&
    v.version === VAULT_VERSION &&
    v.kdf?.alg === 'argon2id' &&
    v.kdf.memoryKiB >= 8 * 1024 &&
    v.kdf.memoryKiB <= 1024 * 1024 &&
    v.kdf.iterations >= 1 &&
    v.kdf.iterations <= 20 &&
    v.kdf.parallelism >= 1 &&
    v.kdf.parallelism <= 8 &&
    typeof v.password?.data === 'string' &&
    typeof v.recovery?.data === 'string'
  if (!ok) throw new VaultInvalido()
  return v
}

export function abrirConContrasena(vault: VaultFile, contrasena: string): Promise<Uint8Array> {
  return desenvolver(vault.password, contrasena, vault.kdf, 'password')
}

export function abrirConCodigo(vault: VaultFile, codigo: string): Promise<Uint8Array> {
  return desenvolver(vault.recovery, normalizarCodigo(codigo), vault.kdf, 'recovery')
}

/** Nueva contraseña: solo se vuelve a envolver la DEK. */
export async function cambiarContrasena(
  vault: VaultFile,
  dek: Uint8Array,
  nueva: string
): Promise<VaultFile> {
  return { ...vault, password: await envolver(dek, nueva, vault.kdf, 'password') }
}

/** Código de recuperación nuevo (el anterior deja de servir). */
export async function regenerarCodigo(
  vault: VaultFile,
  dek: Uint8Array
): Promise<{ vault: VaultFile; codigo: string }> {
  const codigo = generarCodigoRecuperacion()
  return {
    vault: {
      ...vault,
      recovery: await envolver(dek, normalizarCodigo(codigo), vault.kdf, 'recovery')
    },
    codigo
  }
}

/** Subllaves con HKDF: la base de datos y los archivos usan llaves distintas derivadas de la DEK. */
export async function subllave(dek: Uint8Array, uso: 'db' | 'archivos'): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey('raw', ab(dek), 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: ab(te.encode('diarlinux-v1')),
      info: ab(te.encode(uso))
    },
    base,
    256
  )
  return new Uint8Array(bits)
}
