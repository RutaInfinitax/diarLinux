import './idioma-inicio' // primero de todo: el idioma
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { Dialogos } from './components/Dialogo'
import './theme/tema.css'
import './theme/base.css'
import './app.css'
import { aplicarColores, POR_DEFECTO } from './util/apariencia'
import { recargarAjustes } from './util/preferencias'
import { t } from '../../shared/i18n'

// Skin, tema y acento ANTES del primer dibujo (main los pasa en la dirección): sin destellos
const q = new URLSearchParams(location.search)
try {
  aplicarColores({ ...POR_DEFECTO, ...JSON.parse(q.get('ap') || '{}') })
} catch {
  aplicarColores(POR_DEFECTO)
}
void recargarAjustes()

// Una vista que pide datos justo en el instante en que se bloquea el diario: no es un error
// (la pantalla pasa a la de bloqueo igual). Cualquier otro error sigue apareciendo.
window.addEventListener('unhandledrejection', (e) => {
  if ((e.reason as Error)?.message === t('El diario está bloqueado')) e.preventDefault()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Dialogos />
    <App />
  </StrictMode>
)
