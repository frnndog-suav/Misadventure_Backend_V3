import { describe, expect, it } from 'vitest'

import {
  makeAttributeCard,
  makeEquipmentCard,
  makeItemCard,
} from '../../../../../test/factories/make-card'
import { makePlayerState } from '../../../../../test/factories/make-party'
import {
  adjustFolders,
  freeFolderCopies,
  receiveAttribute,
  receiveCard,
  receiveResource,
  transferMount,
  type TMountState,
} from '.'

// T-77: espaço da montaria (REQ-159; D-144) e transferência (REQ-160; D-143).

const POTION = makeItemCard({ id: 'fixture.healing-potion' })
const SWORD = makeEquipmentCard({ id: 'fixture.short-sword' })
const STR = makeAttributeCard({ id: 'fixture.strength-basic' })
const HORSE = 'fixture.plow-horse'

const CAPS = {
  inventory: 1,
  mountInventory: 2,
  tcgFolder: 2,
  mountTcgFolder: 3,
}
const emptyMount = (over: Partial<TMountState> = {}): TMountState => ({
  cardId: HORSE,
  inventory: [],
  tcgFolder: [],
  ...over,
})

describe('receiveResource / receiveAttribute (REQ-159)', () => {
  it('REQ-159: com espaço no inventário, tudo vai a ele', () => {
    const out = receiveResource({
      inventory: [],
      mount: emptyMount(),
      card: POTION,
      quantity: 3,
      capacities: CAPS,
    })
    expect(out?.inventory).toEqual([{ cardId: POTION.id, quantity: 3 }])
    expect(out?.received).toEqual([{ space: 'inventory', quantity: 3 }])
  })

  it('REQ-159: inventário cheio → o que empilha vai inteiro ao inventário extra', () => {
    const out = receiveResource({
      inventory: [{ cardId: SWORD.id, quantity: 1 }],
      mount: emptyMount(),
      card: POTION,
      quantity: 2,
      capacities: CAPS,
    })
    expect(out?.inventory).toEqual([{ cardId: SWORD.id, quantity: 1 }])
    expect(out?.mount?.inventory).toEqual([{ cardId: POTION.id, quantity: 2 }])
    expect(out?.received).toEqual([{ space: 'mountInventory', quantity: 2 }])
  })

  it('REQ-159: equipamento enche o inventário e o resto vai à montaria; sem espaço nos dois → null', () => {
    const out = receiveResource({
      inventory: [],
      mount: emptyMount(),
      card: SWORD,
      quantity: 3,
      capacities: CAPS,
    })
    expect(out?.received).toEqual([
      { space: 'inventory', quantity: 1 },
      { space: 'mountInventory', quantity: 2 },
    ])
    expect(
      receiveResource({
        inventory: [],
        mount: emptyMount(),
        card: SWORD,
        quantity: 4,
        capacities: CAPS,
      })
    ).toBeNull()
  })

  it('REQ-159: sem montaria segue a regra antiga (não cabe → null)', () => {
    expect(
      receiveResource({
        inventory: [{ cardId: SWORD.id, quantity: 1 }],
        mount: null,
        card: POTION,
        quantity: 1,
        capacities: CAPS,
      })
    ).toBeNull()
  })

  it('REQ-159: atributo enche a pasta e o resto vai à pasta extra', () => {
    const out = receiveAttribute({
      tcgFolder: [{ cardId: STR.id, copies: 1 }],
      mount: emptyMount(),
      cardId: STR.id,
      quantity: 3,
      capacities: CAPS,
    })
    expect(out?.tcgFolder).toEqual([{ cardId: STR.id, copies: 2 }])
    expect(out?.mount?.tcgFolder).toEqual([{ cardId: STR.id, copies: 2 }])
    expect(out?.received).toEqual([
      { space: 'tcgFolder', quantity: 1 },
      { space: 'mountTcgFolder', quantity: 2 },
    ])
  })

  it('REQ-159: vagas livres somam a pasta e a pasta extra', () => {
    expect(
      freeFolderCopies({
        tcgFolder: [{ cardId: STR.id, copies: 2 }],
        mount: emptyMount({ tcgFolder: [{ cardId: STR.id, copies: 1 }] }),
        capacities: CAPS,
      })
    ).toBe(2)
  })

  it('REQ-159: receiveCard escolhe o par de espaços pelo tipo da carta', () => {
    const player = makePlayerState({
      inventory: [{ cardId: SWORD.id, quantity: 1 }],
      tcgFolder: [{ cardId: STR.id, copies: 2 }],
      mount: emptyMount(),
    })
    expect(receiveCard(player, STR, 1, CAPS)?.received).toEqual([
      { space: 'mountTcgFolder', quantity: 1 },
    ])
    expect(receiveCard(player, POTION, 1, CAPS)?.received).toEqual([
      { space: 'mountInventory', quantity: 1 },
    ])
  })
})

describe('adjustFolders (REQ-65, REQ-159)', () => {
  it('REQ-159: o que entra sai primeiro da pasta extra; o que sai vai à pasta e, cheia, à pasta extra', () => {
    const out = adjustFolders({
      oldBuild: [{ cardId: 'a', copies: 3 }],
      tcgFolder: [{ cardId: 'b', copies: 2 }],
      mountTcgFolder: [{ cardId: 'b', copies: 1 }],
      newBuild: [
        { cardId: 'a', copies: 1 },
        { cardId: 'b', copies: 1 },
      ],
      capacities: { tcgFolder: 3, mountTcgFolder: 3 },
    })
    // b entra 1 (da pasta extra); a sai 2: 1 cabe na pasta (2 + 1 = 3), 1 vai à extra.
    expect(out).toEqual({
      tcgFolder: [
        { cardId: 'a', copies: 1 },
        { cardId: 'b', copies: 2 },
      ],
      mountTcgFolder: [{ cardId: 'a', copies: 1 }],
    })
  })

  it('REQ-159: sem montaria, a pasta acima da capacidade → null', () => {
    expect(
      adjustFolders({
        oldBuild: [{ cardId: 'a', copies: 3 }],
        tcgFolder: [],
        mountTcgFolder: null,
        newBuild: [],
        capacities: { tcgFolder: 2, mountTcgFolder: 10 },
      })
    ).toBeNull()
  })
})

describe('transferMount (REQ-160; D-143)', () => {
  const caps = { ...CAPS, inventory: 2 }
  const base = {
    direction: 'toMount' as const,
    space: 'inventory' as const,
    capacities: caps,
  }

  it('REQ-160: sem montaria → noMount', () => {
    const player = makePlayerState({ mount: null })
    const out = transferMount({
      ...base,
      player,
      cardId: POTION.id,
      quantity: 1,
      card: POTION,
    })
    expect(out.value).toBe('noMount')
  })

  it('REQ-160: move as cópias que empilham; cópias insuficientes → notOwned', () => {
    const player = makePlayerState({
      inventory: [{ cardId: POTION.id, quantity: 3 }],
      mount: emptyMount(),
    })
    const out = transferMount({
      ...base,
      player,
      cardId: POTION.id,
      quantity: 2,
      card: POTION,
    })
    expect(out.isRight() && out.value.inventory).toEqual([
      { cardId: POTION.id, quantity: 1 },
    ])
    expect(out.isRight() && out.value.mount?.inventory).toEqual([
      { cardId: POTION.id, quantity: 2 },
    ])
    expect(
      transferMount({
        ...base,
        player,
        cardId: POTION.id,
        quantity: 4,
        card: POTION,
      }).value
    ).toBe('notOwned')
  })

  it('REQ-160: equipamento leva o estado; sem índice saem primeiro as de estado padrão', () => {
    const worn = {
      refinement: 2,
      enchantments: [],
      repairMarks: 0,
      broken: false,
    }
    const player = makePlayerState({
      inventory: [
        { cardId: SWORD.id, quantity: 1, equipmentState: worn },
        { cardId: SWORD.id, quantity: 1 },
      ],
      mount: emptyMount(),
    })
    const plain = transferMount({
      ...base,
      player,
      cardId: SWORD.id,
      quantity: 1,
      card: SWORD,
    })
    expect(plain.isRight() && plain.value.mount?.inventory).toEqual([
      { cardId: SWORD.id, quantity: 1 },
    ])
    const chosen = transferMount({
      ...base,
      player,
      cardId: SWORD.id,
      quantity: 1,
      inventorySlotIndex: 0,
      card: SWORD,
    })
    expect(chosen.isRight() && chosen.value.mount?.inventory).toEqual([
      { cardId: SWORD.id, quantity: 1, equipmentState: worn },
    ])
    expect(
      transferMount({
        ...base,
        player,
        cardId: SWORD.id,
        quantity: 2,
        inventorySlotIndex: 0,
        card: SWORD,
      }).value
    ).toBe('notOwned')
  })

  it('REQ-160: destino sem espaço → inventoryFull / tcgFolderFull', () => {
    const player = makePlayerState({
      inventory: [{ cardId: SWORD.id, quantity: 1 }],
      tcgFolder: [{ cardId: STR.id, copies: 2 }],
      mount: emptyMount({
        inventory: [{ cardId: POTION.id, quantity: 2 }],
        tcgFolder: [{ cardId: STR.id, copies: 1 }],
      }),
    })
    const full = { ...caps, inventory: 1, tcgFolder: 2 }
    expect(
      transferMount({
        ...base,
        direction: 'fromMount',
        player,
        cardId: POTION.id,
        quantity: 2,
        card: POTION,
        capacities: full,
      }).value
    ).toBe('inventoryFull')
    expect(
      transferMount({
        ...base,
        direction: 'fromMount',
        space: 'tcgFolder',
        player,
        cardId: STR.id,
        quantity: 1,
        card: STR,
        capacities: full,
      }).value
    ).toBe('tcgFolderFull')
  })
})
