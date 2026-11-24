import { describe, expect, it } from 'vitest'

import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import type { TEquipmentSlot } from '@/domain/catalog/enterprise/value-objects/card'
import { GAME_CONFIG_DEFAULTS } from '@/domain/lab/enterprise/value-objects/game-config/defaults'
import {
  makeAttributeCard,
  makeClassDefinition,
  makeEquipmentCard,
} from '../../../../../../test/factories/make-card'
import {
  makeParty,
  makePlayerState,
} from '../../../../../../test/factories/make-party'
import { fixedClock } from '../../../../../../test/fakes/fixed-clock'

import {
  DEFAULT_EQUIPMENT_STATE,
  type TEquipmentState,
} from '../../equipment-state'
import { PartyMember, type TPlayerState } from '../party-member'
import type { Party } from '.'

const NOW = fixedClock('2026-11-24T12:00:00.000Z').now()
const LATER = fixedClock('2026-11-24T13:00:00.000Z').now()
const MEMBER = new UniqueEntityID('member-1')

const SWORD = makeEquipmentCard({
  id: 'fixture.short-sword',
  modifiers: [{ modifier: 'attack', value: 2 }],
})
const BLADE = makeEquipmentCard({
  id: 'fixture.blade-of-dusk',
  blocksShield: true,
})
const SHIELD = makeEquipmentCard({ id: 'fixture.oak-shield', slot: 'shield' })
const STR = makeAttributeCard({ id: 'fixture.strength-basic' })
const CARDS = [SWORD, BLADE, SHIELD, STR]

const refined: TEquipmentState = {
  ...DEFAULT_EQUIPMENT_STATE,
  refinement: 3,
  repairMarks: 1,
}
const broken: TEquipmentState = {
  ...DEFAULT_EQUIPMENT_STATE,
  refinement: 2,
  broken: true,
}

function partyOf(player: Partial<TPlayerState> = {}): Party {
  const host = PartyMember.create(
    { characterName: 'Lia', kind: 'human', player: makePlayerState(player) },
    MEMBER
  )
  return makeParty({
    status: 'inSession',
    members: [host],
    hostMemberId: host.id,
    config: { ...GAME_CONFIG_DEFAULTS },
    savedAt: NOW,
  })
}
const playerOf = (party: Party) => party.members[0].player
const worn = (slots: Partial<Record<TEquipmentSlot, string>>) => ({
  ...makePlayerState().equipment,
  ...slots,
})
const slotOf = (cardId: string, equipmentState?: TEquipmentState) => ({
  cardId,
  quantity: 1,
  ...(equipmentState && { equipmentState }),
})

describe('estado do equipamento acompanha a cópia (REQ-147)', () => {
  describe('equipar e desequipar', () => {
    it('REQ-147: equipar uma cópia refinada põe o estado no slot em uso; cópia padrão não grava nada', () => {
      const party = partyOf({ inventory: [slotOf(SWORD.id, refined)] })

      party.prepare(
        { operation: 'equip', cardId: SWORD.id },
        { cards: CARDS },
        LATER
      )

      expect(playerOf(party).equipmentStates).toEqual({
        weapon: {
          refinement: 3,
          enchantments: [],
          repairMarks: 1,
        },
      })
      expect(playerOf(party).brokenEquipment ?? []).toEqual([])
      expect(playerOf(party).inventory).toEqual([])

      const plain = partyOf({ inventory: [slotOf(SWORD.id)] })
      plain.prepare(
        { operation: 'equip', cardId: SWORD.id },
        { cards: CARDS },
        LATER
      )
      expect(playerOf(plain).equipmentStates ?? {}).toEqual({})
    })

    it('REQ-147: equipar uma cópia quebrada marca o slot em brokenEquipment', () => {
      const party = partyOf({ inventory: [slotOf(SWORD.id, broken)] })

      party.prepare(
        { operation: 'equip', cardId: SWORD.id },
        { cards: CARDS },
        LATER
      )

      expect(playerOf(party).brokenEquipment).toEqual(['weapon'])
      expect(playerOf(party).equipmentStates?.weapon?.refinement).toBe(2)
    })

    it('REQ-147: desequipar leva o estado (inclusive quebrado) para o slot do inventário e limpa o slot', () => {
      const party = partyOf({
        equipment: worn({ weapon: SWORD.id }),
        equipmentStates: {
          weapon: { refinement: 3, enchantments: [], repairMarks: 1 },
        },
        brokenEquipment: ['weapon'],
      })

      party.prepare(
        { operation: 'unequip', slot: 'weapon' },
        { cards: CARDS },
        LATER
      )

      expect(playerOf(party).inventory).toEqual([
        slotOf(SWORD.id, { ...refined, broken: true }),
      ])
      expect(playerOf(party).equipmentStates ?? {}).toEqual({})
      expect(playerOf(party).brokenEquipment ?? []).toEqual([])
    })

    it('REQ-147: equipar sobre outro leva o antigo, com o estado dele, ao inventário; o novo entra com o seu', () => {
      const party = partyOf({
        inventory: [slotOf(BLADE.id, refined)],
        equipment: worn({ weapon: SWORD.id }),
        equipmentStates: {
          weapon: { refinement: 1, enchantments: [], repairMarks: 0 },
        },
      })

      party.prepare(
        { operation: 'equip', cardId: BLADE.id },
        { cards: CARDS },
        LATER
      )

      expect(playerOf(party).inventory).toEqual([
        slotOf(SWORD.id, { ...DEFAULT_EQUIPMENT_STATE, refinement: 1 }),
      ])
      expect(playerOf(party).equipmentStates?.weapon?.refinement).toBe(3)
    })

    it('REQ-147: a arma que bloqueia escudo manda o escudo em uso, com o estado dele, ao inventário', () => {
      const party = partyOf({
        inventory: [slotOf(BLADE.id)],
        equipment: worn({ shield: SHIELD.id }),
        equipmentStates: {
          shield: { refinement: 2, enchantments: [], repairMarks: 0 },
        },
        brokenEquipment: ['shield'],
      })

      party.prepare(
        { operation: 'equip', cardId: BLADE.id },
        { cards: CARDS },
        LATER
      )

      expect(playerOf(party).inventory).toEqual([
        slotOf(SHIELD.id, {
          ...DEFAULT_EQUIPMENT_STATE,
          refinement: 2,
          broken: true,
        }),
      ])
      expect(playerOf(party).equipmentStates ?? {}).toEqual({})
      expect(playerOf(party).brokenEquipment ?? []).toEqual([])
    })
  })

  describe('cofre', () => {
    const catalog = {
      cards: CARDS,
      classes: [makeClassDefinition()],
      zoneActions: ['useVault' as const],
    }

    it('REQ-147: guardar leva o estado ao cofre; cópias padrão empilham e a de estado diferente ocupa slot próprio', () => {
      const party = partyOf({
        inventory: [
          slotOf(SWORD.id),
          slotOf(SWORD.id, refined),
          slotOf(SWORD.id),
        ],
      })

      const result = party.useVault(
        [{ operation: 'store', cardId: SWORD.id, quantity: 3 }],
        catalog,
        LATER
      )

      expect(result.isRight()).toBe(true)
      expect(playerOf(party).inventory).toEqual([])
      expect(playerOf(party).vault.slots).toEqual([
        { cardId: SWORD.id, quantity: 2 },
        slotOf(SWORD.id, refined),
      ])
    })

    it('REQ-147: retirar devolve primeiro as cópias de estado padrão e depois as demais, cada uma com o seu estado', () => {
      const party = partyOf({
        vault: {
          slots: [slotOf(SWORD.id, refined), { cardId: SWORD.id, quantity: 2 }],
          decks: [],
          gold: 0,
        },
      })

      const result = party.useVault(
        [{ operation: 'take', cardId: SWORD.id, quantity: 3 }],
        catalog,
        LATER
      )

      expect(result.isRight()).toBe(true)
      expect(playerOf(party).vault.slots).toEqual([])
      expect(playerOf(party).inventory).toEqual([
        slotOf(SWORD.id),
        slotOf(SWORD.id),
        slotOf(SWORD.id, refined),
      ])
    })

    it('REQ-147: guardar só uma das cópias leva a de estado padrão e deixa a refinada no inventário', () => {
      const party = partyOf({
        inventory: [slotOf(SWORD.id, refined), slotOf(SWORD.id)],
      })

      party.useVault(
        [{ operation: 'store', cardId: SWORD.id, quantity: 1 }],
        catalog,
        LATER
      )

      expect(playerOf(party).inventory).toEqual([slotOf(SWORD.id, refined)])
      expect(playerOf(party).vault.slots).toEqual([
        { cardId: SWORD.id, quantity: 1 },
      ])
    })
  })
})
