/** Idioma de main (menú de la bandeja, avisos, diálogos, exportaciones). La ventana recibe el mismo por la URL. */
import { app } from 'electron'
import { elegirIdioma, fijarIdioma, idioma, type Idioma } from '../shared/i18n'
import { leerConfig } from './config'

export function aplicarIdioma(): Idioma {
  fijarIdioma(
    elegirIdioma(leerConfig().idioma, app.getPreferredSystemLanguages().concat(app.getLocale()))
  )
  return idioma()
}
