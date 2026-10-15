import { describe, expect, it } from 'vitest'
import { randomBytes } from '../bytes'
import * as enc from '../encfile'
import * as v from '../vault'

// Parámetros chicos para que los tests sean rápidos (la app usa 64 MiB / 3 iteraciones)
const KDF_TEST: v.KdfParams = {
  alg: 'argon2id',
  memoryKiB: 8 * 1024,
  iterations: 1,
  parallelism: 1
}

describe('vault', () => {
  it('crea, abre con contraseña y con código, y rechaza lo equivocado', async () => {
    const { vault, dek, codigoRecuperacion } = await v.crearVault('mi clave', KDF_TEST)
    expect(codigoRecuperacion).toMatch(/^([0-9A-Z]{4}-){5}[0-9A-Z]{4}$/)
    expect(JSON.stringify(vault)).not.toContain('mi clave')
    expect(await v.abrirConContrasena(vault, 'mi clave')).toEqual(dek)
    expect(
      await v.abrirConCodigo(vault, codigoRecuperacion.toLowerCase().replace(/-/g, ' '))
    ).toEqual(dek)
    await expect(v.abrirConContrasena(vault, 'otra')).rejects.toBeInstanceOf(v.ContrasenaIncorrecta)
    await expect(v.abrirConCodigo(vault, 'AAAA-AAAA-AAAA-AAAA-AAAA-AAAA')).rejects.toBeInstanceOf(
      v.ContrasenaIncorrecta
    )
    // la contraseña no abre el lado del código ni al revés
    await expect(v.abrirConCodigo(vault, 'mi clave')).rejects.toBeInstanceOf(v.ContrasenaIncorrecta)
  })

  it('cambiar la contraseña conserva la DEK y la vieja deja de servir', async () => {
    const { vault, dek } = await v.crearVault('vieja', KDF_TEST)
    const nuevo = await v.cambiarContrasena(vault, dek, 'nueva')
    expect(await v.abrirConContrasena(nuevo, 'nueva')).toEqual(dek)
    await expect(v.abrirConContrasena(nuevo, 'vieja')).rejects.toBeInstanceOf(
      v.ContrasenaIncorrecta
    )
  })

  it('regenerar el código invalida el anterior', async () => {
    const { vault, dek, codigoRecuperacion } = await v.crearVault('x', KDF_TEST)
    const r = await v.regenerarCodigo(vault, dek)
    expect(await v.abrirConCodigo(r.vault, r.codigo)).toEqual(dek)
    await expect(v.abrirConCodigo(r.vault, codigoRecuperacion)).rejects.toBeInstanceOf(
      v.ContrasenaIncorrecta
    )
  })

  it('vault manipulado → error claro', async () => {
    const { vault } = await v.crearVault('x', KDF_TEST)
    expect(() => v.validarVault({ ...vault, kdf: { ...vault.kdf, memoryKiB: 1 } })).toThrow(
      v.VaultInvalido
    )
    expect(() => v.validarVault({ hola: 1 })).toThrow(v.VaultInvalido)
    expect(v.validarVault(JSON.parse(JSON.stringify(vault)))).toBeTruthy()
  })

  it('subllaves distintas para la base y los archivos', async () => {
    const dek = randomBytes(32)
    const a = await v.subllave(dek, 'db')
    const b = await v.subllave(dek, 'archivos')
    expect(a).toHaveLength(32)
    expect(a).not.toEqual(b)
    expect(await v.subllave(dek, 'db')).toEqual(a)
  })
})

describe('archivos .enc', () => {
  const datos = (n: number): Uint8Array => {
    const d = new Uint8Array(n)
    for (let i = 0; i < n; i++) d[i] = (i * 31 + 7) & 255
    return d
  }

  it('ida y vuelta con varios tamaños (vacío, menor, igual y mayor que un bloque)', async () => {
    const llave = await enc.importarLlave(randomBytes(32))
    for (const n of [0, 1, 1023, 1024, 1025, 5000]) {
      const plano = datos(n)
      const c = await enc.cifrar(llave, 'foto-1', plano, 1024)
      expect(c.length).toBe(enc.tamanoCifrado(n, 1024))
      expect(await enc.descifrar(llave, 'foto-1', c)).toEqual(plano)
    }
  })

  it('rangos: devuelve exactamente los bytes pedidos', async () => {
    const llave = await enc.importarLlave(randomBytes(32))
    const plano = datos(5000)
    const c = await enc.cifrar(llave, 'audio', plano, 1024)
    const info = enc.leerCabecera(c.subarray(0, enc.CABECERA))
    const leer = (d: number, l: number): Uint8Array => c.subarray(d, d + l)
    for (const [a, b] of [
      [0, 0],
      [0, 4999],
      [1000, 1100],
      [1023, 1024],
      [4096, 4999],
      [2048, 3071]
    ]) {
      expect(await enc.descifrarRango(llave, 'audio', info, a, b, leer)).toEqual(
        plano.slice(a, b + 1)
      )
    }
    await expect(enc.descifrarRango(llave, 'audio', info, 0, 5000, leer)).rejects.toBeInstanceOf(
      RangeError
    )
  })

  it('clave equivocada, id cambiado, byte alterado, bloques cambiados o archivo cortado → falla', async () => {
    const k1 = await enc.importarLlave(randomBytes(32))
    const k2 = await enc.importarLlave(randomBytes(32))
    const plano = datos(3000)
    const c = await enc.cifrar(k1, 'a', plano, 1024)
    await expect(enc.descifrar(k2, 'a', c)).rejects.toBeInstanceOf(enc.ArchivoDanado)
    await expect(enc.descifrar(k1, 'b', c)).rejects.toBeInstanceOf(enc.ArchivoDanado)
    const alterado = c.slice()
    alterado[100] ^= 1
    await expect(enc.descifrar(k1, 'a', alterado)).rejects.toBeInstanceOf(enc.ArchivoDanado)
    const cab = c.slice()
    cab[24] ^= 1 // tamaño original en la cabecera
    await expect(enc.descifrar(k1, 'a', cab)).rejects.toBeInstanceOf(enc.ArchivoDanado)
    // intercambiar los bloques 0 y 1 (mismo largo)
    const B = 1024 + enc.ETIQUETA
    const cambiado = c.slice()
    cambiado.set(c.subarray(enc.CABECERA + B, enc.CABECERA + 2 * B), enc.CABECERA)
    cambiado.set(c.subarray(enc.CABECERA, enc.CABECERA + B), enc.CABECERA + B)
    await expect(enc.descifrar(k1, 'a', cambiado)).rejects.toBeInstanceOf(enc.ArchivoDanado)
    // cortado en un borde de bloque: el último que queda no está marcado como último
    const corto = enc.cifrar(k1, 'a', datos(2048), 1024).then((x) => {
      const info = enc.leerCabecera(x)
      const falso = x.slice(0, enc.CABECERA + B)
      new DataView(falso.buffer).setBigUint64(24, 1024n, true)
      return { falso, info }
    })
    await expect(corto.then(({ falso }) => enc.descifrar(k1, 'a', falso))).rejects.toBeInstanceOf(
      enc.ArchivoDanado
    )
    await expect(enc.descifrar(k1, 'a', c.subarray(0, c.length - 1))).rejects.toBeInstanceOf(
      enc.ArchivoDanado
    )
  })

  it('cifrar por partes (archivos grandes) da un .enc que se descifra igual', async () => {
    const llave = await enc.importarLlave(randomBytes(32))
    const plano = datos(5000)
    const partes: Uint8Array[] = []
    await enc.cifrarPorPartes(
      llave,
      'video',
      plano.length,
      (d, l) => plano.slice(d, d + l),
      (b) => void partes.push(b),
      1024
    )
    const total = Buffer.concat(partes)
    expect(total.length).toBe(enc.tamanoCifrado(5000, 1024))
    expect(await enc.descifrar(llave, 'video', new Uint8Array(total))).toEqual(plano)
    await expect(
      enc.cifrarPorPartes(
        llave,
        'x',
        10,
        () => new Uint8Array(3),
        () => {},
        1024
      )
    ).rejects.toBeInstanceOf(enc.ArchivoDanado)
  })

  it('archivos de varios bloques leídos con Buffer de Node (como desde el disco)', async () => {
    // Regresión: Buffer.slice() es una vista; el nonce base se modificaba y fallaba desde el 3.er bloque
    const llave = await enc.importarLlave(randomBytes(32))
    const plano = Buffer.from(datos(4 * 1024 + 300))
    const partes: Buffer[] = []
    await enc.cifrarPorPartes(
      llave,
      'mp3',
      plano.length,
      (d, l) => plano.subarray(d, d + l),
      (b) => void partes.push(Buffer.from(b)),
      1024
    )
    const total = Buffer.concat(partes)
    const leer = (d: number, l: number): Buffer => {
      const b = Buffer.alloc(l)
      total.copy(b, 0, d, d + l)
      return b
    }
    const info = enc.leerCabecera(leer(0, enc.CABECERA))
    expect(
      Buffer.from(await enc.descifrarRango(llave, 'mp3', info, 0, plano.length - 1, leer)).equals(
        plano
      )
    ).toBe(true)
    expect(
      Buffer.from(await enc.descifrarRango(llave, 'mp3', info, 3000, 4200, leer)).equals(
        plano.subarray(3000, 4201)
      )
    ).toBe(true)
    expect(Buffer.from(await enc.descifrar(llave, 'mp3', total)).equals(plano)).toBe(true)
  })

  it('el mismo contenido cifrado dos veces da bytes distintos y no aparece en claro', async () => {
    const llave = await enc.importarLlave(randomBytes(32))
    const plano = new TextEncoder().encode('secreto secreto secreto')
    const a = await enc.cifrar(llave, 'x', plano)
    const b = await enc.cifrar(llave, 'x', plano)
    expect(a).not.toEqual(b)
    expect(Buffer.from(a).includes(Buffer.from('secreto'))).toBe(false)
  })
})
