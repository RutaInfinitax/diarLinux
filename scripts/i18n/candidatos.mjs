// Lista los textos que parecen visibles para el usuario y todavía no pasan por t()/es.*
// Uso: node scripts/i18n/candidatos.mjs [archivo…]   (sin argumentos: todo src/, sin tests)
import fs from 'node:fs'
import path from 'node:path'

const archivos = process.argv.slice(2).length
  ? process.argv.slice(2)
  : (function lista(d) {
      return fs.readdirSync(d, { withFileTypes: true }).flatMap((f) => {
        const p = path.join(d, f.name)
        if (f.isDirectory()) return f.name === '__tests__' || f.name === 'i18n' ? [] : lista(p)
        return /\.(ts|tsx)$/.test(f.name) && !/(^|\/)(en|es|i18n)\.ts$/.test(p) ? [p] : []
      })
    })('src')

const parece = (s) =>
  /[a-záéíóúñ]{2,}/i.test(s) &&
  (/[áéíóúñ¿¡…]/.test(s) || /\s/.test(s.trim()) || /^[A-ZÁÉÍÓÚ][a-záéíóúñ]+$/.test(s.trim()))
const ignorar = (linea) =>
  /^\s*(\/\/|\*|\/\*)|console\.|registrarFoco|import |ipcMain|ipcRenderer|\bt\(|\btn\(|className=|querySelector|addEventListener|require\(|throw new Error\(['"`](?:[a-z]+:)/.test(
    linea
  )

let total = 0
for (const f of archivos) {
  const lineas = fs.readFileSync(f, 'utf8').split('\n')
  const hallados = []
  lineas.forEach((l, i) => {
    if (ignorar(l)) return
    const textos = []
    for (const m of l.matchAll(/(['"`])((?:\\.|(?!\1).)*)\1/g))
      if (parece(m[2]) && !/^[\w.-]+$/.test(m[2])) textos.push(m[2])
    for (const m of l.matchAll(/>([^<>{}]*[a-záéíóúñ]{2,}[^<>{}]*)</gi))
      if (m[1].trim() && !/=>|&&|\|\|/.test(m[1])) textos.push(m[1].trim())
    const jsx = /^\s+([A-ZÁÉÍÓÚ¿¡][^<>{}=;()]*[a-záéíóúñ.:…?!])\s*$/.exec(l)
    if (jsx && !/^(import|export|return|const|let|if|else|case)\b/.test(jsx[1]))
      textos.push(jsx[1].trim())
    if (textos.length) hallados.push(`  ${i + 1}: ${textos.join('  |  ').slice(0, 160)}`)
  })
  if (hallados.length) {
    console.log(`\n${f} (${hallados.length})`)
    console.log(hallados.join('\n'))
    total += hallados.length
  }
}
console.error(`\nTOTAL líneas con texto: ${total}`)
