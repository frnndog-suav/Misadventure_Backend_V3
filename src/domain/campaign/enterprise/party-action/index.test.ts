import { describe, expect, it } from 'vitest'

import { parsePartyAction } from '.'

describe('parsePartyAction', () => {
  it('REQ-51: move válido → a ação', () => {
    const result = parsePartyAction({
      type: 'move',
      zoneId: 'fixture.old-mine',
    })

    expect(result.isRight()).toBe(true)
    if (result.isRight())
      expect(result.value).toEqual({ type: 'move', zoneId: 'fixture.old-mine' })
  })

  it.each([
    ['array', [1]],
    ['texto', 'move'],
    ['número', 3],
    ['null', null],
    ['undefined', undefined],
  ])('REQ-53: corpo %s → invalidBody', (_name, body) => {
    const result = parsePartyAction(body)

    expect(result.isLeft()).toBe(true)
    if (result.isLeft())
      expect(result.value).toEqual([{ field: null, reason: 'invalidBody' }])
  })

  it('REQ-53: type ausente → required (e só ele)', () => {
    const result = parsePartyAction({})

    expect(result.isLeft()).toBe(true)
    if (result.isLeft())
      expect(result.value).toEqual([{ field: 'type', reason: 'required' }])
  })

  it('REQ-53: type que não é texto → notString', () => {
    const result = parsePartyAction({ type: 3, zoneId: 'a' })

    expect(result.isLeft()).toBe(true)
    if (result.isLeft())
      expect(result.value).toEqual([{ field: 'type', reason: 'notString' }])
  })

  it('REQ-53: type desconhecido → unknownAction (só ele, o resto não é conferido)', () => {
    const result = parsePartyAction({ type: 'fly', zoneId: 3, speed: 2 })

    expect(result.isLeft()).toBe(true)
    if (result.isLeft())
      expect(result.value).toEqual([{ field: 'type', reason: 'unknownAction' }])
  })

  it('REQ-53: move sem zoneId → required', () => {
    const result = parsePartyAction({ type: 'move' })

    expect(result.isLeft()).toBe(true)
    if (result.isLeft())
      expect(result.value).toEqual([{ field: 'zoneId', reason: 'required' }])
  })

  it('REQ-53: zoneId que não é texto → notString', () => {
    const result = parsePartyAction({ type: 'move', zoneId: 3 })

    expect(result.isLeft()).toBe(true)
    if (result.isLeft())
      expect(result.value).toEqual([{ field: 'zoneId', reason: 'notString' }])
  })

  it('REQ-53: campo a mais → unknownKey no próprio campo', () => {
    const result = parsePartyAction({ type: 'move', zoneId: 'a', speed: 2 })

    expect(result.isLeft()).toBe(true)
    if (result.isLeft())
      expect(result.value).toEqual([{ field: 'speed', reason: 'unknownKey' }])
  })

  it('REQ-53: problemas juntos, na ordem type, zoneId, campos a mais na ordem do pedido', () => {
    const result = parsePartyAction({ b: 1, type: 'move', a: 2, zoneId: 3 })

    expect(result.isLeft()).toBe(true)
    if (result.isLeft())
      expect(result.value).toEqual([
        { field: 'zoneId', reason: 'notString' },
        { field: 'b', reason: 'unknownKey' },
        { field: 'a', reason: 'unknownKey' },
      ])
  })

  it('REQ-53: zoneId vazio é texto; a zona fora do mapa é recusada depois (REQ-52)', () => {
    const result = parsePartyAction({ type: 'move', zoneId: '' })

    expect(result.isRight()).toBe(true)
  })
})
