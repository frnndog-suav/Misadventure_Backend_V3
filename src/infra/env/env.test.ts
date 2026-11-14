import { describe, expect, it } from 'vitest'
import { validateEnv } from './env'

describe('validateEnv', () => {
  const DATABASE_URL = 'postgresql://docker:docker@localhost:5432/misadventures'

  it('aceita env válido e converte PORT para número', () => {
    expect(
      validateEnv({
        PORT: '4000',
        DATABASE_URL,
        CORS_ORIGIN: 'http://localhost:4000',
      })
    ).toEqual({
      PORT: 4000,
      DATABASE_URL,
      CORS_ORIGIN: 'http://localhost:4000',
      LAB_ENABLED: 'false',
    })
  })

  it('REQ-08: LAB_ENABLED ausente vale false', () => {
    expect(validateEnv({ DATABASE_URL }).LAB_ENABLED).toBe('false')
  })

  it('aceita LAB_ENABLED=true', () => {
    expect(validateEnv({ DATABASE_URL, LAB_ENABLED: 'true' }).LAB_ENABLED).toBe(
      'true'
    )
  })

  it('rejeita LAB_ENABLED fora de true/false', () => {
    expect(() => validateEnv({ DATABASE_URL, LAB_ENABLED: 'sim' })).toThrow(
      /LAB_ENABLED/
    )
  })

  it('usa http://localhost:5173 quando CORS_ORIGIN falta', () => {
    expect(validateEnv({ DATABASE_URL }).CORS_ORIGIN).toBe(
      'http://localhost:5173'
    )
  })

  it('rejeita CORS_ORIGIN que não é URL http(s)', () => {
    expect(() =>
      validateEnv({ DATABASE_URL, CORS_ORIGIN: 'localhost' })
    ).toThrow(/CORS_ORIGIN/)
  })

  it('usa a porta 3333 quando PORT falta', () => {
    expect(validateEnv({ DATABASE_URL }).PORT).toBe(3333)
  })

  it('rejeita DATABASE_URL ausente com mensagem que cita a variável', () => {
    expect(() => validateEnv({ PORT: '3333' })).toThrow(/DATABASE_URL/)
  })

  it('rejeita DATABASE_URL que não é postgres', () => {
    expect(() =>
      validateEnv({ DATABASE_URL: 'mysql://x@localhost/db' })
    ).toThrow(/DATABASE_URL/)
  })

  it('rejeita PORT não numérica', () => {
    expect(() => validateEnv({ PORT: 'abc', DATABASE_URL })).toThrow(/PORT/)
  })
})
