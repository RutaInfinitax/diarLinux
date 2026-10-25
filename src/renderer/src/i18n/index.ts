/**
 * Textos agrupados de la interfaz (es.ts / en.ts con la misma forma). `es` es un enlace VIVO: después de
 * `fijarTextos('en')` todos los `es.nav.calendario` del código devuelven el texto en inglés.
 * Para el resto de los textos se usa `t('…')` de shared/i18n.
 */
import { es as textosEs } from './es'
import { en as textosEn } from './en'
import type { Idioma } from '../../../shared/i18n'

export let es = textosEs

export function fijarTextos(i: Idioma): void {
  es = i === 'en' ? textosEn : textosEs
}
