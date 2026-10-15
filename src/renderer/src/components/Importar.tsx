/**
 * Importar desde Joplin (JEX o carpeta RAW) o desde Diarium (.zip en formato JSON): elegir el
 * archivo, ver el resumen y elegir opciones, e importar entrada por entrada con barra de avance.
 * Lo que ya se importó no se repite (se puede reanudar).
 */
import { useRef, useState } from 'react'
import DOMPurify from 'dompurify'
import type { NotaImportar, ResumenImportacion } from '../../../shared/tipos'
import { procesarFoto } from '../util/fotos'
import { datosDeVideo, duracionDeAudio, tamanoLegible } from '../util/medios'
import { t } from '../../../shared/i18n'
import './importar.css'

type Paso =
  | { que: 'elegir'; error?: string }
  | { que: 'analizando' }
  | { que: 'resumen'; r: ResumenImportacion }
  | { que: 'importando'; r: ResumenImportacion; i: number; titulo: string }
  | { que: 'listo'; informe: Informe }

interface Informe {
  entradas: number
  adjuntos: number
  saltadas: number
  cancelado: boolean
  errores: string[]
}

const MAX_MEDIO_EN_VENTANA = 400 * 1024 * 1024 // más grande: se guarda sin miniatura

export type Fuente = 'joplin' | 'diarium'

export function Importar({
  fuente,
  cerrar,
  alTerminar
}: {
  fuente: Fuente
  cerrar: () => void
  alTerminar: () => void
}): React.JSX.Element {
  const nombreFuente = fuente === 'joplin' ? 'Joplin' : 'Diarium'
  const [paso, setPaso] = useState<Paso>({ que: 'elegir' })
  const [libretas, setLibretas] = useState(true)
  const [originales, setOriginales] = useState(true)
  const cancelar = useRef(false)

  const elegir = async (carpeta: boolean): Promise<void> => {
    const imp = window.diario.importar
    const ruta = fuente === 'joplin' ? await imp.elegirJoplin(carpeta) : await imp.elegirDiarium()
    if (!ruta) return
    setPaso({ que: 'analizando' })
    try {
      setPaso({
        que: 'resumen',
        r: fuente === 'joplin' ? await imp.analizarJoplin(ruta) : await imp.analizarDiarium(ruta)
      })
    } catch (e) {
      setPaso({ que: 'elegir', error: (e as Error).message })
    }
  }

  const importar = async (r: ResumenImportacion): Promise<void> => {
    cancelar.current = false
    const inf: Informe = { entradas: 0, adjuntos: 0, saltadas: 0, cancelado: false, errores: [] }
    const { compresion } = await window.diario.ajustes.obtener()
    // etiquetas y personas por nombre (sin distinguir mayúsculas): se crean la primera vez
    const grupo = async (
      api: typeof window.diario.etiquetas
    ): Promise<(nombre: string) => Promise<string>> => {
      const ids = new Map((await api.listar()).map((g) => [g.nombre.toLocaleLowerCase('es'), g.id]))
      return async (nombre) => {
        const k = nombre.toLocaleLowerCase('es')
        let id = ids.get(k)
        if (!id) {
          id = (await api.crear(nombre)).id
          ids.set(k, id)
        }
        return id
      }
    }
    const idEtiqueta = await grupo(window.diario.etiquetas)
    const idPersona = await grupo(window.diario.personas)
    for (let i = 0; i < r.notas; i++) {
      if (cancelar.current) {
        inf.cancelado = true
        break
      }
      let n: NotaImportar
      try {
        n =
          fuente === 'joplin'
            ? await window.diario.importar.notaJoplin(i, libretas)
            : await window.diario.importar.notaDiarium(i)
      } catch (e) {
        inf.errores.push(`${t('Nota {n}', { n: i + 1 })}: ${(e as Error).message}`)
        continue
      }
      setPaso({ que: 'importando', r, i, titulo: n.titulo })
      if (i % 10 === 0) window.diario.vault.actividad() // que no se bloquee a mitad de camino
      if (n.yaImportada) {
        inf.saltadas++
        continue
      }
      try {
        const e = await window.diario.entradas.guardar({
          fecha: n.fecha,
          hora: n.hora,
          titulo: n.titulo,
          html: DOMPurify.sanitize(n.html)
        })
        if (n.etiquetas.length)
          await window.diario.etiquetas.asignar(
            e.id,
            await Promise.all(n.etiquetas.map(idEtiqueta))
          )
        if (n.personas.length)
          await window.diario.personas.asignar(e.id, await Promise.all(n.personas.map(idPersona)))
        for (const rec of n.recursos) {
          try {
            await adjuntar(e.id, rec, originales ? 'original' : compresion)
            inf.adjuntos++
          } catch (err) {
            inf.errores.push(`«${n.titulo || n.fecha}»: ${rec.nombre}: ${(err as Error).message}`)
          }
        }
        await window.diario.importar.marcar(n.idExterno, e.id)
        inf.entradas++
      } catch (err) {
        inf.errores.push(`«${n.titulo || n.fecha}»: ${(err as Error).message}`)
      }
    }
    await window.diario.importar.terminar()
    alTerminar()
    setPaso({ que: 'listo', informe: inf })
  }

  return (
    <div className="imp-fondo">
      <div
        className="imp-ventana"
        role="dialog"
        aria-label={t('Importar desde {app}', { app: nombreFuente })}
      >
        <h3>{t('Importar desde {app}', { app: nombreFuente })}</h3>

        {paso.que === 'elegir' && fuente === 'diarium' && (
          <>
            <p>
              {t(
                t(
                  'En Diarium: Exportar → formato JSON, con «Crear archivos separados para los adjuntos». Te da un .zip: elígelo aquí tal cual (no hace falta descomprimirlo).'
                )
              )}
            </p>
            <p className="imp-tenue">
              {t(
                t(
                  'Se importan las entradas con su fecha y hora exactas, título, texto, etiquetas, personas, fotos y audios. Nada se copia sin cifrar al disco: los archivos se leen directo desde el .zip.'
                )
              )}
            </p>
            {paso.error && <p className="imp-error">{paso.error}</p>}
            <div className="imp-botones">
              <button onClick={cerrar}>{t('Cancelar')}</button>
              <button className="primario" onClick={() => void elegir(false)}>
                {t('Elegir archivo .zip…')}
              </button>
            </div>
          </>
        )}

        {paso.que === 'elegir' && fuente === 'joplin' && (
          <>
            <p>
              {t(
                t(
                  'En Joplin: Archivo → Exportar todo → JEX (o clic derecho en una libreta → Exportar → JEX). Es el único formato que conserva TODO: fechas, etiquetas, libretas y todos los archivos (fotos, audios, videos, PDF…). También sirve la carpeta RAW.'
                )
              )}
            </p>
            <p className="imp-tenue">
              {t(
                t(
                  'Markdown, HTML y PDF pierden etiquetas o fechas: no se usan. Nada se copia sin cifrar al disco: los archivos se leen directo desde el JEX.'
                )
              )}
            </p>
            {paso.error && <p className="imp-error">{paso.error}</p>}
            <div className="imp-botones">
              <button onClick={cerrar}>{t('Cancelar')}</button>
              <button onClick={() => void elegir(true)}>{t('Carpeta RAW…')}</button>
              <button className="primario" onClick={() => void elegir(false)}>
                {t('Elegir archivo JEX…')}
              </button>
            </div>
          </>
        )}

        {paso.que === 'analizando' && <p>{t('Leyendo la exportación…')}</p>}

        {paso.que === 'resumen' && (
          <>
            <ResumenVista r={paso.r} />
            {fuente === 'joplin' && (
              <label className="imp-casilla">
                <input
                  type="checkbox"
                  checked={libretas}
                  onChange={(e) => setLibretas(e.target.checked)}
                />
                {t('Agregar el nombre de la libreta como etiqueta')}
              </label>
            )}
            <label className="imp-casilla">
              <input
                type="checkbox"
                checked={originales}
                onChange={(e) => setOriginales(e.target.checked)}
              />
              {t('Guardar las fotos originales (sin comprimir)')}
            </label>
            <div className="imp-botones">
              <button onClick={cerrar}>{t('Cancelar')}</button>
              <button
                className="primario"
                disabled={paso.r.notas === paso.r.yaImportadas}
                onClick={() => void importar(paso.r)}
              >
                {fuente === 'joplin'
                  ? t('Importar {n} notas', { n: paso.r.notas - paso.r.yaImportadas })
                  : t('Importar {n} entradas', { n: paso.r.notas - paso.r.yaImportadas })}
              </button>
            </div>
          </>
        )}

        {paso.que === 'importando' && (
          <>
            <p>{t('Importando {i} de {total}…', { i: paso.i + 1, total: paso.r.notas })}</p>
            <div className="imp-barra">
              <span style={{ width: `${((paso.i + 1) / paso.r.notas) * 100}%` }} />
            </div>
            <p className="imp-tenue imp-actual">{paso.titulo}</p>
            <div className="imp-botones">
              <button onClick={() => (cancelar.current = true)}>{t('Detener')}</button>
            </div>
          </>
        )}

        {paso.que === 'listo' && (
          <>
            <p>
              {paso.informe.cancelado
                ? t('Importación detenida.') + ' '
                : '✓ ' + t('Importación terminada.') + ' '}
              {t('{n} entradas nuevas con {a} archivos.', {
                n: paso.informe.entradas,
                a: paso.informe.adjuntos
              })}
              {paso.informe.saltadas > 0 &&
                ' ' + t('{n} ya estaban importadas.', { n: paso.informe.saltadas })}
            </p>
            {paso.informe.cancelado && (
              <p className="imp-tenue">
                {t('Puedes volver a importar el mismo archivo: sigue donde quedó.')}
              </p>
            )}
            {paso.informe.errores.length > 0 && (
              <div className="imp-errores">
                <b>{t('No se pudo importar:')}</b>
                {paso.informe.errores.slice(0, 50).map((e, i) => (
                  <div key={i}>{e}</div>
                ))}
              </div>
            )}
            <div className="imp-botones">
              <button className="primario" onClick={cerrar}>
                {t('Listo')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

async function adjuntar(
  entradaId: string,
  rec: NotaImportar['recursos'][number],
  compresion: 'original' | 'estandar' | 'alta'
): Promise<void> {
  const imp = window.diario.importar
  const archivo = async (): Promise<File> =>
    new File([(await imp.leerRecurso(rec.id)) as BlobPart], rec.nombre, { type: rec.mime })
  if (rec.tipo === 'photo') {
    try {
      await window.diario.adjuntos.agregarFoto(
        entradaId,
        await procesarFoto(await archivo(), compresion)
      )
    } catch {
      await imp.adjuntarRecurso(entradaId, rec.id, { tipo: 'file' }) // formato raro: se guarda tal cual
    }
    return
  }
  if (rec.tipo === 'video') {
    const extra = rec.tamano <= MAX_MEDIO_EN_VENTANA ? await datosDeVideo(await archivo()) : {}
    await imp.adjuntarRecurso(entradaId, rec.id, { tipo: 'video', ...extra })
    return
  }
  if (rec.tipo === 'audio') {
    const duracion =
      rec.tamano <= MAX_MEDIO_EN_VENTANA ? await duracionDeAudio(await archivo()) : undefined
    await imp.adjuntarRecurso(entradaId, rec.id, { tipo: 'audio', duracion })
    return
  }
  await imp.adjuntarRecurso(entradaId, rec.id, { tipo: 'file' })
}

function ResumenVista({ r }: { r: ResumenImportacion }): React.JSX.Element {
  const fecha = (f: string | null): string => (f ? f.split('-').reverse().join('/') : '—')
  return (
    <div className="imp-resumen">
      <div className="imp-ruta" title={r.ruta}>
        {r.ruta.split('/').pop()}
      </div>
      <div className="imp-grilla">
        <span>{t('Entradas')}</span>
        <b>
          {r.notas}
          {r.yaImportadas > 0 && ` (${t('{n} ya importadas', { n: r.yaImportadas })})`}
        </b>
        <span>{t('Fechas')}</span>
        <b>{t('{desde} a {hasta}', { desde: fecha(r.desde), hasta: fecha(r.hasta) })}</b>
        <span>{t('Etiquetas')}</span>
        <b>{r.etiquetas}</b>
        {r.personas !== undefined && (
          <>
            <span>{t('Personas')}</span>
            <b>{r.personas}</b>
          </>
        )}
        {r.libretas.length > 0 && (
          <>
            <span>{t('Libretas')}</span>
            <b>{r.libretas.map((l) => `${l.nombre} (${l.cantidad})`).join(', ')}</b>
          </>
        )}
        <span>{t('Archivos')}</span>
        <b>
          {t('{f} fotos, {v} videos, {a} audios, {o} otros ({tam})', {
            f: r.fotos,
            v: r.videos,
            a: r.audios,
            o: r.archivos,
            tam: tamanoLegible(r.bytes)
          })}
        </b>
      </div>
      {(r.faltantes > 0 ||
        r.omitidas.cifradas > 0 ||
        r.omitidas.papelera > 0 ||
        r.omitidas.conflictos > 0 ||
        r.conUbicacion > 0 ||
        (r.invalidas ?? 0) > 0 ||
        r.sinUsar > 0) && (
        <ul className="imp-avisos">
          {r.faltantes > 0 && (
            <li className="imp-error">
              {t('{n} archivos enlazados en las notas no están en la exportación.', {
                n: r.faltantes
              })}
            </li>
          )}
          {r.omitidas.cifradas > 0 && (
            <li className="imp-error">
              {t(
                '{n} notas están cifradas por Joplin (desactiva el cifrado de Joplin y vuelve a exportar).',
                {
                  n: r.omitidas.cifradas
                }
              )}
            </li>
          )}
          {r.omitidas.papelera > 0 && (
            <li>{t('{n} notas en la papelera: no se importan.', { n: r.omitidas.papelera })}</li>
          )}
          {r.omitidas.conflictos > 0 && (
            <li>
              {t('{n} notas de conflicto de sincronización: no se importan.', {
                n: r.omitidas.conflictos
              })}
            </li>
          )}
          {r.conUbicacion > 0 && (
            <li>
              {t('{n} notas tienen ubicación: no se importa (diarLinux no usa ubicación).', {
                n: r.conUbicacion
              })}
            </li>
          )}
          {r.sinUsar > 0 && (
            <li>{t('{n} archivos no están enlazados en ninguna nota.', { n: r.sinUsar })}</li>
          )}
          {(r.invalidas ?? 0) > 0 && (
            <li className="imp-error">
              {t('{n} entradas sin fecha válida: no se importan.', { n: r.invalidas ?? 0 })}
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
