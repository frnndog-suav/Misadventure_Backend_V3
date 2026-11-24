import { describe, expect, it } from 'vitest'

import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { PartyMember } from '@/domain/campaign/enterprise/entities/party-member'
import type { TBlacksmithEnchantment } from '@/domain/catalog/enterprise/value-objects/card'
import { GAME_CONFIG_DEFAULTS } from '@/domain/lab/enterprise/value-objects/game-config/defaults'
import { makeEquipmentCard } from '../../../../../test/factories/make-card'
import {
  makeParty,
  makePlayerState,
} from '../../../../../test/factories/make-party'

import { PartyPresenter } from '.'

const SWORD = makeEquipmentCard({
  id: 'fixture.short-sword',
  modifiers: [{ modifier: 'attack', value: 12 }],
  refinement: { maxLevel: 10, materials: [] },
  enchantment: { slots: [{ kind: 'element', minRefinement: 2 }] },
})
const HELM = makeEquipmentCard({ id: 'fixture.iron-helm', slot: 'head' })
const CARDS = new Map([
  [SWORD.id, SWORD],
  [HELM.id, HELM],
])
const EMBER: TBlacksmithEnchantment = {
  id: 'ember-edge',
  name: 'Fio de Brasa',
  kind: 'element',
  element: 'fire',
  bonusPercent: 10,
  materials: [],
}

function playerOf(overrides: Parameters<typeof makePlayerState>[0]) {
  const host = PartyMember.create(
    {
      characterName: 'Lia',
      kind: 'human',
      player: makePlayerState(overrides),
    },
    new UniqueEntityID('member-1')
  )
  const party = makeParty({
    status: 'inSession',
    members: [host],
    hostMemberId: host.id,
    config: { ...GAME_CONFIG_DEFAULTS },
  })
  return PartyPresenter.toHTTP(party, CARDS, []).members[0].player
}

describe('PartyPresenter — estado do equipamento (REQ-147, REQ-148)', () => {
  it('REQ-147: equipmentStates traz o estado de cada slot em uso e null onde não há equipamento', () => {
    const player = playerOf({
      equipment: { ...makePlayerState().equipment, weapon: SWORD.id },
    })

    expect(player.equipmentStates.weapon).toEqual({
      refinement: 0,
      enchantments: [],
      repairMarks: 0,
      broken: false,
    })
    expect(player.equipmentStates.head).toBeNull()
  })

  it('REQ-147: o quebrado vem de brokenEquipment e cada encantamento traz `active`', () => {
    const player = playerOf({
      equipment: {
        ...makePlayerState().equipment,
        weapon: SWORD.id,
        head: HELM.id,
      },
      equipmentStates: {
        weapon: {
          refinement: 1,
          enchantments: [
            { enchantment: EMBER, zoneId: 'z', slotIndex: 0 },
            { enchantment: EMBER, zoneId: 'z', slotIndex: null },
          ],
          repairMarks: 2,
        },
      },
      brokenEquipment: ['head'],
    })

    expect(player.equipmentStates.head).toMatchObject({ broken: true })
    expect(player.equipmentStates.weapon).toMatchObject({
      refinement: 1,
      repairMarks: 2,
      broken: false,
    })
    expect(
      player.equipmentStates.weapon?.enchantments.map(({ active }) => active)
    ).toEqual([false, true])
  })

  it('REQ-147: o inventário e o cofre trazem equipmentState só no equipamento (padrão preenchido)', () => {
    const player = playerOf({
      inventory: [
        { cardId: SWORD.id, quantity: 1 },
        {
          cardId: SWORD.id,
          quantity: 1,
          equipmentState: {
            refinement: 3,
            enchantments: [{ enchantment: EMBER, zoneId: 'z', slotIndex: 0 }],
            repairMarks: 0,
            broken: false,
          },
        },
        { cardId: 'fixture.healing-potion', quantity: 4 },
      ],
      vault: {
        slots: [{ cardId: HELM.id, quantity: 2 }],
        decks: [],
        gold: 0,
      },
    })

    expect(player.inventory[0].equipmentState).toEqual({
      refinement: 0,
      enchantments: [],
      repairMarks: 0,
      broken: false,
    })
    expect(player.inventory[1].equipmentState?.enchantments[0]).toMatchObject({
      zoneId: 'z',
      slotIndex: 0,
      active: true,
    })
    expect(player.inventory[2]).toEqual({
      cardId: 'fixture.healing-potion',
      quantity: 4,
    })
    expect(player.vault.slots[0].equipmentState).toMatchObject({
      refinement: 0,
      broken: false,
    })
  })

  it('REQ-148: effectiveModifiers inclui o refino (+12 Ataque em +5 → +15)', () => {
    const base = playerOf({
      peak: 0,
      equipment: { ...makePlayerState().equipment, weapon: SWORD.id },
    })
    const refined = playerOf({
      peak: 0,
      equipment: { ...makePlayerState().equipment, weapon: SWORD.id },
      equipmentStates: {
        weapon: { refinement: 5, enchantments: [], repairMarks: 0 },
      },
    })

    expect(
      refined.effectiveModifiers.attack - base.effectiveModifiers.attack
    ).toBe(3)
  })
})
