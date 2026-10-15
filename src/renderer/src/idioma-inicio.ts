/**
 * Fija el idioma de la ventana ANTES de que se cargue cualquier otro módulo (main.tsx lo importa primero):
 * algunos módulos arman listas de textos al cargarse y tienen que verlos ya en el idioma correcto.
 */
import { fijarIdioma } from '../../shared/i18n'
import { fijarTextos } from './i18n'

const idioma = new URLSearchParams(location.search).get('idioma') === 'en' ? 'en' : 'es'
fijarIdioma(idioma)
fijarTextos(idioma)
document.documentElement.lang = idioma
