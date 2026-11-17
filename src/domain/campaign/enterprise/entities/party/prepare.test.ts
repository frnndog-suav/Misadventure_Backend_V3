import { describe, expect, it } from 'vitest'

import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import type { TEquipmentSlot } from '@/domain/catalog/enterprise/value-objects/card'
import { GAME_CONFIG_DEFAULTS } from '@/domain/lab/enterprise/value-objects/game-config/defaults'
import {
  makeEquipmentCard,
  makeItemCard,
} from '../../../../../../test/factories/make-card'
import {
  makeParty,
  makePlayerState,
} from '../../../../../../test/factories/make-party'
import { fixedClock } from '../../../../../../test/fakes/fixed-clock'

import { PartyMember, type TPlayerState } from '../party-member'

const NOW = fixedClock('2026-11-17T12:00:00.000Z').now()
const LATER = fixedClock('2026-11-17T13:00:00.000Z').now()
const MEMBER = new UniqueEntityID('member-1')

// Cartas de CONTRATO FEAT-10 (cenários).
const B = makeEquipmentCard({
  id: 'fixture.blade-of-dusk',
  modifiers: [
    { modifier: 'attack', value: 3 },
    { modifier: 'accuracy', value: 1 },
  ],
  blocksShield: true,
})
const W = makeEquipmentCard({
  id: 'fixture.short-sword',
  modifiers: [{ modifier: 'attack', value: 2 }],
})
const D = makeEquipmentCard({
  id: 'fixture.oak-shield',
  slot: 'shield',
  modifiers: [{ modifier: 'defense', value: 2 }],
})
const H = makeEquipmentCard({
  id: 'fixture.iron-helm',
  slot: 'head',
  modifiers: [{ modifier: 'defense', value: 1 }],
  peakRequirement: 50,
})
const R = makeEquipmentCard({
  id: 'fixture.arcane-wand',
  classRestriction: ['mage'],
})
const P = makeItemCard({ id: 'fixture.healing-potion' })
const CARDS = [B, W, D, H, R, P]

const slot = (cardId: string) => ({ cardId, quantity: 1 })
const filler = (n: number) =>
  Array.from({ length: n }, () => slot('fixture.pickaxe'))

function partyOf(
  player: Partial<TPlayerState> = {},
  status: 'idle' | 'inSession' = 'inSession'
) {
  const host = PartyMember.create(
    { characterName: 'Lia', kind: 'human', player: makePlayerState(player) },
    MEMBER
  )
  return makeParty({
    status,
    members: [host],
    hostMemberId: host.id,
    config: { ...GAME_CONFIG_DEFAULTS },
    savedAt: NOW,
  })
}

const equipped = (
  slots: Partial<Record<TEquipmentSlot, string>>
): TPlayerState['equipment'] => ({ ...makePlayerState().equipment, ...slots })

const playerOf = (party: ReturnType<typeof partyOf>) => party.members[0].player

describe('Party.prepare', () => {
  describe('equip (REQ-72)', () => {
    it('REQ-72: tira o slot de E do inventário, põe E no slot da categoria; gratuita; savedAt; EquipmentEquipped', () => {
      const party = partyOf({ inventory: [slot(P.id), slot(B.id)] })
      const before = party.rngState

      const result = party.prepare(
        { operation: 'equip', cardId: B.id },
        { cards: CARDS },
        LATER
      )

      expect(result.isRight()).toBe(true)
      expect(playerOf(party).inventory).toEqual([slot(P.id)])
      expect(playerOf(party).equipment.weapon).toBe(B.id)
      expect(party.turn.actionPoints).toBe(3)
      expect(party.savedAt).toEqual(LATER)
      expect(party.rngState).toEqual(before)
      const events = party.pullDomainEvents()
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        type: 'EquipmentEquipped',
        memberId: MEMBER,
        cardId: B.id,
        slot: 'weapon',
        occurredAt: LATER,
        aggregateId: party.id,
      })
    })

    it('REQ-72: o que estava no slot vai para o fim do inventário; Unequipped antes de Equipped', () => {
      const party = partyOf({
        inventory: [slot(W.id), slot(P.id)],
        equipment: equipped({ weapon: B.id }),
      })

      party.prepare(
        { operation: 'equip', cardId: W.id },
        { cards: CARDS },
        LATER
      )

      expect(playerOf(party).inventory).toEqual([slot(P.id), slot(B.id)])
      expect(playerOf(party).equipment.weapon).toBe(W.id)
      expect(party.pullDomainEvents()).toMatchObject([
        { type: 'EquipmentUnequipped', cardId: B.id, slot: 'weapon' },
        { type: 'EquipmentEquipped', cardId: W.id, slot: 'weapon' },
      ])
    })

    it('REQ-72 (5.1, J1): arma que bloqueia escudo tira o escudo; ordem arma antiga, escudo, Equipped', () => {
      const party = partyOf({
        inventory: [slot(B.id), ...filler(8)],
        equipment: equipped({ weapon: W.id, shield: D.id }),
      })

      const result = party.prepare(
        { operation: 'equip', cardId: B.id },
        { cards: CARDS },
        LATER
      )

      expect(result.isRight()).toBe(true)
      const { inventory, equipment } = playerOf(party)
      expect(inventory).toHaveLength(10)
      expect(inventory.slice(-2)).toEqual([slot(W.id), slot(D.id)])
      expect(equipment.weapon).toBe(B.id)
      expect(equipment.shield).toBeNull()
      expect(party.pullDomainEvents()).toMatchObject([
        { type: 'EquipmentUnequipped', cardId: W.id, slot: 'weapon' },
        { type: 'EquipmentUnequipped', cardId: D.id, slot: 'shield' },
        { type: 'EquipmentEquipped', cardId: B.id, slot: 'weapon' },
      ])
    })

    it('REQ-72 (J1, cenário do contrato): W e D em uso, 1 slot livre, equip B → W e D no fim, nessa ordem', () => {
      const party = partyOf({
        inventory: [slot(B.id), ...filler(8)],
        equipment: equipped({ weapon: W.id, shield: D.id }),
      })

      const result = party.prepare(
        { operation: 'equip', cardId: B.id },
        { cards: CARDS },
        LATER
      )

      expect(result.isRight()).toBe(true)
      expect(playerOf(party).inventory).toEqual([
        ...filler(8),
        slot(W.id),
        slot(D.id),
      ])
    })

    it('REQ-72: trocar por arma que não bloqueia escudo com o inventário cheio → aceito (o escudo fica)', () => {
      const party = partyOf({
        inventory: [slot(W.id), ...filler(9)],
        equipment: equipped({ weapon: B.id }),
      })

      const result = party.prepare(
        { operation: 'equip', cardId: W.id },
        { cards: CARDS },
        LATER
      )

      expect(result.isRight()).toBe(true)
      expect(playerOf(party).inventory).toHaveLength(10)
      expect(playerOf(party).equipment.weapon).toBe(W.id)
    })

    it('REQ-72 (K2): aceito com 0 pontos de ação', () => {
      const party = partyOf({ inventory: [slot(B.id)] })
      for (let i = 0; i < 3; i++) {
        party.move(
          i % 2 === 0 ? 'fixture.old-mine' : 'fixture.gray-harbor',
          LATER
        )
      }
      expect(party.turn.actionPoints).toBe(0)

      const result = party.prepare(
        { operation: 'equip', cardId: B.id },
        { cards: CARDS },
        LATER
      )

      expect(result.isRight()).toBe(true)
    })

    it('REQ-72: com 2 cópias no inventário, só uma sai (a primeira)', () => {
      const party = partyOf({
        inventory: [slot(W.id), slot(P.id), slot(W.id)],
      })

      party.prepare(
        { operation: 'equip', cardId: W.id },
        { cards: CARDS },
        LATER
      )

      expect(playerOf(party).inventory).toEqual([slot(P.id), slot(W.id)])
    })

    it('REQ-72 (8.2): classe inativa ainda equipa item restrito a ela', () => {
      const party = partyOf({
        playerClasses: [{ playerClass: 'mage', deckLockMet: false }],
        inventory: [slot(R.id)],
      })

      const result = party.prepare(
        { operation: 'equip', cardId: R.id },
        { cards: CARDS },
        LATER
      )

      expect(result.isRight()).toBe(true)
    })
  })

  describe('unequip (REQ-73)', () => {
    it('REQ-73: vai para o fim do inventário, slot null, gratuita, EquipmentUnequipped', () => {
      const party = partyOf({
        inventory: [slot(P.id)],
        equipment: equipped({ shield: D.id }),
      })

      const result = party.prepare(
        { operation: 'unequip', slot: 'shield' },
        { cards: CARDS },
        LATER
      )

      expect(result.isRight()).toBe(true)
      expect(playerOf(party).inventory).toEqual([slot(P.id), slot(D.id)])
      expect(playerOf(party).equipment.shield).toBeNull()
      expect(party.turn.actionPoints).toBe(3)
      expect(party.savedAt).toEqual(LATER)
      expect(party.pullDomainEvents()).toMatchObject([
        {
          type: 'EquipmentUnequipped',
          memberId: MEMBER,
          cardId: D.id,
          slot: 'shield',
        },
      ])
    })
  })

  describe('recusas, nesta ordem, sem mudar nada nem emitir evento (REQ-74)', () => {
    const refused = (
      player: Partial<TPlayerState>,
      operation: Parameters<ReturnType<typeof partyOf>['prepare']>[0],
      status: 'idle' | 'inSession' = 'inSession'
    ) => {
      const party = partyOf(player, status)
      const before = playerOf(party)
      const result = party.prepare(operation, { cards: CARDS }, LATER)
      expect(result.isLeft()).toBe(true)
      expect(playerOf(party)).toEqual(before)
      expect(party.savedAt).toEqual(NOW)
      expect(party.pullDomainEvents()).toEqual([])
      return result.value
    }

    it('REQ-74: grupo idle → sessionNotActive (antes da regra)', () => {
      expect(refused({}, { operation: 'equip', cardId: 'nada' }, 'idle')).toBe(
        'sessionNotActive'
      )
    })

    it('REQ-74: E fora do inventário → notInInventory', () => {
      expect(refused({}, { operation: 'equip', cardId: B.id })).toEqual({
        reason: 'notInInventory',
      })
    })

    it('REQ-74: E não é equipment (ou o catálogo não a tem) → notEquipment', () => {
      expect(
        refused(
          { inventory: [slot(P.id)] },
          { operation: 'equip', cardId: P.id }
        )
      ).toEqual({ reason: 'notEquipment' })
      expect(
        refused(
          { inventory: [slot('fixture.sumiu')] },
          { operation: 'equip', cardId: 'fixture.sumiu' }
        )
      ).toEqual({ reason: 'notEquipment' })
    })

    it('REQ-74 (7.3 item 8): peak < peakRequirement → peakRequirementNotMet (antes de classRestricted)', () => {
      const both = makeEquipmentCard({
        id: 'x.both',
        peakRequirement: 50,
        classRestriction: ['mage'],
      })
      const party = partyOf({ inventory: [slot(both.id)] })
      const result = party.prepare(
        { operation: 'equip', cardId: both.id },
        { cards: [both] },
        LATER
      )
      expect(result.value).toEqual({ reason: 'peakRequirementNotMet' })
      expect(
        refused(
          { inventory: [slot(H.id)] },
          { operation: 'equip', cardId: H.id }
        )
      ).toEqual({ reason: 'peakRequirementNotMet' })
    })

    it('REQ-74 (17.3 item 1): nenhuma classe do jogador na restrição → classRestricted', () => {
      expect(
        refused(
          { inventory: [slot(R.id)] },
          { operation: 'equip', cardId: R.id }
        )
      ).toEqual({ reason: 'classRestricted' })
    })

    it('REQ-74 (5.1): escudo com arma que bloqueia escudo em uso → shieldBlocked', () => {
      expect(
        refused(
          { inventory: [slot(D.id)], equipment: equipped({ weapon: B.id }) },
          { operation: 'equip', cardId: D.id }
        )
      ).toEqual({ reason: 'shieldBlocked' })
    })

    it('REQ-74 (J1): inventário cheio sem lugar para o escudo → inventoryFull', () => {
      expect(
        refused(
          {
            inventory: [slot(B.id), ...filler(9)],
            equipment: equipped({ weapon: W.id, shield: D.id }),
          },
          { operation: 'equip', cardId: B.id }
        )
      ).toEqual({ reason: 'inventoryFull' })
    })

    it('REQ-74: unequip de slot vazio → slotEmpty (antes de inventoryFull)', () => {
      expect(
        refused(
          { inventory: filler(10) },
          { operation: 'unequip', slot: 'head' }
        )
      ).toEqual({ reason: 'slotEmpty' })
    })

    it('REQ-74: unequip com inventário cheio → inventoryFull', () => {
      expect(
        refused(
          { inventory: filler(10), equipment: equipped({ head: H.id }) },
          { operation: 'unequip', slot: 'head' }
        )
      ).toEqual({ reason: 'inventoryFull' })
    })
  })
})
