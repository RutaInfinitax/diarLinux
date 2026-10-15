/**
 * Texto de la búsqueda con lo encontrado marcado. SQLite lo envuelve entre los caracteres 1 y 2 (que
 * el texto del diario no usa); se arma con <mark> de React, nunca con HTML crudo.
 */
const INICIO = String.fromCharCode(1)
const FIN = String.fromCharCode(2)

export function Resaltado({ texto }: { texto: string }): React.JSX.Element {
  const partes: React.ReactNode[] = []
  let resto = texto
  while (resto) {
    const a = resto.indexOf(INICIO)
    if (a < 0) {
      partes.push(resto.split(FIN).join(''))
      break
    }
    if (a > 0) partes.push(resto.slice(0, a))
    const b = resto.indexOf(FIN, a + 1)
    const fin = b < 0 ? resto.length : b
    partes.push(<mark key={partes.length}>{resto.slice(a + 1, fin)}</mark>)
    resto = resto.slice(fin + 1)
  }
  return <>{partes}</>
}
