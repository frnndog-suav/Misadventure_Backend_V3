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

  it('REQ-57: endTurn válido → a ação', () => {
    const result = parsePartyAction({ type: 'endTurn' })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) expect(result.value).toEqual({ type: 'endTurn' })
  })

  it('REQ-57: endTurn com campo a mais → unknownKey, na ordem do pedido', () => {
    const result = parsePartyAction({ type: 'endTurn', zoneId: 'a', b: 1 })

    expect(result.isLeft()).toBe(true)
    if (result.isLeft())
      expect(result.value).toEqual([
        { field: 'zoneId', reason: 'unknownKey' },
        { field: 'b', reason: 'unknownKey' },
      ])
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

  it('REQ-161: move com viaZoneId texto → a ação com viaZoneId', () => {
    const result = parsePartyAction({
      type: 'move',
      zoneId: 'a',
      viaZoneId: 'b',
    })

    expect(result.isRight()).toBe(true)
    if (result.isRight())
      expect(result.value).toEqual({
        type: 'move',
        zoneId: 'a',
        viaZoneId: 'b',
      })
  })

  it('REQ-161: viaZoneId que não é texto → notString', () => {
    const result = parsePartyAction({ type: 'move', zoneId: 'a', viaZoneId: 3 })

    expect(result.isLeft()).toBe(true)
    if (result.isLeft())
      expect(result.value).toEqual([
        { field: 'viaZoneId', reason: 'notString' },
      ])
  })

  describe('recover (REQ-64)', () => {
    it.each(['drawToHand', 'shuffleHand', 'shuffleDiscard'])(
      'REQ-64: option %s → a ação',
      (option) => {
        const result = parsePartyAction({ type: 'recover', option })

        expect(result.isRight() && result.value).toEqual({
          type: 'recover',
          option,
        })
      }
    )

    it('REQ-64: option ausente → required', () => {
      const result = parsePartyAction({ type: 'recover' })

      expect(result.isLeft() && result.value).toEqual([
        { field: 'option', reason: 'required' },
      ])
    })

    it('REQ-64: option que não é texto → notString', () => {
      const result = parsePartyAction({ type: 'recover', option: 1 })

      expect(result.isLeft() && result.value).toEqual([
        { field: 'option', reason: 'notString' },
      ])
    })

    it('REQ-64: option fora das três → unknownOption', () => {
      const result = parsePartyAction({ type: 'recover', option: 'nap' })

      expect(result.isLeft() && result.value).toEqual([
        { field: 'option', reason: 'unknownOption' },
      ])
    })

    it('REQ-64: option, depois campos a mais na ordem do pedido', () => {
      const result = parsePartyAction({
        b: 1,
        type: 'recover',
        a: 2,
        option: 'nap',
      })

      expect(result.isLeft() && result.value).toEqual([
        { field: 'option', reason: 'unknownOption' },
        { field: 'b', reason: 'unknownKey' },
        { field: 'a', reason: 'unknownKey' },
      ])
    })
  })

  describe('adjustDeck (REQ-66 item 1)', () => {
    const S = 'fixture.strength-basic'
    const E = 'fixture.endurance-basic'

    it('REQ-66: build válida → a ação, com os itens como enviados', () => {
      const build = [
        { cardId: S, copies: 29 },
        { cardId: E, copies: 31 },
      ]
      const result = parsePartyAction({ type: 'adjustDeck', build })

      expect(result.isRight() && result.value).toEqual({
        type: 'adjustDeck',
        build,
      })
    })

    it('REQ-66: build vazia é bem formada (a recusa vem depois, por tamanho)', () => {
      const result = parsePartyAction({ type: 'adjustDeck', build: [] })

      expect(result.isRight()).toBe(true)
    })

    it('REQ-66: build ausente → required; não lista → notArray', () => {
      const missing = parsePartyAction({ type: 'adjustDeck' })
      const wrong = parsePartyAction({ type: 'adjustDeck', build: {} })

      expect(missing.isLeft() && missing.value).toEqual([
        { field: 'build', reason: 'required' },
      ])
      expect(wrong.isLeft() && wrong.value).toEqual([
        { field: 'build', reason: 'notArray' },
      ])
    })

    it('REQ-66: item que não é objeto → invalidItem em build.i', () => {
      const result = parsePartyAction({
        type: 'adjustDeck',
        build: [{ cardId: S, copies: 1 }, 'x', null, [1]],
      })

      expect(result.isLeft() && result.value).toEqual([
        { field: 'build.1', reason: 'invalidItem' },
        { field: 'build.2', reason: 'invalidItem' },
        { field: 'build.3', reason: 'invalidItem' },
      ])
    })

    it('REQ-66: cardId e copies ausentes ou do tipo errado', () => {
      const result = parsePartyAction({
        type: 'adjustDeck',
        build: [{}, { cardId: 5, copies: 'a' }, { cardId: S, copies: 1.5 }],
      })

      expect(result.isLeft() && result.value).toEqual([
        { field: 'build.0.cardId', reason: 'required' },
        { field: 'build.0.copies', reason: 'required' },
        { field: 'build.1.cardId', reason: 'notString' },
        { field: 'build.1.copies', reason: 'notPositiveInteger' },
        { field: 'build.2.copies', reason: 'notPositiveInteger' },
      ])
    })

    it('REQ-66: copies 0 ou negativo → notPositiveInteger; cardId repetido → duplicateCard no segundo', () => {
      const result = parsePartyAction({
        type: 'adjustDeck',
        build: [
          { cardId: S, copies: 0 },
          { cardId: S, copies: 1 },
          { cardId: E, copies: -2 },
        ],
      })

      expect(result.isLeft() && result.value).toEqual([
        { field: 'build.0.copies', reason: 'notPositiveInteger' },
        { field: 'build.1.cardId', reason: 'duplicateCard' },
        { field: 'build.2.copies', reason: 'notPositiveInteger' },
      ])
    })

    it('REQ-66: campo a mais no item (build.i.campo) e na ação, nesta ordem', () => {
      const result = parsePartyAction({
        type: 'adjustDeck',
        extra: 1,
        build: [{ cardId: S, copies: 1, foil: true }],
      })

      expect(result.isLeft() && result.value).toEqual([
        { field: 'build.0.foil', reason: 'unknownKey' },
        { field: 'extra', reason: 'unknownKey' },
      ])
    })
  })

  describe('prepare (REQ-72 a REQ-74)', () => {
    it('REQ-72: equip válido → a ação', () => {
      const result = parsePartyAction({
        type: 'prepare',
        operation: 'equip',
        cardId: 'fixture.blade-of-dusk',
      })

      expect(result.isRight() && result.value).toEqual({
        type: 'prepare',
        operation: 'equip',
        cardId: 'fixture.blade-of-dusk',
      })
    })

    it('REQ-73: unequip válido em cada uma das 8 categorias → a ação', () => {
      for (const slot of [
        'head',
        'torso',
        'legs',
        'feet',
        'cape',
        'weapon',
        'shield',
        'accessory',
      ]) {
        const result = parsePartyAction({
          type: 'prepare',
          operation: 'unequip',
          slot,
        })
        expect(result.isRight() && result.value).toEqual({
          type: 'prepare',
          operation: 'unequip',
          slot,
        })
      }
    })

    it('REQ-74: operation ausente → required; não texto → notString; fora de equip|unequip → unknownOperation (sempre sozinho)', () => {
      expect(parsePartyAction({ type: 'prepare', cardId: 'a' }).value).toEqual([
        { field: 'operation', reason: 'required' },
      ])
      expect(
        parsePartyAction({ type: 'prepare', operation: 1, cardId: 'a' }).value
      ).toEqual([{ field: 'operation', reason: 'notString' }])
      expect(
        parsePartyAction({
          type: 'prepare',
          operation: 'use',
          cardId: 'a',
          extra: 1,
        }).value
      ).toEqual([{ field: 'operation', reason: 'unknownOperation' }])
    })

    it('REQ-74: equip — cardId ausente → required; não texto → notString', () => {
      expect(
        parsePartyAction({ type: 'prepare', operation: 'equip' }).value
      ).toEqual([{ field: 'cardId', reason: 'required' }])
      expect(
        parsePartyAction({ type: 'prepare', operation: 'equip', cardId: 7 })
          .value
      ).toEqual([{ field: 'cardId', reason: 'notString' }])
    })

    it('REQ-74: unequip — slot ausente → required; não texto → notString; fora das 8 → unknownSlot', () => {
      expect(
        parsePartyAction({ type: 'prepare', operation: 'unequip' }).value
      ).toEqual([{ field: 'slot', reason: 'required' }])
      expect(
        parsePartyAction({ type: 'prepare', operation: 'unequip', slot: 1 })
          .value
      ).toEqual([{ field: 'slot', reason: 'notString' }])
      expect(
        parsePartyAction({
          type: 'prepare',
          operation: 'unequip',
          slot: 'hands',
        }).value
      ).toEqual([{ field: 'slot', reason: 'unknownSlot' }])
    })

    it('REQ-74: campo a mais → unknownKey, na ordem do pedido', () => {
      expect(
        parsePartyAction({
          type: 'prepare',
          operation: 'equip',
          cardId: 'a',
          slot: 'head',
          foo: 1,
        }).value
      ).toEqual([
        { field: 'slot', reason: 'unknownKey' },
        { field: 'foo', reason: 'unknownKey' },
      ])
      expect(
        parsePartyAction({
          type: 'prepare',
          operation: 'unequip',
          slot: 'head',
          cardId: 'a',
        }).value
      ).toEqual([{ field: 'cardId', reason: 'unknownKey' }])
    })
  })
})
