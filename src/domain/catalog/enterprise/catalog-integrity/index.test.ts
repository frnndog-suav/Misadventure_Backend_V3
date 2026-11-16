import { describe, expect, it } from 'vitest'

import type {
  TCard,
  TClassDefinition,
  TCollection,
} from '@/domain/catalog/enterprise/value-objects/card'
import {
  makeAttributeCard,
  makeClassDefinition,
  makeCollection,
  makeCombatEventCard,
  makeDimensionCard,
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
      ).toEqual([issue('attributes', 'basicAttributeCount')])
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
      ).toEqual([issue('attributes', 'enhancedAttributeCount')])
    })

    it('REQ-15: sinérgica fora de 2 a 4 atributos', () => {
      for (const attributes of [
        ['strength'],
        ['strength', 'luck', 'wisdom', 'charisma', 'spirit'],
      ] as const) {
        expect(
          check([makeAttributeCard({ attributeKind: 'synergy', attributes })])
        ).toEqual([issue('attributes', 'synergyAttributeCount')])
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

  describe('REQ-26: zona — forma das setas (D-37)', () => {
    const zoneIssue = (reason: string) => ({
      collectionId: 'fixture',
      cardId: 'fixture.whispering-grove',
      field: 'arrowLayout',
      reason,
    })

    it('REQ-26: zona de 2 setas sem arrowLayout', () => {
      expect(check([makeZoneCard({ arrowLayout: null })])).toEqual([
        zoneIssue('arrowLayoutRequired'),
      ])
      expect(check([makeZoneCard({ arrowLayout: 'corner' })])).toEqual([])
    })

    it('REQ-26: setas fora da faixa ocultam a regra de arrowLayout (D-56)', () => {
      expect(
        check([makeZoneCard({ connectionArrows: 5, arrowLayout: 'straight' })])
      ).toEqual([
        {
          collectionId: 'fixture',
          cardId: 'fixture.whispering-grove',
          field: 'connectionArrows',
          reason: 'outOfRange',
        },
      ])
    })

    it('REQ-26: arrowLayout presente com 1, 3 ou 4 setas', () => {
      for (const connectionArrows of [1, 3, 4]) {
        expect(
          check([makeZoneCard({ connectionArrows, arrowLayout: 'straight' })])
        ).toEqual([zoneIssue('arrowLayoutNotAllowed')])
        expect(
          check([makeZoneCard({ connectionArrows, arrowLayout: null })])
        ).toEqual([])
      }
    })
  })

  describe('REQ-26: Carta de Dimensão', () => {
    it('REQ-26: Carta de Dimensão válida não tem problemas', () => {
      expect(check([makeDimensionCard()])).toEqual([])
    })

    it('REQ-26: no máximo 1 Carta de Dimensão por coleção', () => {
      expect(
        check([
          makeDimensionCard(),
          makeDimensionCard({ id: 'fixture.second-realm', releaseOrder: 2 }),
        ])
      ).toEqual([
        {
          collectionId: 'fixture',
          cardId: 'fixture.second-realm',
          field: 'type',
          reason: 'tooManyDimensions',
        },
      ])
    })

    it('REQ-26: releaseOrder inteiro ≥ 1', () => {
      for (const releaseOrder of [0, -1, 1.5]) {
        expect(check([makeDimensionCard({ releaseOrder })])).toEqual([
          {
            collectionId: 'fixture',
            cardId: 'fixture.misty-realm',
            field: 'releaseOrder',
            reason: 'outOfRange',
          },
        ])
      }
    })

    it('REQ-26: releaseOrder único no catálogo', () => {
      expect(
        check(
          [
            makeDimensionCard(),
            makeDimensionCard({
              id: 'other.misty-realm',
              collectionId: 'other',
            }),
          ],
          [makeCollection(), makeCollection({ id: 'other', name: 'Outra' })]
        )
      ).toEqual([
        {
          collectionId: 'other',
          cardId: 'other.misty-realm',
          field: 'releaseOrder',
          reason: 'duplicateValue',
        },
      ])
    })
  })

  describe('REQ-26: classe', () => {
    const deckCards: TCard[] = [
      makeAttributeCard(),
      makeAttributeCard({
        id: 'fixture.dexterity-basic',
        name: 'Destreza',
        attributes: ['dexterity'],
      }),
    ]

    function checkClasses(
      classes: TClassDefinition[],
      cards: TCard[] = deckCards
    ) {
      return checkCatalogIntegrity({
        collections: [makeCollection()],
        cards,
        classes,
      })
    }

    const classIssue = (
      field: string,
      reason: string,
      playerClass = 'warrior'
    ) => ({
      collectionId: 'fixture',
      cardId: null,
      playerClass,
      field,
      reason,
    })

    const mage = makeClassDefinition({
      playerClass: 'mage',
      name: 'Mago',
      essentialAttributes: ['dexterity'],
      starterDeck: [
        { cardId: 'fixture.strength-basic', copies: 42 },
        { cardId: 'fixture.dexterity-basic', copies: 18 },
      ],
    })

    it('REQ-26: classes válidas não têm problemas', () => {
      expect(checkClasses([makeClassDefinition(), mage])).toEqual([])
    })

    it('REQ-26: playerClass único no catálogo', () => {
      expect(
        checkClasses([
          makeClassDefinition(),
          { ...mage, playerClass: 'warrior' },
        ])
      ).toEqual([classIssue('playerClass', 'duplicateId')])
    })

    it('REQ-26: name único no catálogo', () => {
      expect(
        checkClasses([makeClassDefinition(), { ...mage, name: 'Guerreiro' }])
      ).toEqual([classIssue('name', 'duplicateName', 'mage')])
    })

    it('REQ-26: essentialAttributes com 1 ou 2 atributos', () => {
      expect(
        checkClasses([makeClassDefinition({ essentialAttributes: [] })])
      ).toEqual([classIssue('essentialAttributes', 'essentialAttributeCount')])
      expect(
        checkClasses([
          makeClassDefinition({
            essentialAttributes: ['strength', 'dexterity', 'luck'],
          }),
        ])
      ).toEqual([classIssue('essentialAttributes', 'essentialAttributeCount')])
    })

    it('REQ-26: essentialAttributes diferentes', () => {
      expect(
        checkClasses([
          makeClassDefinition({
            essentialAttributes: ['strength', 'strength'],
          }),
        ])
      ).toEqual([classIssue('essentialAttributes', 'duplicateValue')])
    })

    it('REQ-26: essenciais inválidas não geram duplicateEssentials nem trava (D-56)', () => {
      expect(
        checkClasses([
          makeClassDefinition(),
          {
            ...mage,
            essentialAttributes: ['strength', 'strength'],
            starterDeck: [
              { cardId: 'fixture.strength-basic', copies: 1 },
              { cardId: 'fixture.dexterity-basic', copies: 59 },
            ],
          },
        ])
      ).toEqual([classIssue('essentialAttributes', 'duplicateValue', 'mage')])
    })

    it('REQ-26: entrada inválida no deck oculta tamanho e trava (D-56)', () => {
      expect(
        checkClasses([
          makeClassDefinition({
            starterDeck: [{ cardId: 'fixture.ghost', copies: 5 }],
          }),
        ])
      ).toEqual([classIssue('starterDeck[0].cardId', 'unknownCard')])
    })

    it('REQ-26: duas classes com o mesmo conjunto de essenciais (8.5)', () => {
      expect(
        checkClasses([
          makeClassDefinition(),
          {
            ...mage,
            essentialAttributes: ['strength'],
            starterDeck: makeClassDefinition().starterDeck,
          },
        ])
      ).toEqual([
        classIssue('essentialAttributes', 'duplicateEssentials', 'mage'),
      ])
    })

    it('REQ-26: o mesmo conjunto em outra ordem também conta', () => {
      const twoA = makeClassDefinition({
        essentialAttributes: ['strength', 'dexterity'],
        starterDeck: [
          { cardId: 'fixture.strength-basic', copies: 30 },
          { cardId: 'fixture.dexterity-basic', copies: 30 },
        ],
      })
      const twoB: TClassDefinition = {
        ...twoA,
        playerClass: 'mage',
        name: 'Mago',
        essentialAttributes: ['dexterity', 'strength'],
      }
      expect(checkClasses([twoA, twoB])).toEqual([
        classIssue('essentialAttributes', 'duplicateEssentials', 'mage'),
      ])
    })

    it('REQ-26: os 7 modificadores base inteiros ≥ 0', () => {
      expect(
        checkClasses([
          makeClassDefinition({
            baseModifiers: {
              ...makeClassDefinition().baseModifiers,
              attack: -1,
              evasion: 1.5,
            },
          }),
        ])
      ).toEqual([
        classIssue('baseModifiers.attack', 'outOfRange'),
        classIssue('baseModifiers.evasion', 'outOfRange'),
      ])
    })

    it('REQ-26: starterDeck sem cardId repetido', () => {
      expect(
        checkClasses([
          makeClassDefinition({
            starterDeck: [
              { cardId: 'fixture.strength-basic', copies: 18 },
              { cardId: 'fixture.dexterity-basic', copies: 21 },
              { cardId: 'fixture.dexterity-basic', copies: 21 },
            ],
          }),
        ])
      ).toEqual([classIssue('starterDeck', 'duplicateValue')])
    })

    it('REQ-26: starterDeck com carta inexistente', () => {
      expect(
        checkClasses([
          makeClassDefinition({
            starterDeck: [
              { cardId: 'fixture.strength-basic', copies: 18 },
              { cardId: 'fixture.dexterity-basic', copies: 41 },
              { cardId: 'fixture.ghost', copies: 1 },
            ],
          }),
        ])
      ).toEqual([classIssue('starterDeck[2].cardId', 'unknownCard')])
    })

    it('REQ-26: starterDeck com carta que não é de atributo', () => {
      expect(
        checkClasses(
          [
            makeClassDefinition({
              starterDeck: [
                { cardId: 'fixture.strength-basic', copies: 18 },
                { cardId: 'fixture.dexterity-basic', copies: 41 },
                { cardId: 'fixture.healing-potion', copies: 1 },
              ],
            }),
          ],
          [...deckCards, makeItemCard()]
        )
      ).toEqual([classIssue('starterDeck[2].cardId', 'notAnAttributeCard')])
    })

    // Com entrada inválida, tamanho e trava não são conferidos (precedência).
    it('REQ-26: copies inteiro ≥ 1', () => {
      const luck = makeAttributeCard({
        id: 'fixture.luck-basic',
        attributes: ['luck'],
      })
      for (const copies of [0, 1.5]) {
        expect(
          checkClasses(
            [
              makeClassDefinition({
                starterDeck: [
                  { cardId: 'fixture.strength-basic', copies: 18 },
                  { cardId: 'fixture.dexterity-basic', copies: 42 },
                  { cardId: 'fixture.luck-basic', copies },
                ],
              }),
            ],
            [...deckCards, luck]
          )
        ).toEqual([classIssue('starterDeck[2].copies', 'outOfRange')])
      }
    })

    it('REQ-26: total de cópias diferente do minDeckSize padrão (60)', () => {
      expect(
        checkClasses([
          makeClassDefinition({
            starterDeck: [
              { cardId: 'fixture.strength-basic', copies: 18 },
              { cardId: 'fixture.dexterity-basic', copies: 41 },
            ],
          }),
        ])
      ).toEqual([classIssue('starterDeck', 'starterDeckSize')])
    })

    it('REQ-26: deck pré-pronto sem cumprir a trava (padrões)', () => {
      expect(
        checkClasses([
          makeClassDefinition({
            starterDeck: [
              { cardId: 'fixture.strength-basic', copies: 17 },
              { cardId: 'fixture.dexterity-basic', copies: 43 },
            ],
          }),
        ])
      ).toEqual([classIssue('starterDeck', 'starterDeckLockNotMet')])
    })
  })
})
