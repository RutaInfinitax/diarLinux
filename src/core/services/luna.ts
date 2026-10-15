/**
 * Fase lunar calculada localmente (sin internet). Longitudes eclípticas de la Luna y el Sol con los
 * términos principales de Meeus, "Astronomical Algorithms" (cap. 25 y 47): error de ~0,1°, o sea que
 * los instantes de luna nueva, llena y cuartos salen con unos minutos de diferencia.
 * Sin dependencias: se usa en main y en la ventana.
 */

export type FaseLunar =
  | 'nueva'
  | 'creciente'
  | 'cuartoCreciente'
  | 'gibosaCreciente'
  | 'llena'
  | 'gibosaMenguante'
  | 'cuartoMenguante'
  | 'menguante'

export const NOMBRE_FASE: Record<FaseLunar, string> = {
  nueva: 'Luna nueva',
  creciente: 'Luna creciente',
  cuartoCreciente: 'Cuarto creciente',
  gibosaCreciente: 'Gibosa creciente',
  llena: 'Luna llena',
  gibosaMenguante: 'Gibosa menguante',
  cuartoMenguante: 'Cuarto menguante',
  menguante: 'Luna menguante'
}

const RAD = Math.PI / 180
const norm = (g: number): number => ((g % 360) + 360) % 360

/** Día juliano de un instante. */
export function diaJuliano(d: Date): number {
  return d.getTime() / 86_400_000 + 2_440_587.5
}

/**
 * Elongación de la Luna (longitud de la Luna − longitud del Sol), 0-360°.
 * 0° = luna nueva, 90° = cuarto creciente, 180° = llena, 270° = cuarto menguante.
 */
export function elongacion(d: Date): number {
  const T = (diaJuliano(d) - 2_451_545) / 36_525
  const Lp = 218.3164477 + 481267.88123421 * T // longitud media de la Luna
  const D = (297.8501921 + 445267.1114034 * T) * RAD // elongación media
  const M = (357.5291092 + 35999.0502909 * T) * RAD // anomalía media del Sol
  const Mp = (134.9633964 + 477198.8675055 * T) * RAD // anomalía media de la Luna
  const F = (93.272095 + 483202.0175233 * T) * RAD // argumento de latitud
  const E = 1 - 0.002516 * T // excentricidad de la órbita terrestre
  const luna =
    Lp +
    6.288774 * Math.sin(Mp) +
    1.274027 * Math.sin(2 * D - Mp) +
    0.658314 * Math.sin(2 * D) +
    0.213618 * Math.sin(2 * Mp) -
    0.185116 * E * Math.sin(M) -
    0.114332 * Math.sin(2 * F) +
    0.058793 * Math.sin(2 * D - 2 * Mp) +
    0.057066 * E * Math.sin(2 * D - M - Mp) +
    0.053322 * Math.sin(2 * D + Mp) +
    0.045758 * E * Math.sin(2 * D - M) -
    0.040923 * E * Math.sin(M - Mp) -
    0.03472 * Math.sin(D) -
    0.030383 * E * Math.sin(M + Mp) +
    0.015327 * Math.sin(2 * D - 2 * F) -
    0.012528 * Math.sin(Mp + 2 * F) +
    0.01098 * Math.sin(Mp - 2 * F) +
    0.010675 * Math.sin(4 * D - Mp) +
    0.010034 * Math.sin(3 * Mp) +
    0.008548 * Math.sin(4 * D - 2 * Mp)
  const L0 = 280.46646 + 36000.76983 * T
  const sol =
    L0 +
    (1.914602 - 0.004817 * T) * Math.sin(M) +
    0.019993 * Math.sin(2 * M) +
    0.000289 * Math.sin(3 * M)
  return norm(luna - sol)
}

/** Fracción iluminada del disco (0 = nueva, 1 = llena), aproximada desde la elongación. */
export function iluminacion(elong: number): number {
  return (1 - Math.cos(elong * RAD)) / 2
}

export interface InfoLunar {
  fase: FaseLunar
  nombre: string
  iluminacion: number // 0-1, al mediodía del día
  elongacion: number // 0-360, al mediodía del día (para dibujar la luna)
}

/**
 * Fase lunar de un DÍA (de `inicio` a `fin`, normalmente medianoche a medianoche local).
 * Si durante ese día la elongación cruza 0°, 90°, 180° o 270°, el día lleva el nombre de esa fase
 * principal (como en los calendarios); si no, la fase intermedia.
 */
export function faseDelDia(inicio: Date, fin: Date): InfoLunar {
  const a = elongacion(inicio)
  let b = elongacion(fin)
  if (b < a) b += 360 // cruzó 0° (luna nueva)
  const medio = elongacion(new Date((inicio.getTime() + fin.getTime()) / 2))
  const principales: [number, FaseLunar][] = [
    [0, 'nueva'],
    [90, 'cuartoCreciente'],
    [180, 'llena'],
    [270, 'cuartoMenguante'],
    [360, 'nueva']
  ]
  let fase: FaseLunar | undefined
  for (const [g, f] of principales) if (a <= g && g < b) fase = f
  if (!fase)
    fase =
      medio < 90
        ? 'creciente'
        : medio < 180
          ? 'gibosaCreciente'
          : medio < 270
            ? 'gibosaMenguante'
            : 'menguante'
  return { fase, nombre: NOMBRE_FASE[fase], iluminacion: iluminacion(medio), elongacion: medio }
}

/** Fase lunar de una fecha AAAA-MM-DD en la hora local del equipo. */
export function faseDeFecha(fecha: string): InfoLunar {
  const [y, m, d] = fecha.split('-').map(Number)
  return faseDelDia(new Date(y, m - 1, d), new Date(y, m - 1, d + 1))
}
