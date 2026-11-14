import { describe, expect, it } from 'vitest'

import type {
  TCard,
  TCollection,
} from '@/domain/catalog/enterprise/value-objects/card'
import {
  makeAttributeCard,
  makeCollection,
  makeCombatEventCard,
  makeEnemy,
  makeEquipmentCard,
  makeItemCard,
  makeRandomEventCard,
  makeUrbanZoneCard,
  makeZoneCard,
} from '../../../../../test/factories/make-card'

import { checkCatalogIntegrity } from '.'

function check(
  cards: TCard[],
  collections: TCollection[] = [makeCollection()]
) {
  return checkCatalogIntegrity({ collections, cards })
}

describe('checkCatalogIntegrity', () => {
  it('REQ-15: catálogo válido com uma carta de cada tipo não tem problemas', () => {
    expect(
      check([
        makeZoneCard(),
        makeUrbanZoneCard(),
        makeAttributeCard(),
        makeEquipmentCard(),
        makeItemCard(),
        makeRandomEventCard(),
        makeCombatEventCard(),
      ])
    ).toEqual([])
  })

  describe('ids e coleções', () => {
    it('REQ-15: id de coleção repetido', () => {
      expect(check([], [makeCollection(), makeCollection()])).toEqual([
        {
          collectionId: 'fixture',
          cardId: null,
          field: 'id',
          reason: 'duplicateId',
        },
      ])
    })

    it('REQ-15: id de carta repetido em todo o catálogo', () => {
      expect(check([makeItemCard(), makeItemCard()])).toEqual([
        {
          collectionId: 'fixture',
          cardId: 'fixture.healing-potion',
          field: 'id',
          reason: 'duplicateId',
        },
      ])
    })

    it('REQ-15: carta de coleção inexistente', () => {
      expect(
        check([
          makeItemCard({ id: 'other.healing-potion', collectionId: 'other' }),
        ])
      ).toEqual([
        {
          collectionId: 'other',
          cardId: 'other.healing-potion',
          field: 'collectionId',
          reason: 'unknownCollection',
        },
      ])
    })

    it('REQ-15/D-22: id de coleção fora de kebab-case (sem ponto)', () => {
      for (const id of ['my.collection', 'My_Collection', 'col-', '']) {
        expect(check([], [makeCollection({ id })])).toEqual([
          {
            collectionId: id,
            cardId: null,
            field: 'id',
            reason: 'invalidIdFormat',
          },
        ])
      }
    })

    it('D-22: id de carta fora da forma <coleção>.<slug-kebab>', () => {
      for (const id of [
        'healing-potion',
        'other.healing-potion',
        'fixture.Healing_Potion',
      ]) {
        expect(check([makeItemCard({ id })])).toContainEqual({
          collectionId: 'fixture',
          cardId: id,
          field: 'id',
          reason: 'invalidIdFormat',
        })
      }
    })
  })

  describe('zona (README 3.4)', () => {
    it('REQ-15: título repetido na mesma coleção', () => {
      expect(
        check([makeZoneCard(), makeZoneCard({ id: 'fixture.other-grove' })])
      ).toEqual([
        {
          collectionId: 'fixture',
          cardId: 'fixture.other-grove',
          field: 'title',
          reason: 'duplicateTitle',
        },
      ])
    })

    it('REQ-15: título igual em coleções diferentes é permitido', () => {
      expect(
        check(
          [
            makeZoneCard(),
            makeZoneCard({
              id: 'other.whispering-grove',
              collectionId: 'other',
            }),
          ],
          [makeCollection(), makeCollection({ id: 'other', name: 'Outra' })]
        )
      ).toEqual([])
    })

    it('REQ-15: setas de conexão fora de 1 a 4', () => {
      for (const connectionArrows of [0, 5, 1.5]) {
        expect(check([makeZoneCard({ connectionArrows })])).toEqual([
          {
            collectionId: 'fixture',
            cardId: 'fixture.whispering-grove',
            field: 'connectionArrows',
            reason: 'outOfRange',
          },
        ])
      }
    })

    it('REQ-15: zona urbana sem as 4 setas', () => {
      expect(check([makeUrbanZoneCard({ connectionArrows: 3 })])).toEqual([
        {
          collectionId: 'fixture',
          cardId: 'fixture.gray-harbor',
          field: 'connectionArrows',
          reason: 'urbanZoneRequiresFourArrows',
        },
      ])
    })

    it('REQ-15: zona sem Iniciar evento', () => {
      expect(check([makeZoneCard({ zoneActions: ['scavenge'] })])).toEqual([
        {
          collectionId: 'fixture',
          cardId: 'fixture.whispering-grove',
          field: 'zoneActions.startEvent',
          reason: 'missingRequiredAction',
        },
      ])
    })

    it('REQ-15: zona urbana sem Usar cofre e Salvar ponto de respawn', () => {
      expect(
        check([makeUrbanZoneCard({ zoneActions: ['startEvent'] })])
      ).toEqual([
        {
          collectionId: 'fixture',
          cardId: 'fixture.gray-harbor',
          field: 'zoneActions.useVault',
          reason: 'missingRequiredAction',
        },
        {
          collectionId: 'fixture',
          cardId: 'fixture.gray-harbor',
          field: 'zoneActions.saveRespawnPoint',
          reason: 'missingRequiredAction',
        },
      ])
    })

    it('REQ-15: Salvar ponto de respawn fora de zona urbana', () => {
      expect(
        check([
          makeZoneCard({ zoneActions: ['startEvent', 'saveRespawnPoint'] }),
        ])
      ).toEqual([
        {
          collectionId: 'fixture',
          cardId: 'fixture.whispering-grove',
          field: 'zoneActions.saveRespawnPoint',
          reason: 'actionOnlyInUrbanZone',
        },
      ])
    })
  })

  describe('atributo (README 4.3)', () => {
    const issue = (field: string, reason: string) => ({
      collectionId: 'fixture',
      cardId: 'fixture.strength-basic',
      field,
      reason,
    })

    it('REQ-15: básica com número de atributos diferente de 1', () => {
      expect(
        check([makeAttributeCard({ attributes: ['strength', 'luck'] })])
      ).toEqual([issue('attributes', 'wrongAttributeCount')])
    })

    it('REQ-15: aprimorada com número de atributos diferente de 1', () => {
      expect(
        check([
          makeAttributeCard({
            attributeKind: 'enhanced',
            attributes: [],
            effects: [{ text: 'Ao ser paga, compre 1 carta.' }],
          }),
        ])
      ).toEqual([issue('attributes', 'wrongAttributeCount')])
    })

    it('REQ-15: sinérgica fora de 2 a 4 atributos', () => {
      for (const attributes of [
        ['strength'],
        ['strength', 'luck', 'wisdom', 'charisma', 'spirit'],
      ] as const) {
        expect(
          check([makeAttributeCard({ attributeKind: 'synergy', attributes })])
        ).toEqual([issue('attributes', 'wrongAttributeCount')])
      }
    })

    it('REQ-15: sinérgica com atributo repetido', () => {
      expect(
        check([
          makeAttributeCard({
            attributeKind: 'synergy',
            attributes: ['strength', 'strength'],
          }),
        ])
      ).toEqual([issue('attributes', 'duplicateValue')])
    })

    it('REQ-15: básica ou sinérgica com efeito', () => {
      expect(check([makeAttributeCard({ effects: [{ text: 'x' }] })])).toEqual([
        issue('effects', 'effectsNotAllowed'),
      ])
      expect(
        check([
          makeAttributeCard({
            attributeKind: 'synergy',
            attributes: ['strength', 'luck'],
            effects: [{ text: 'x' }],
          }),
        ])
      ).toEqual([issue('effects', 'effectsNotAllowed')])
    })

    it('REQ-15: aprimorada sem efeito', () => {
      expect(check([makeAttributeCard({ attributeKind: 'enhanced' })])).toEqual(
        [issue('effects', 'effectsRequired')]
      )
    })
  })

  describe('equipamento (README 5.1)', () => {
    const issue = (field: string, reason: string) => ({
      collectionId: 'fixture',
      cardId: 'fixture.blade-of-dusk',
      field,
      reason,
    })

    it('REQ-15: bloqueia escudo fora de arma', () => {
      expect(
        check([makeEquipmentCard({ slot: 'torso', blocksShield: true })])
      ).toEqual([issue('blocksShield', 'onlyForWeapons')])
    })

    it('REQ-15: ajuste de preço fora de ×0,8 a ×1,5', () => {
      for (const priceMultiplier of [0.79, 1.51, Number.NaN]) {
        expect(check([makeEquipmentCard({ priceMultiplier })])).toEqual([
          issue('priceMultiplier', 'outOfRange'),
        ])
      }
      for (const priceMultiplier of [0.8, 1.5]) {
        expect(check([makeEquipmentCard({ priceMultiplier })])).toEqual([])
      }
    })

    it('REQ-15: refino máximo fora de 1 a 10', () => {
      for (const maxLevel of [0, 11, 2.5]) {
        expect(
          check([
            makeEquipmentCard({
              refinement: { maxLevel, materials: { text: '1 minério' } },
            }),
          ])
        ).toEqual([issue('refinement.maxLevel', 'outOfRange')])
      }
    })

    it('REQ-15: refinável sem materiais de refino', () => {
      expect(
        check([
          makeEquipmentCard({
            refinement: { maxLevel: 5, materials: { text: '  ' } },
          }),
        ])
      ).toEqual([issue('refinement.materials', 'empty')])
    })

    it('REQ-15: etiqueta repetida', () => {
      expect(
        check([makeEquipmentCard({ tags: ['Espada', 'Espada'] })])
      ).toEqual([issue('tags', 'duplicateValue')])
    })
  })

  describe('item (README 5.2)', () => {
    it('REQ-15: etiqueta repetida', () => {
      expect(check([makeItemCard({ tags: ['Poção', 'Poção'] })])).toEqual([
        {
          collectionId: 'fixture',
          cardId: 'fixture.healing-potion',
          field: 'tags',
          reason: 'duplicateValue',
        },
      ])
    })
  })

  describe('evento (README 14.1, 18.1)', () => {
    const combatIssue = (field: string, reason: string) => ({
      collectionId: 'fixture',
      cardId: 'fixture.howling-wolves',
      field,
      reason,
    })

    it('REQ-15: evento aleatório sem requisito', () => {
      expect(check([makeRandomEventCard({ requirements: [] })])).toEqual([
        {
          collectionId: 'fixture',
          cardId: 'fixture.wounded-traveler',
          field: 'requirements',
          reason: 'empty',
        },
      ])
    })

    it('REQ-15: evento de combate sem inimigo', () => {
      expect(check([makeCombatEventCard({ enemies: [] })])).toEqual([
        combatIssue('enemies', 'empty'),
      ])
    })

    it('REQ-15: inimigo com quantidade menor que 1', () => {
      expect(
        check([makeCombatEventCard({ enemies: [makeEnemy({ count: 0 })] })])
      ).toEqual([combatIssue('enemies[0].count', 'outOfRange')])
    })

    it('REQ-15: inimigo sem tipo', () => {
      expect(
        check([
          makeCombatEventCard({ enemies: [makeEnemy({ enemyTypes: [] })] }),
        ])
      ).toEqual([combatIssue('enemies[0].enemyTypes', 'empty')])
    })

    it('REQ-15: inimigo com tipo repetido', () => {
      expect(
        check([
          makeCombatEventCard({
            enemies: [makeEnemy({ enemyTypes: ['beast', 'beast'] })],
          }),
        ])
      ).toEqual([combatIssue('enemies[0].enemyTypes', 'duplicateValue')])
    })

    it('REQ-15: inimigo com vida menor que 1', () => {
      expect(
        check([makeCombatEventCard({ enemies: [makeEnemy({ health: 0 })] })])
      ).toEqual([combatIssue('enemies[0].health', 'outOfRange')])
    })

    it('REQ-15: modificador de inimigo negativo ou fracionário', () => {
      const base = makeEnemy()
      expect(
        check([
          makeCombatEventCard({
            enemies: [
              makeEnemy(),
              makeEnemy({
                modifiers: { ...base.modifiers, attack: -1, evasion: 1.5 },
              }),
            ],
          }),
        ])
      ).toEqual([
        combatIssue('enemies[1].modifiers.attack', 'outOfRange'),
        combatIssue('enemies[1].modifiers.evasion', 'outOfRange'),
      ])
    })

    it('REQ-15: Vigor de inimigo negativo', () => {
      expect(
        check([makeCombatEventCard({ enemies: [makeEnemy({ vigor: -1 })] })])
      ).toEqual([combatIssue('enemies[0].vigor', 'outOfRange')])
      expect(
        check([makeCombatEventCard({ enemies: [makeEnemy({ vigor: 0 })] })])
      ).toEqual([])
    })
  })
})
