/** Utilidades de texto compartidas (contador del editor y estadísticas). */

// Una palabra: letras o números, con apóstrofo o guion interno ("e-mail", "l'eau"); los números con
// punto, coma o dos puntos entre cifras cuentan como una ("1.500", "10:30", "3,5")
const PALABRA = /[\p{L}\p{N}]+(?:(?:['’-]|(?<=\p{N})[.,:](?=\p{N}))[\p{L}\p{N}]+)*/gu

export function contarPalabras(texto: string): number {
  return texto.match(PALABRA)?.length ?? 0
}
