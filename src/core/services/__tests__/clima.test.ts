import { describe, expect, it } from 'vitest'
import { leerCiudades, leerClima, resumenClima, temperatura, textoClima, urlClima } from '../clima'

const BA = { lat: -34.6037, lon: -58.3816 }

describe('clima', () => {
  it('elige pronóstico (≤ 90 días atrás), archivo (antes) o nada (futuro lejano)', () => {
    expect(urlClima(BA, '2026-10-11', '2026-10-11')).toContain('api.open-meteo.com/v1/forecast')
    expect(urlClima(BA, '2026-07-20', '2026-10-11')).toContain('/v1/forecast')
    expect(urlClima(BA, '2026-06-01', '2026-10-11')).toContain(
      'archive-api.open-meteo.com/v1/archive'
    )
    expect(urlClima(BA, '2026-10-20', '2026-10-11')).toContain('/v1/forecast')
    expect(urlClima(BA, '2026-11-30', '2026-10-11')).toBeNull()
    expect(urlClima(BA, '1930-01-01', '2026-10-11')).toBeNull()
    const u = new URL(urlClima(BA, '2015-06-10', '2026-10-11')!)
    expect(u.searchParams.get('start_date')).toBe('2015-06-10')
    expect(u.searchParams.get('latitude')).toBe('-34.6037')
  })

  it('lee la hora pedida, máx/mín y amanecer/atardecer', () => {
    const horas = Array.from(
      { length: 24 },
      (_, i) => `2026-09-01T${String(i).padStart(2, '0')}:00`
    )
    const json = {
      hourly: {
        time: horas,
        temperature_2m: horas.map((_, i) => 10 + i / 2),
        weather_code: horas.map((_, i) => (i < 12 ? 0 : 2))
      },
      daily: {
        weather_code: [2],
        temperature_2m_max: [21.4],
        temperature_2m_min: [9.8],
        sunrise: ['2026-09-01T07:12'],
        sunset: ['2026-09-01T18:45']
      }
    }
    const c = leerClima(json, '14:35', 'Buenos Aires')!
    expect(c).toEqual({
      temp: 17,
      codigo: 2,
      max: 21.4,
      min: 9.8,
      amanecer: '07:12',
      atardecer: '18:45',
      hora: '14:00',
      ciudad: 'Buenos Aires'
    })
    expect(resumenClima(c, 'C')).toBe('17 °C, parcialmente nublado')
    expect(temperatura(c.temp, 'F')).toBe('63 °F')
  })

  it('archivo con horas sin dato: usa la más cercana; sin datos: null', () => {
    const json = {
      hourly: {
        time: ['2026-10-09T10:00', '2026-10-09T11:00'],
        temperature_2m: [12, null],
        weather_code: [3, null]
      },
      daily: {}
    }
    expect(leerClima(json, '11:00', 'X')!.hora).toBe('10:00')
    expect(leerClima({ hourly: { time: ['a'], temperature_2m: [null] } }, '12:00', 'X')).toBeNull()
    expect(leerClima({ error: true, reason: 'x' }, '12:00', 'X')).toBeNull()
  })

  it('textos WMO y ciudades', () => {
    expect(textoClima(95)).toBe('Tormenta')
    expect(textoClima(1234)).toBe('Desconocido')
    expect(
      leerCiudades({
        results: [
          {
            name: 'Córdoba',
            latitude: -31.4,
            longitude: -64.18,
            admin1: 'Provincia de Córdoba',
            country: 'Argentina',
            timezone: 'America/Argentina/Cordoba'
          },
          { name: 'roto' }
        ]
      })
    ).toEqual([
      {
        nombre: 'Córdoba',
        region: 'Provincia de Córdoba',
        pais: 'Argentina',
        lat: -31.4,
        lon: -64.18,
        zona: 'America/Argentina/Cordoba'
      }
    ])
  })
})
