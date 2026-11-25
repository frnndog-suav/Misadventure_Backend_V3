import { describe, expect, it } from 'vitest'

import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import {
  PartyMember,
  type TPlayerState,
} from '@/domain/campaign/enterprise/entities/party-member'
import type { TCard } from '@/domain/catalog/enterprise/value-objects/card'
import { GAME_CONFIG_DEFAULTS } from '@/domain/lab/enterprise/value-objects/game-config/defaults'
import {
  makeEquipmentCard,
  makeMountCard,
  makeWarPonyCard,
} from '../../../../../test/factories/make-card'
import {
  makeParty,
  makePlayerState,
} from '../../../../../test/factories/make-party'

import { PartyPresenter } from '.'

// T-75: projeção da montaria (REQ-157; CONTRATO FEAT-18 `MountState`, v0.89 origem `mount`).

const PONY = makeWarPonyCard()
// Montaria com passivo (+4 de Ataque enquanto em uso); README 26: vale como equipamento em uso.
const STEED = makeMountCard({
  id: 'fixture.test-steed',
  effects: [
    {
      text: '+4 de Ataque.',
      trigger: null,
      cost: [],
      activation: [
        { kind: 'modifierFlat', changes: [{ modifier: 'attack', amount: 4 }] },
      ],
      duration: { kind: 'whileSourceActive' },
      mark: 'buff',
    },
  ],
})
// Equipamento com bônus e efeito ativável: no inventário extra não funciona (README 5.1; D-150 c).
const SWORD = makeEquipmentCard({
  id: 'fixture.short-sword',
  modifiers: [{ modifier: 'attack', value: 12 }],
  refinement: { maxLevel: 10, materials: [] },
  effects: [
    {
      text: 'Ganhe 1 de ouro.',
      trigger: null,
      cost: [{ kind: 'spendVigor', amount: 1 }],
      activation: [{ kind: 'gainGold', amount: 1 }],
      duration: { kind: 'immediate' },
      mark: null,
    },
  ],
})
const CARDS = new Map<string, TCard>([
  [PONY.id, PONY],
  [STEED.id, STEED],
  [SWORD.id, SWORD],
])

const swordState = {
  refinement: 3,
  enchantments: [],
  repairMarks: 1,
  broken: false,
}

function present(
  overrides: Partial<TPlayerState> & { mount?: unknown },
  config: Partial<typeof GAME_CONFIG_DEFAULTS> = {}
) {
  const host = PartyMember.create(
    {
      characterName: 'Lia',
      kind: 'human',
      player: makePlayerState(overrides as Partial<TPlayerState>),
    },
    new UniqueEntityID('member-1')
  )
  const party = makeParty({
    status: 'inSession',
    members: [host],
    hostMemberId: host.id,
    turn: { round: 1, memberId: host.id, actionPoints: 3 },
    config: { ...GAME_CONFIG_DEFAULTS, ...config },
  })
  return PartyPresenter.toHTTP(party, CARDS, []).members[0]
    .player as ReturnType<
    typeof PartyPresenter.toHTTP
  >['members'][number]['player'] & {
    mount?: unknown
  }
}

describe('PartyPresenter — MountState (REQ-157)', () => {
  it('REQ-157: sem montaria → mount: null', () => {
    expect(present({}).mount).toBeNull()
  })

  it('REQ-157: com montaria → cardId, inventário extra, pasta extra e capacidades do laboratório (a expansão da pasta não altera)', () => {
    const player = present(
      {
        mount: {
          cardId: PONY.id,
          inventory: [],
          tcgFolder: [{ cardId: 'fixture.strength-basic', copies: 2 }],
        },
        expansions: {
          vaultSlots: 0,
          deckSlots: 0,
          tcgFolder: 2,
          purse: 0,
          vaultGold: 0,
        },
      },
      { mountInventorySlots: 3, mountFolderCapacity: 7 }
    )

    expect(player.mount).toEqual({
      cardId: PONY.id,
      inventory: [],
      inventoryCapacity: 3,
      tcgFolder: [{ cardId: 'fixture.strength-basic', copies: 2 }],
      tcgFolderCapacity: 7,
    })
  })

  it('REQ-157: equipamento no inventário extra vem com equipmentState, como no inventário', () => {
    const slot = { cardId: SWORD.id, quantity: 1, equipmentState: swordState }
    const inMount = present({
      mount: { cardId: PONY.id, inventory: [slot], tcgFolder: [] },
    })
    const inInventory = present({ inventory: [slot] })

    expect((inMount.mount as { inventory: unknown[] }).inventory).toEqual(
      inInventory.inventory
    )
    expect(
      (inMount.mount as { inventory: { equipmentState?: unknown }[] })
        .inventory[0].equipmentState
    ).toMatchObject({ refinement: 3, repairMarks: 1, broken: false })
  })
})

describe('PartyPresenter — montaria como recurso em uso (REQ-157, D-148)', () => {
  it('REQ-157: passivo da montaria entra em effectiveModifiers, sem requisito de Pico', () => {
    const without = present({ peak: 0 })
    const withSteed = present({
      peak: 0,
      mount: { cardId: STEED.id, inventory: [], tcgFolder: [] },
    })

    expect(withSteed.effectiveModifiers.attack).toBe(
      without.effectiveModifiers.attack + 4
    )
  })

  it('D-150(c): equipamento no inventário extra não conta em effectiveModifiers nem em activatableEffects', () => {
    const without = present({})
    const withSword = present({
      mount: {
        cardId: PONY.id,
        inventory: [
          { cardId: SWORD.id, quantity: 1, equipmentState: swordState },
        ],
        tcgFolder: [],
      },
    })

    expect(withSword.effectiveModifiers).toEqual(without.effectiveModifiers)
    expect(withSword.activatableEffects).not.toContainEqual(
      expect.objectContaining({ cardId: SWORD.id })
    )
  })

  it("REQ-157: activatableEffects traz o efeito da montaria com source 'mount'", () => {
    const player = present({
      gold: 10,
      mount: { cardId: PONY.id, inventory: [], tcgFolder: [] },
    })

    expect(player.activatableEffects).toEqual([
      { cardId: PONY.id, effectIndex: 0, source: 'mount', handPayment: null },
    ])
  })

  it('REQ-157: usableAbilities traz a habilidade da montaria com mountAbility: true e sem equipmentSlot', () => {
    const player = present({
      mount: { cardId: PONY.id, inventory: [], tcgFolder: [] },
    })

    expect(player.usableAbilities).toEqual([
      expect.objectContaining({ abilityId: 'pony-rest', mountAbility: true }),
    ])
    expect(player.usableAbilities[0]).not.toHaveProperty('equipmentSlot')
  })

  it('REQ-157: sem montaria, nada da montaria aparece', () => {
    const player = present({ gold: 10 })

    expect(player.activatableEffects).toEqual([])
    expect(player.usableAbilities).toEqual([])
  })
})
