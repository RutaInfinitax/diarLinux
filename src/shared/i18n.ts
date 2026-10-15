/**
 * Idiomas de la interfaz: español (el texto original del código) e inglés.
 *
 * Estilo «gettext»: el texto en español ES la clave. `t('Guardar')` devuelve «Save» en inglés; si a un
 * texto le faltara la traducción se muestra en español (nunca vacío). Variables: `t('Hace {n} años', { n })`.
 * El test `i18n.test.ts` revisa que todos los `t('…')` del código tengan su traducción en `en.ts`.
 *
 * Main y la ventana llaman a `fijarIdioma()` al arrancar (config `idioma`: 'auto' | 'es' | 'en').
 */
import { en } from './en'

export type Idioma = 'es' | 'en'
export type PreferenciaIdioma = 'auto' | Idioma

let actual: Idioma = 'es'

export function fijarIdioma(i: Idioma): void {
  actual = i
}

export function idioma(): Idioma {
  return actual
}

/** Para Intl / toLocaleString. */
export function locale(): string {
  return actual === 'en' ? 'en-US' : 'es'
}

/** 'auto' → español si el sistema está en español; cualquier otro idioma → inglés. */
export function elegirIdioma(
  pref: PreferenciaIdioma | undefined,
  idiomasSistema: string[]
): Idioma {
  if (pref === 'es' || pref === 'en') return pref
  const primero = (idiomasSistema.find((x) => !!x) ?? 'es').toLowerCase()
  return primero.startsWith('es') ? 'es' : 'en'
}

export function t(es: string, vars?: Record<string, string | number>): string {
  let s = actual === 'en' ? (en[es] ?? es) : es
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
  return s
}

/** Plural simple: `tn(n, '1 entrada', '{n} entradas')` (las dos formas se traducen por separado). */
export function tn(
  n: number,
  uno: string,
  varios: string,
  vars?: Record<string, string | number>
): string {
  return t(n === 1 ? uno : varios, { n: n.toLocaleString(locale()), ...vars })
}
