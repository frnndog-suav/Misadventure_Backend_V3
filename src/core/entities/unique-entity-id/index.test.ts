import { describe, expect, it } from 'vitest'

import { UniqueEntityID } from '.'

describe('UniqueEntityID', () => {
  it('guarda o valor recebido (não gera)', () => {
    const id = new UniqueEntityID('abc')

    expect(id.toString()).toBe('abc')
    expect(id.toValue()).toBe('abc')
  })

  it('compara pelo valor', () => {
    expect(new UniqueEntityID('a').equals(new UniqueEntityID('a'))).toBe(true)
    expect(new UniqueEntityID('a').equals(new UniqueEntityID('b'))).toBe(false)
  })
})
