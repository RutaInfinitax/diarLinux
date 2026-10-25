/**
 * Datos de prueba (npm run dev:seed): un diario SEPARADO en diarLinux/.dev-data con unas 400
 * entradas inventadas en 3 años, etiquetas, personas y calificaciones. Contraseña: "diariodev".
 * Solo actúa con DIARLINUX_SEED=1 y DIARLINUX_DATA puesto: nunca toca el diario real.
 */
import { leerConfig } from './config'
import { diario } from './diario'

export const CONTRASENA_DEV = 'diariodev'

const TITULOS = [
  'Un día tranquilo',
  'Paseo por el parque',
  'Cena con amigos',
  'Lluvia todo el día',
  'Trabajo y más trabajo',
  'Domingo de descanso',
  'Viaje corto',
  'Película en casa',
  'Mañana de café',
  'Visita a la familia',
  'Día de compras',
  'Nueva receta',
  'Caminata en la montaña',
  'Tarde de lectura',
  'Reunión importante',
  'Cumpleaños',
  '',
  ''
]
const FRASES = [
  'Hoy me levanté temprano y salí a caminar un rato.',
  'El clima estuvo agradable casi todo el día.',
  'Terminé por fin ese proyecto que tenía pendiente.',
  'Hablé por teléfono con mi hermana durante una hora.',
  'Preparé una sopa de verduras que salió muy rica.',
  'Leí varios capítulos del libro que empecé la semana pasada.',
  'Por la tarde llovió y me quedé en casa escuchando música.',
  'Fuimos al mercado y compramos fruta de temporada.',
  'Estuve pensando en los planes para el próximo mes.',
  'La reunión fue más larga de lo esperado, pero útil.',
  'Vi una película antigua que me encantó.',
  'Me sentí cansado, así que me acosté temprano.',
  'Arreglé la bicicleta y di una vuelta por el barrio.',
  'Encontré una canción nueva que no paro de escuchar.'
]
const ETIQUETAS = [
  'familia',
  'trabajo',
  'viajes',
  'salud',
  'amigos',
  'lectura',
  'música',
  'cocina',
  'deporte',
  'ideas',
  'películas',
  'naturaleza'
]

const PERSONAS = ['Mamá', 'Papá', 'Lucía', 'Martín', 'Sofía', 'Diego']

function azar<T>(l: T[]): T {
  return l[Math.floor(Math.random() * l.length)]
}

export async function sembrarSiHaceFalta(): Promise<void> {
  if (process.env.DIARLINUX_SEED !== '1' || !process.env.DIARLINUX_DATA) return
  if (diario.estado().estado !== 'sin-crear') return
  console.log('[seed] creando el diario de prueba en', leerConfig().carpeta)
  await diario.crear(leerConfig().carpeta, CONTRASENA_DEV)
  const repo = diario.repo
  const tags = ETIQUETAS.map((n) => repo.crearEnGrupo('etiqueta', n))
  const gente = PERSONAS.map((n) => repo.crearEnGrupo('persona', n))
  const hoy = new Date()
  const dias = new Set<string>()
  while (dias.size < 380) {
    const d = new Date(hoy.getTime() - Math.floor(Math.random() * 3 * 365) * 86400_000)
    dias.add(d.toISOString().slice(0, 10))
  }
  diario.base.transaction(() => {
    let n = 0
    for (const fecha of dias) {
      const veces = Math.random() < 0.06 ? 2 : 1 // algunos días con dos entradas
      for (let k = 0; k < veces; k++) {
        const parrafos = Array.from(
          { length: 1 + Math.floor(Math.random() * 4) },
          () =>
            `<p>${Array.from({ length: 2 + Math.floor(Math.random() * 4) }, () => azar(FRASES)).join(' ')}</p>`
        ).join('')
        const e = repo.guardar({
          fecha,
          hora: `${String(7 + Math.floor(Math.random() * 15)).padStart(2, '0')}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`,
          titulo: azar(TITULOS),
          html: parrafos,
          calificacion: Math.floor(Math.random() * 6)
        })
        const elegidas = tags.filter(() => Math.random() < 0.18).map((t) => t.id)
        if (elegidas.length) repo.asignarEnGrupo('etiqueta', e.id, elegidas)
        const con = gente.filter(() => Math.random() < 0.1).map((p) => p.id)
        if (con.length) repo.asignarEnGrupo('persona', e.id, con)
        n++
      }
    }
    console.log(`[seed] ${n} entradas creadas`)
  })()
  diario.bloquear()
}
