import { describe, expect, it } from 'vitest'

import { UniqueEntityID } from '../unique-entity-id'
import { Entity } from '.'

class Thing extends Entity<{ name: string }> {
  static create(name: string, id: UniqueEntityID) {
    return new Thing({ name }, id)
  }

  get name() {
    return this.props.name
  }
}

describe('Entity', () => {
  it('expõe o id e as props', () => {
    const thing = Thing.create('lia', new UniqueEntityID('1'))

    expect(thing.id.toString()).toBe('1')
    expect(thing.name).toBe('lia')
  })

  it('é igual a outra entidade só pelo id', () => {
    const a = Thing.create('lia', new UniqueEntityID('1'))
    const b = Thing.create('outra', new UniqueEntityID('1'))
    const c = Thing.create('lia', new UniqueEntityID('2'))

    expect(a.equals(a)).toBe(true)
    expect(a.equals(b)).toBe(true)
    expect(a.equals(c)).toBe(false)
  })
})
