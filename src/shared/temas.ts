/**
 * Temas: claro / oscuro / sistema y colores de acento (muchos y variados:
 * brillantes, de poco brillo, pastel y oscuros). Sin dependencias: lo usan main y la ventana.
 */
export type Tema = 'oscuro' | 'claro' | 'sistema'

export interface Acento {
  id: string
  nombre: string
  grupo: 'Brillantes' | 'Poco brillo' | 'Pastel' | 'Oscuros'
  acento: string // barra superior
  claro: string // íconos, números, días con entrada
  texto: string // texto sobre la barra
}

const B = 'Brillantes' as const
const A = 'Poco brillo' as const
const P = 'Pastel' as const
const O = 'Oscuros' as const
const BL = '#ffffff'
const NE = '#1d1d1f'

export const ACENTOS: Acento[] = [
  { id: 'azul', nombre: 'Azul', grupo: B, acento: '#2f6fdb', claro: '#3d8ef0', texto: BL },
  { id: 'rojo', nombre: 'Rojo', grupo: B, acento: '#d64545', claro: '#ef6262', texto: BL },
  { id: 'rosa', nombre: 'Rosa', grupo: B, acento: '#d6457f', claro: '#ee6a9e', texto: BL },
  { id: 'naranja', nombre: 'Naranja', grupo: B, acento: '#e07020', claro: '#f58a3c', texto: BL },
  { id: 'ambar', nombre: 'Ámbar', grupo: B, acento: '#d99a00', claro: '#f2b322', texto: NE },
  { id: 'verde', nombre: 'Verde', grupo: B, acento: '#2e9e4f', claro: '#45bf68', texto: BL },
  { id: 'turquesa', nombre: 'Turquesa', grupo: B, acento: '#13a3a3', claro: '#2cc3c3', texto: BL },
  { id: 'morado', nombre: 'Morado', grupo: B, acento: '#8a4fd6', claro: '#a374f0', texto: BL },
  { id: 'indigo', nombre: 'Índigo', grupo: B, acento: '#4f5bd6', claro: '#6f7af0', texto: BL },
  { id: 'acero', nombre: 'Azul acero', grupo: A, acento: '#4a6585', claro: '#6f8db0', texto: BL },
  { id: 'salvia', nombre: 'Salvia', grupo: A, acento: '#5f7a63', claro: '#82a087', texto: BL },
  {
    id: 'terracota',
    nombre: 'Terracota',
    grupo: A,
    acento: '#9a5a45',
    claro: '#c07a63',
    texto: BL
  },
  { id: 'ciruela', nombre: 'Ciruela', grupo: A, acento: '#6e4e6e', claro: '#957095', texto: BL },
  { id: 'pizarra', nombre: 'Pizarra', grupo: A, acento: '#55606e', claro: '#7d8896', texto: BL },
  { id: 'oliva', nombre: 'Oliva', grupo: A, acento: '#6b6b3e', claro: '#929259', texto: BL },
  { id: 'arena', nombre: 'Arena', grupo: A, acento: '#8a7a5a', claro: '#ad9c7a', texto: BL },
  { id: 'celeste', nombre: 'Celeste', grupo: P, acento: '#9ccbf0', claro: '#9ccbf0', texto: NE },
  { id: 'lavanda', nombre: 'Lavanda', grupo: P, acento: '#c3b5f0', claro: '#c3b5f0', texto: NE },
  { id: 'menta', nombre: 'Menta', grupo: P, acento: '#a8e0c4', claro: '#a8e0c4', texto: NE },
  { id: 'durazno', nombre: 'Durazno', grupo: P, acento: '#f5c3a3', claro: '#f5c3a3', texto: NE },
  {
    id: 'rosapastel',
    nombre: 'Rosa pastel',
    grupo: P,
    acento: '#f2b8cf',
    claro: '#f2b8cf',
    texto: NE
  },
  { id: 'limon', nombre: 'Limón', grupo: P, acento: '#ece59a', claro: '#ece59a', texto: NE },
  { id: 'noche', nombre: 'Azul noche', grupo: O, acento: '#1f3554', claro: '#4d6a94', texto: BL },
  { id: 'bordo', nombre: 'Bordó', grupo: O, acento: '#5c1f2b', claro: '#a14d5d', texto: BL },
  { id: 'bosque', nombre: 'Bosque', grupo: O, acento: '#1f4a33', claro: '#4c8a66', texto: BL },
  { id: 'petroleo', nombre: 'Petróleo', grupo: O, acento: '#1d4a52', claro: '#4b8a94', texto: BL },
  { id: 'grafito', nombre: 'Grafito', grupo: O, acento: '#2f3236', claro: '#6d7380', texto: BL },
  { id: 'chocolate', nombre: 'Chocolate', grupo: O, acento: '#4a3326', claro: '#8c6a55', texto: BL }
]

export const acentoPorId = (id: string): Acento => ACENTOS.find((a) => a.id === id) ?? ACENTOS[0]

const rgb = (h: string): [number, number, number] => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16)
]
/** Luminancia relativa (WCAG), 0 = negro, 1 = blanco. */
export function luminancia(h: string): number {
  const [r, g, b] = rgb(h).map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
/** Mezcla `h` con negro (`cuanto` 0-1). */
export function oscurecer(h: string, cuanto: number): string {
  return (
    '#' +
    rgb(h)
      .map((c) =>
        Math.round(c * (1 - cuanto))
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
  )
}

/** Blanco salvo que no se lea (contraste < 3): entonces casi negro. */
export function textoSobre(fondo: string): string {
  return 1.05 / (luminancia(fondo) + 0.05) >= 3 ? BL : NE
}

/** Variables CSS del acento para el tema efectivo (claro u oscuro). */
export function variablesAcento(a: Acento, oscuro: boolean): Record<string, string> {
  // sobre fondo claro, un acento muy claro (pastel) no se lee como texto o ícono: se oscurece
  let claro = a.claro
  if (!oscuro) while (luminancia(claro) > 0.3) claro = oscurecer(claro, 0.15)
  // sobre fondo oscuro, un acento muy oscuro tampoco: se usa el "claro" del propio acento
  return {
    '--acento': a.acento,
    '--acento-texto': a.texto,
    '--acento-claro': claro,
    '--acento-dia': a.claro,
    '--acento-dia-texto': textoSobre(a.claro)
  }
}

/** Color de fondo de la ventana mientras carga (evita un destello del color equivocado). */
export const fondoVentana = (oscuro: boolean): string => (oscuro ? '#2b2b2b' : '#f4f4f6')

// ───────────────────────── Skins ─────────────────────────
// Un skin cambia TODOS los colores (fondo, paneles, barra lateral, texto, bordes) y trae su
// propio color de acento. "clasico" = el de siempre (tema claro/oscuro de tema.css + acento).
// Paleta: [fondo, panel, panel2, borde, texto, texto suave, acento, acento fuerte (barra)]
export type Paleta = [string, string, string, string, string, string, string, string]

export interface Skin {
  id: string
  nombre: string
  grupo: 'Originales' | 'Originales (claros)' | 'Nuevos oscuros' | 'Nuevos claros'
  claro: boolean
  c: Paleta
}

const TR = 'Originales' as const
const TC = 'Originales (claros)' as const
const NO = 'Nuevos oscuros' as const
const NC = 'Nuevos claros' as const
const sk = (id: string, nombre: string, grupo: Skin['grupo'], c: Paleta): Skin => ({
  id,
  nombre,
  grupo,
  claro: grupo === TC || grupo === NC,
  c
})

export const SKIN_CLASICO = 'clasico'
/** "acento" especial: usar el color que trae el skin. */
export const ACENTO_SKIN = 'skin'

export const SKINS: Skin[] = [
  // originales
  sk('original', 'Original', TR, [
    '#14161a',
    '#1c1f25',
    '#232730',
    '#2f3440',
    '#e6e8ec',
    '#9aa1ad',
    '#5b9dff',
    '#3f7fe0'
  ]),
  sk('negro', 'Negro puro', TR, [
    '#000000',
    '#0b0b0c',
    '#151517',
    '#26262a',
    '#ececec',
    '#8c8c92',
    '#8ab4ff',
    '#5a8ef0'
  ]),
  sk('grafito', 'Grafito', TR, [
    '#1b1b1d',
    '#242427',
    '#2d2d31',
    '#3a3a3f',
    '#e4e4e7',
    '#a1a1aa',
    '#d4d4d8',
    '#63636b'
  ]),
  sk('medianoche', 'Medianoche', TR, [
    '#0b1020',
    '#111831',
    '#18213f',
    '#26315a',
    '#dfe6ff',
    '#8d9bc4',
    '#7aa2ff',
    '#4f74e0'
  ]),
  sk('oceano', 'Océano', TR, [
    '#071a24',
    '#0c2532',
    '#12303f',
    '#1d4357',
    '#d9f1f7',
    '#84aab8',
    '#3fc1d9',
    '#1f97b0'
  ]),
  sk('bosque', 'Bosque', TR, [
    '#0f1a14',
    '#15241b',
    '#1c2f23',
    '#2a4433',
    '#dcefe2',
    '#8fac98',
    '#4cc38a',
    '#2f9e6a'
  ]),
  sk('mentaosc', 'Menta oscuro', TR, [
    '#10201d',
    '#162b27',
    '#1d3631',
    '#2b4b44',
    '#dcf5ef',
    '#8fb5ac',
    '#5eead4',
    '#139e8f'
  ]),
  sk('purpura', 'Púrpura', TR, [
    '#160f24',
    '#1f1633',
    '#281d42',
    '#3a2b5c',
    '#ece4ff',
    '#a598c4',
    '#b18cff',
    '#8b5cf6'
  ]),
  sk('dracula', 'Drácula', TR, [
    '#282a36',
    '#2f3241',
    '#383a4c',
    '#44475a',
    '#f8f8f2',
    '#a0a4c0',
    '#bd93f9',
    '#9a6ef0'
  ]),
  sk('vino', 'Vino', TR, [
    '#1e0e12',
    '#2a1419',
    '#351a21',
    '#4d2830',
    '#f5e1e5',
    '#b9959d',
    '#ff6b8b',
    '#d9466a'
  ]),
  sk('rosanoche', 'Rosa noche', TR, [
    '#1f1020',
    '#2a172c',
    '#352039',
    '#4d3052',
    '#fbe4f6',
    '#bf9bb8',
    '#ff7ad9',
    '#d94bb3'
  ]),
  sk('atardecer', 'Atardecer', TR, [
    '#1c130d',
    '#271a12',
    '#322218',
    '#4a3324',
    '#f7e6d8',
    '#bba08a',
    '#ff9e57',
    '#e0722a'
  ]),
  sk('cafe', 'Café', TR, [
    '#1d1611',
    '#282018',
    '#33291f',
    '#4a3c2e',
    '#efe2d2',
    '#b3a08a',
    '#d4a373',
    '#a8743f'
  ]),
  sk('gruvbox', 'Gruvbox', TR, [
    '#282828',
    '#32302f',
    '#3c3836',
    '#504945',
    '#ebdbb2',
    '#a89984',
    '#fabd2f',
    '#c28a12'
  ]),
  sk('nord', 'Nord', TR, [
    '#2e3440',
    '#3b4252',
    '#434c5e',
    '#4c566a',
    '#eceff4',
    '#a3acbd',
    '#88c0d0',
    '#5e81ac'
  ]),
  sk('solarosc', 'Solarized oscuro', TR, [
    '#002b36',
    '#073642',
    '#0b4150',
    '#22525f',
    '#eee8d5',
    '#93a1a1',
    '#2aa198',
    '#268bd2'
  ]),
  sk('monokai', 'Monokai', TR, [
    '#272822',
    '#2f302a',
    '#3a3b33',
    '#4a4b42',
    '#f8f8f2',
    '#a6a28c',
    '#a6e22e',
    '#6f9a17'
  ]),
  sk('terminal', 'Terminal verde', TR, [
    '#050a05',
    '#0a140a',
    '#0f1f0f',
    '#1d3a1d',
    '#b6ffb6',
    '#5fa55f',
    '#39ff14',
    '#1f9e0c'
  ]),
  sk('ambarretro', 'Ámbar retro', TR, [
    '#0d0900',
    '#171000',
    '#211800',
    '#3d2d05',
    '#ffd27a',
    '#b08a3a',
    '#ffb000',
    '#b87c00'
  ]),
  sk('claro', 'Claro', TC, [
    '#f4f5f7',
    '#ffffff',
    '#eef0f3',
    '#d5d9e0',
    '#1d2330',
    '#5f6878',
    '#2f6fe0',
    '#2f6fe0'
  ]),
  sk('papel', 'Papel', TC, [
    '#f3ead8',
    '#fbf5e9',
    '#efe4cc',
    '#d8c9a8',
    '#3b2f1e',
    '#7d6a4c',
    '#a0522d',
    '#a0522d'
  ]),
  sk('solarclaro', 'Solarized claro', TC, [
    '#fdf6e3',
    '#fffbef',
    '#eee8d5',
    '#d9d2bf',
    '#3c4a50',
    '#6c7f86',
    '#268bd2',
    '#268bd2'
  ]),
  sk('mentaclaro', 'Menta claro', TC, [
    '#eef7f3',
    '#ffffff',
    '#e1f0e9',
    '#c4dccf',
    '#1b3a2e',
    '#557566',
    '#0f9d6e',
    '#0f9d6e'
  ]),
  sk('lavandaclaro', 'Lavanda claro', TC, [
    '#f3f0fb',
    '#ffffff',
    '#e9e3f7',
    '#d3c9ec',
    '#2a2140',
    '#6a5f86',
    '#7c4ddb',
    '#7c4ddb'
  ]),
  sk('duraznoclaro', 'Durazno claro', TC, [
    '#fbf1ea',
    '#ffffff',
    '#f6e3d6',
    '#e6c9b5',
    '#3d2418',
    '#85634f',
    '#e0662c',
    '#d0581f'
  ]),
  // nuevos: combinaciones pensadas para un diario (descansan la vista)
  sk('mocha', 'Catppuccin Mocha', NO, [
    '#1e1e2e',
    '#252536',
    '#313244',
    '#45475a',
    '#cdd6f4',
    '#a6adc8',
    '#cba6f7',
    '#8c6fd1'
  ]),
  sk('tokyo', 'Tokyo Night', NO, [
    '#1a1b26',
    '#202230',
    '#292e42',
    '#3b4261',
    '#c0caf5',
    '#8089b3',
    '#7aa2f7',
    '#3d59a1'
  ]),
  sk('onedark', 'One Dark', NO, [
    '#282c34',
    '#2f343e',
    '#363c48',
    '#454c59',
    '#dcdfe4',
    '#9aa1ad',
    '#61afef',
    '#3b84c4'
  ]),
  sk('everforest', 'Everforest', NO, [
    '#2d353b',
    '#343f44',
    '#3d484d',
    '#4f585e',
    '#e2d6bb',
    '#9da9a0',
    '#a7c080',
    '#6f8a4c'
  ]),
  sk('rosepine', 'Rosé Pine', NO, [
    '#191724',
    '#1f1d2e',
    '#26233a',
    '#403d52',
    '#e0def4',
    '#908caa',
    '#ebbcba',
    '#9c7fc4'
  ]),
  sk('kanagawa', 'Kanagawa', NO, [
    '#1f1f28',
    '#2a2a37',
    '#363646',
    '#54546d',
    '#dcd7ba',
    '#a6a69c',
    '#7e9cd8',
    '#6a5a9e'
  ]),
  sk('tormenta', 'Tormenta', NO, [
    '#1c2128',
    '#232a33',
    '#2b333e',
    '#3b4552',
    '#dfe5ec',
    '#95a1b0',
    '#f5c542',
    '#3f5873'
  ]),
  sk('cobre', 'Carbón y cobre', NO, [
    '#161514',
    '#1f1d1b',
    '#282522',
    '#3a3531',
    '#ece4dc',
    '#a89c90',
    '#e08a4f',
    '#a8572a'
  ]),
  sk('aurora', 'Aurora', NO, [
    '#0f1720',
    '#152230',
    '#1b2c3d',
    '#2a4157',
    '#dde9f5',
    '#8ea6bd',
    '#6ee7b7',
    '#5b45b0'
  ]),
  sk('musgo', 'Musgo', NO, [
    '#171a12',
    '#1f2318',
    '#272c1f',
    '#3a412d',
    '#e3e8d3',
    '#a0a88c',
    '#b5d35a',
    '#5f7a25'
  ]),
  sk('cereza', 'Cereza nocturna', NO, [
    '#1a0f14',
    '#24151c',
    '#2e1b24',
    '#452a37',
    '#f6e3ea',
    '#b896a4',
    '#ff8fab',
    '#a8385a'
  ]),
  sk('lava', 'Lava', NO, [
    '#140d0b',
    '#1d1311',
    '#271a17',
    '#3d2722',
    '#f5e2dc',
    '#b4948a',
    '#ff7a4d',
    '#c23a15'
  ]),
  sk('tinta', 'Tinta y oro', NO, [
    '#10131c',
    '#171b27',
    '#1e2333',
    '#2e3449',
    '#e9e4d4',
    '#a29d8c',
    '#d9b45a',
    '#24305e'
  ]),
  sk('latte', 'Catppuccin Latte', NC, [
    '#eff1f5',
    '#ffffff',
    '#e6e9ef',
    '#ccd0da',
    '#3a3d55',
    '#6c6f85',
    '#8839ef',
    '#7287fd'
  ]),
  sk('cuaderno', 'Cuaderno', NC, [
    '#f7f3e8',
    '#fffdf6',
    '#efe9da',
    '#dcd3bd',
    '#2b2a33',
    '#6e6a5e',
    '#2f4f8f',
    '#2f4f8f'
  ]),
  sk('cerezo', 'Cerezo', NC, [
    '#fdf2f5',
    '#ffffff',
    '#f8e4ea',
    '#ecc6d2',
    '#3d1f2a',
    '#855f6c',
    '#c2416b',
    '#d45a83'
  ]),
  sk('pino', 'Nieve y pino', NC, [
    '#f2f6f5',
    '#ffffff',
    '#e4ece9',
    '#c7d6d0',
    '#1f2e29',
    '#5a6f67',
    '#2f6b55',
    '#2f6b55'
  ]),
  sk('lago', 'Lago', NC, [
    '#eef4f9',
    '#ffffff',
    '#e0eaf3',
    '#c3d4e3',
    '#1c2a38',
    '#5a6c7d',
    '#2b7bbf',
    '#3a8fd6'
  ]),
  sk('desierto', 'Desierto', NC, [
    '#f6efe6',
    '#fffaf3',
    '#ede2d3',
    '#d9c8b2',
    '#3a2c20',
    '#7f6a55',
    '#b5651d',
    '#c87533'
  ]),
  sk('niebla', 'Niebla', NC, [
    '#ebedf0',
    '#f7f8fa',
    '#e0e3e8',
    '#c8cdd5',
    '#22262c',
    '#646b75',
    '#56637a',
    '#56637a'
  ]),
  sk('ayu', 'Ayu claro', NC, [
    '#fafafa',
    '#ffffff',
    '#f0f0f0',
    '#d9d9d9',
    '#3c4250',
    '#787b80',
    '#e06c1b',
    '#c4600e'
  ]),
  sk('gruvclaro', 'Gruvbox claro', NC, [
    '#fbf1c7',
    '#fdf6d8',
    '#f2e5bc',
    '#d5c4a1',
    '#3c3836',
    '#7c6f64',
    '#b57614',
    '#af3a03'
  ])
]

export const skinPorId = (id: string): Skin | null => SKINS.find((s) => s.id === id) ?? null

/** Mezcla `a` con `b` (t = 0 → a, 1 → b). */
export function mezclar(a: string, b: string, t: number): string {
  const x = rgb(a)
  const y = rgb(b)
  return (
    '#' +
    x
      .map((c, i) =>
        Math.round(c + (y[i] - c) * t)
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
  )
}
const alfa = (h: string, a: number): string => `rgba(${rgb(h).join(', ')}, ${a})`

/** El acento que trae el skin: barra con el "acento fuerte", íconos con el "acento". */
export function acentoDeSkin(s: Skin): Acento {
  const barra = s.c[7]
  return {
    id: ACENTO_SKIN,
    nombre: 'Del skin',
    grupo: B,
    acento: barra,
    claro: s.c[6],
    texto: textoSobre(barra)
  }
}

/** Todas las variables de color de tema.css calculadas a partir de la paleta del skin. */
export function variablesSkin(s: Skin): Record<string, string> {
  const [f, p, p2, b, t, su, ac, ac2] = s.c
  const os = !s.claro
  const chip = os ? mezclar(ac2, p2, 0.45) : mezclar(ac2, t, 0.3)
  return {
    '--fondo': f,
    '--fondo-encabezado': f,
    '--fondo-translucido': alfa(f, os ? 0.92 : 0.94),
    '--celda': os ? p2 : mezclar(p2, t, 0.04),
    '--celda-hover': mezclar(p2, t, os ? 0.08 : 0.08),
    '--celda-vacia': os ? mezclar(f, p2, 0.5) : mezclar(f, p2, 0.5),
    '--celda-borde-hover': alfa(t, os ? 0.75 : 0.45),
    '--tarjeta': p,
    '--tarjeta-hover': mezclar(p, t, os ? 0.05 : 0.04),
    '--lateral': p,
    '--lateral-arriba': mezclar(p, t, 0.03),
    '--lateral-medio': p,
    '--lateral-abajo': mezclar(p, f, 0.5),
    '--lateral-borde': os ? mezclar(f, '#000000', 0.3) : b,
    '--lateral-sel': alfa(t, os ? 0.13 : 0.08),
    '--texto': t,
    '--texto-2': mezclar(t, su, 0.2),
    '--texto-fuerte': mezclar(t, os ? '#ffffff' : '#000000', 0.4),
    '--texto-suave': su,
    '--texto-tenue': mezclar(su, f, 0.22),
    '--texto-placeholder': mezclar(su, f, 0.42),
    '--encabezado': mezclar(su, t, 0.3),
    '--borde': b,
    '--linea': b,
    '--linea-suave': mezclar(b, f, 0.5),
    '--superficie': os ? p2 : p,
    '--superficie-2': os ? p : mezclar(f, p, 0.5),
    '--superficie-borde': mezclar(b, t, 0.15),
    '--sombra': os ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0.18)',
    '--velo': os ? 'rgba(0, 0, 0, 0.45)' : 'rgba(0, 0, 0, 0.25)',
    '--hover': alfa(t, os ? 0.08 : 0.06),
    '--hover-suave': alfa(t, os ? 0.05 : 0.04),
    '--sel': alfa(t, os ? 0.1 : 0.08),
    '--control': mezclar(p2, t, os ? 0.14 : 0.06),
    '--control-hover': mezclar(p2, t, os ? 0.22 : 0.11),
    '--control-borde': mezclar(b, t, os ? 0.2 : 0.12),
    '--control-texto': t,
    '--campo': os ? mezclar(f, p, 0.6) : p,
    '--campo-borde': mezclar(b, t, 0.15),
    '--hundido': mezclar(f, '#000000', os ? 0.12 : 0.03),
    '--enlace': os ? mezclar(ac, '#ffffff', 0.1) : ac,
    '--chip': chip,
    '--chip-texto': luminancia(chip) > 0.4 ? NE : '#f1f3f6',
    '--scroll': mezclar(b, t, 0.12)
  }
}

/** Opciones de apariencia que afectan los colores (subconjunto de Ajustes). */
export interface OpcionesApariencia {
  tema: Tema
  skin: string
  acento: string
  barra: 'color' | 'plana' | 'discreta'
  lateralTinte: boolean
  fondoTinte: boolean
  fondoLuz?: number // -100 (más oscuro) … 0 (como el skin) … 100 (más claro)
  fondoCalidez?: number // -100 (azulado) … 0 … 100 (cálido, sepia)
  textoSuave?: number // 0 … 100: baja el brillo del texto (sin dejar de leerse)
}

/** Contraste WCAG entre dos colores (1 = igual, 21 = negro sobre blanco). */
export function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

/** Paletas del skin clásico (los colores de tema.css), para poder ajustarlas como un skin. */
export const CLASICO_PALETA: Record<'oscuro' | 'claro', Paleta> = {
  oscuro: ['#2b2b2b', '#3a3a3c', '#3b3b3b', '#4a4a4a', '#e8e8e8', '#a8a8a8', '#3d8ef0', '#2f6fdb'],
  claro: ['#f4f4f6', '#e8e8eb', '#e3e3e7', '#d0d0d4', '#1e1e20', '#55555a', '#3d8ef0', '#2f6fdb']
}

const limitar = (n: number | undefined, a: number, b: number): number =>
  Math.min(b, Math.max(a, Number.isFinite(n) ? (n as number) : 0))

/** Mayor t en [0, tope] con ok(t) verdadero (ok es verdadero en 0 y deja de serlo al crecer). */
function buscarTope(ok: (t: number) => boolean, tope: number): number {
  if (ok(tope)) return tope
  let a = 0
  let b = tope
  for (let i = 0; i < 18; i++) {
    const m = (a + b) / 2
    if (ok(m)) a = m
    else b = m
  }
  return a
}

/**
 * Paleta con lo que eligió el usuario en Apariencia: luz y calidez del fondo y suavidad del texto.
 * Siempre legible: el fondo de un tema oscuro no se aclara más allá de donde el texto claro deja de
 * leerse bien (y al revés en los claros), y el texto nunca baja de contraste 4,5 (WCAG AA).
 */
export function paletaAjustada(
  c: Paleta,
  oscuro: boolean,
  luz?: number,
  calidez?: number,
  suave?: number
): Paleta {
  const [f, p, p2, b, t, su, ac, ac2] = c
  const L = limitar(luz, -100, 100) / 100
  const C = limitar(calidez, -100, 100) / 100
  const S = limitar(suave, 0, 100) / 100
  const mover = (x: string, k: number): string =>
    k >= 0 ? mezclar(x, '#ffffff', k) : mezclar(x, '#000000', -k)
  const tinte = C >= 0 ? '#d9a066' : '#6f93d9'
  const conK = (x: string, k: number): string => mezclar(mover(x, k), tinte, Math.abs(C) * 0.16)
  // el tope tiene en cuenta el tinte: con el fondo final el texto tiene que seguir leyéndose
  const legible = (k: number): boolean => contraste(t, conK(f, k)) >= 4.6
  let k = 0
  if (L > 0) k = buscarTope((x) => legible(x), oscuro ? 0.6 : 1) * L
  if (L < 0) k = -buscarTope((x) => legible(-x), oscuro ? 0.7 : 0.6) * -L
  const fondo = (x: string): string => conK(x, k)
  const [f2, p3, p4, b2] = [fondo(f), fondo(p), fondo(p2), fondo(b)]
  // si el tinte dejó el texto justo al límite, el texto se acerca un poco a blanco/negro
  let t2 = t
  if (contraste(t2, f2) < 4.5)
    t2 = mezclar(
      t,
      oscuro ? '#ffffff' : '#000000',
      buscarTope((x) => contraste(mezclar(t, oscuro ? '#ffffff' : '#000000', x), f2) < 4.5, 1) +
        0.02
    )
  if (S > 0) {
    const base = t2
    t2 = mezclar(base, f2, buscarTope((x) => contraste(mezclar(base, f2, x), f2) >= 4.5, 0.45) * S)
  }
  let su2 = mezclar(su, f2, S * 0.2)
  if (contraste(su2, f2) < 3)
    su2 = mezclar(su2, t2, buscarTope((x) => contraste(mezclar(su2, t2, x), f2) < 3, 1) + 0.05)
  return [f2, p3, p4, b2, t2, su2, ac, ac2]
}

// colores de tema.css del skin clásico (para teñirlos con el acento)
const CLASICO = {
  oscuro: { fondo: '#2b2b2b', lateral: ['#3a3a3c', '#3e3e40', '#39393b', '#343437'] },
  claro: { fondo: '#f4f4f6', lateral: ['#e8e8eb', '#ededf0', '#e8e8eb', '#e2e2e6'] }
}
const VARS_LATERAL = ['--lateral', '--lateral-arriba', '--lateral-medio', '--lateral-abajo']

/** Resultado final: si es oscuro y todas las variables a poner en <html>. */
export function calcularApariencia(
  o: OpcionesApariencia,
  sistemaOscuro: boolean
): { oscuro: boolean; vars: Record<string, string> } {
  const s = o.skin === SKIN_CLASICO ? null : skinPorId(o.skin)
  const oscuro = s ? !s.claro : o.tema === 'oscuro' || (o.tema === 'sistema' && sistemaOscuro)
  const a = o.acento === ACENTO_SKIN ? (s ? acentoDeSkin(s) : ACENTOS[0]) : acentoPorId(o.acento)
  // Luz/calidez del fondo y suavidad del texto: la paleta (del skin o la clásica) se ajusta
  const ajustado = !!(o.fondoLuz || o.fondoCalidez || o.textoSuave)
  const pal = ajustado
    ? paletaAjustada(
        s ? s.c : CLASICO_PALETA[oscuro ? 'oscuro' : 'claro'],
        oscuro,
        o.fondoLuz,
        o.fondoCalidez,
        o.textoSuave
      )
    : null
  const colores = pal
    ? variablesSkin({ id: o.skin, nombre: '', grupo: TR, claro: !oscuro, c: pal })
    : s
      ? variablesSkin(s)
      : {}
  const vars = { ...colores, ...variablesAcento(a, oscuro) }
  const base = CLASICO[oscuro ? 'oscuro' : 'claro']
  if (o.fondoTinte) {
    const f = pal ? pal[0] : s ? s.c[0] : base.fondo
    const tf = mezclar(f, a.claro, oscuro ? 0.07 : 0.06)
    vars['--fondo'] = tf
    vars['--fondo-encabezado'] = tf
    vars['--fondo-translucido'] = alfa(tf, 0.92)
  }
  if (o.lateralTinte) {
    const l = s || pal ? VARS_LATERAL.map((k) => vars[k]) : base.lateral
    VARS_LATERAL.forEach((k, i) => (vars[k] = mezclar(l[i], a.acento, oscuro ? 0.16 : 0.12)))
  }
  return { oscuro, vars }
}

/** Fondo de la ventana mientras carga, con el skin elegido. */
export const fondoInicial = (o: OpcionesApariencia, sistemaOscuro: boolean): string => {
  const r = calcularApariencia(o, sistemaOscuro)
  return r.vars['--fondo'] ?? fondoVentana(r.oscuro)
}
