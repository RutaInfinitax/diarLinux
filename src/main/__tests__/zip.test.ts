import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { indexarZip, leerZip } from '../zip'

describe('lector de .zip', () => {
  it('lee archivos guardados y comprimidos, con nombres con acentos y carpetas', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-'))
    const z = path.join(d, 'prueba.zip')
    // python -I (aislado): arma el zip con zipfile, un archivo deflate y otro guardado
    execFileSync('python3', [
      '-I',
      '-c',
      `import zipfile,sys
with zipfile.ZipFile(sys.argv[1],'w') as z:
  z.writestr('Diarium.json','[{"a": "ñandú"}]'*50, compress_type=zipfile.ZIP_DEFLATED)
  z.writestr('media/2024-07-01_170455050/foto ñ.jpg', bytes(range(256))*10, compress_type=zipfile.ZIP_STORED)`,
      z
    ])
    const i = indexarZip(z)
    expect([...i.keys()].sort()).toEqual(['Diarium.json', 'media/2024-07-01_170455050/foto ñ.jpg'])
    expect(leerZip(z, i.get('Diarium.json')!).toString()).toBe('[{"a": "ñandú"}]'.repeat(50))
    const foto = leerZip(z, i.get('media/2024-07-01_170455050/foto ñ.jpg')!)
    expect(foto.length).toBe(2560)
    expect(foto[255]).toBe(255)
    fs.writeFileSync(path.join(d, 'no.zip'), 'hola')
    expect(() => indexarZip(path.join(d, 'no.zip'))).toThrow('No es un archivo .zip válido')
    fs.rmSync(d, { recursive: true })
  })
})
