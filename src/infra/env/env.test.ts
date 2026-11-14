import { describe, expect, it } from 'vitest'
import { validateEnv } from './env'

describe('validateEnv', () => {
  const DATABASE_URL = 'postgresql://docker:docker@localhost:5432/misadventures'

  it('aceita env válido e converte PORT para número', () => {
    expect(validateEnv({ PORT: '4000', DATABASE_URL })).toEqual({
      PORT: 4000,
      DATABASE_URL,
    })
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
