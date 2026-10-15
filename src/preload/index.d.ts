import type { DiarioApi } from '../shared/tipos'

declare global {
  interface Window {
    diario: DiarioApi
  }
}
