import { describe, expect, it } from 'vitest'

import type {
  TCard,
  TClassDefinition,
  TCollection,
  TRewardDeck,
  TZoneCard,
} from '@/domain/catalog/enterprise/value-objects/card'
import {
  makeAttributeCard,
  makeClassDefinition,
  makeCollection,
  makeCombatEventCard,
  makeDimensionCard,
  makeEffect,
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

  it('REQ-110: preserva a carta legada no catalogo e recusa sua inclusao no deck', () => {
    const legacy = makeRandomEventCard()
    expect(check([legacy])).toEqual([])
    const dimension = makeDimensionCard({
      eventDecks: [
        { zoneType: 'urban', cards: [{ cardId: legacy.id, copies: 1 }] },
      ],
    })
    expect(check([dimension, legacy])).toContainEqual(
      expect.objectContaining({
        field: 'eventDecks[0].cards[0].cardId',
        reason: 'randomEventNotExecutable',
      })
    )
  })

  it('REQ-110/REQ-111: aceita um deck misto com evento executavel e combate', () => {
    const executable = makeRandomEventCard({
      requirements: [
        {
          id: 'vigor',
          kind: 'minimum',
          stat: 'vigor',
          value: 1,
          text: 'Vigor',
        },
      ],
      goodOutcome: { text: 'Sucesso', steps: [] },
      badOutcome: { text: 'Reves', steps: [] },
      escapeThreshold: null,
    })
    const combat = makeCombatEventCard()
    const dimension = makeDimensionCard({
      eventDecks: [
        {
          zoneType: 'urban',
          cards: [
            { cardId: executable.id, copies: 2 },
            { cardId: combat.id, copies: 1 },
          ],
        },
      ],
    })
    expect(check([dimension, executable, combat])).toEqual([])
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
            effects: [
              makeEffect({ cost: [], text: 'Ao ser paga, compre 1 carta.' }),
            ],
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
      expect(
        check([makeAttributeCard({ effects: [makeEffect({ cost: [] })] })])
      ).toEqual([issue('effects', 'effectsNotAllowed')])
      expect(
        check([
          makeAttributeCard({
            attributeKind: 'synergy',
            attributes: ['strength', 'luck'],
            effects: [makeEffect({ cost: [] })],
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

    it('REQ-15/REQ-136: ajuste de preço fora de ×0,8 a ×1,5', () => {
      for (const priceMultiplier of [0.79, 1.51, Number.NaN]) {
        expect(check([makeEquipmentCard({ priceMultiplier })])).toEqual([
          issue('priceMultiplier', 'priceMultiplierInvalid'),
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
              refinement: {
                maxLevel,
                materials: [{ cardId: 'fixture.iron-ore', quantity: 1 }],
              },
            }),
            makeItemCard({
              id: 'fixture.iron-ore',
              itemCategory: 'material',
              effects: [],
            }),
          ])
        ).toEqual([issue('refinement.maxLevel', 'outOfRange')])
      }
    })

    it('REQ-15/D-135: refinável sem materiais de refino é aceito pela integridade', () => {
      expect(
        check([
          makeEquipmentCard({
            refinement: { maxLevel: 5, materials: [] },
          }),
        ])
      ).toEqual([])
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

    describe('REQ-61: limite de cópias no deck pré-pronto (4.3)', () => {
      const synergy = makeAttributeCard({
        id: 'fixture.warrior-synergy',
        name: 'Sinergia',
        attributeKind: 'synergy',
        attributes: ['strength', 'dexterity'],
      })
      const enhanced = makeAttributeCard({
        id: 'fixture.strength-enhanced',
        name: 'Força Aprimorada',
        attributeKind: 'enhanced',
        attributes: ['strength'],
        effects: [makeEffect({ cost: [] })],
      })
      const cards = [...deckCards, synergy, enhanced]
      const deck = (extra: { cardId: string; copies: number }) => [
        { cardId: 'fixture.strength-basic', copies: 18 },
        { cardId: 'fixture.dexterity-basic', copies: 42 - extra.copies },
        extra,
      ]

      it('synergy com 5 cópias (padrão 4) → starterDeckCopyLimit em starterDeck[i].copies', () => {
        expect(
          checkClasses(
            [
              makeClassDefinition({
                starterDeck: deck({ cardId: synergy.id, copies: 5 }),
              }),
            ],
            cards
          )
        ).toEqual([classIssue('starterDeck[2].copies', 'starterDeckCopyLimit')])
      })

      it('enhanced com 5 cópias → starterDeckCopyLimit', () => {
        expect(
          checkClasses(
            [
              makeClassDefinition({
                starterDeck: deck({ cardId: enhanced.id, copies: 5 }),
              }),
            ],
            cards
          )
        ).toEqual([classIssue('starterDeck[2].copies', 'starterDeckCopyLimit')])
      })

      it('até 4 cópias de synergy/enhanced é aceito; basic não tem limite', () => {
        expect(
          checkClasses(
            [
              makeClassDefinition({
                starterDeck: deck({ cardId: synergy.id, copies: 4 }),
              }),
            ],
            cards
          )
        ).toEqual([])
        expect(
          checkClasses([
            makeClassDefinition({
              starterDeck: [
                { cardId: 'fixture.strength-basic', copies: 18 },
                { cardId: 'fixture.dexterity-basic', copies: 42 },
              ],
            }),
          ])
        ).toEqual([])
      })

      it('rascunho não confere o limite (D-57b)', () => {
        expect(
          checkCatalogIntegrity({
            collections: [makeCollection()],
            cards,
            classes: [
              {
                ...makeClassDefinition({
                  starterDeck: deck({ cardId: synergy.id, copies: 9 }),
                }),
                status: 'draft',
              },
            ],
          })
        ).toEqual([])
      })
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

describe('REQ-26/REQ-38: classe em rascunho (D-57b)', () => {
  const cards = [
    makeAttributeCard(),
    makeAttributeCard({
      id: 'fixture.dexterity-basic',
      name: 'Destreza',
      attributes: ['dexterity'],
    }),
  ]
  const shortDeck = [
    { cardId: 'fixture.strength-basic', copies: 1 },
    { cardId: 'fixture.dexterity-basic', copies: 1 },
  ]

  function run(
    classes: Parameters<typeof checkCatalogIntegrity>[0]['classes']
  ) {
    return checkCatalogIntegrity({
      collections: [makeCollection()],
      cards,
      classes,
    })
  }

  it('REQ-38: rascunho não reporta tamanho nem trava do deck', () => {
    expect(
      run([
        { ...makeClassDefinition({ starterDeck: shortDeck }), status: 'draft' },
      ])
    ).toEqual([])
  })

  it('REQ-38: publicada (status ausente ou published) continua reportando', () => {
    const issues = run([
      makeClassDefinition({ starterDeck: shortDeck }),
      {
        ...makeClassDefinition({
          playerClass: 'mage',
          name: 'Mago',
          essentialAttributes: ['dexterity'],
          starterDeck: shortDeck,
        }),
        status: 'published',
      },
    ])
    expect(issues.map((issue) => issue.reason)).toEqual([
      'starterDeckSize',
      'starterDeckLockNotMet',
      'starterDeckSize',
      'starterDeckLockNotMet',
    ])
  })

  it('REQ-38: rascunho com os mesmos essenciais de uma publicada não é duplicata (8.5 só entre publicadas)', () => {
    expect(
      run([
        makeClassDefinition(),
        {
          ...makeClassDefinition({ playerClass: 'mage', name: 'Mago' }),
          status: 'draft',
        },
      ])
    ).toEqual([])
  })

  it('REQ-38: rascunho ainda confere formato, nome e playerClass', () => {
    const issues = run([
      makeClassDefinition(),
      {
        ...makeClassDefinition({ essentialAttributes: [] }),
        status: 'draft',
      },
    ])
    expect(issues.map((issue) => issue.reason)).toEqual([
      'duplicateId',
      'duplicateName',
      'essentialAttributeCount',
    ])
  })
})

describe('REQ-81: ferramentas e cartas coletáveis (12.6, D-86)', () => {
  const tool = (override: Parameters<typeof makeItemCard>[0] = {}) =>
    makeItemCard({
      id: 'fixture.pickaxe',
      itemCategory: 'tool',
      toolKind: 'pickaxe',
      scavengeZoneTypes: ['underground', 'mountainous'],
      ...override,
    })

  const fields = (cards: TCard[]) =>
    check(cards).map((issue) => [issue.field, issue.reason])

  it('REQ-81: ferramenta e coletáveis válidos não têm problemas', () => {
    expect(
      check([
        tool(),
        makeItemCard({
          id: 'fixture.iron-ore',
          itemCategory: 'material',
          scavengeTool: 'pickaxe',
        }),
        makeEquipmentCard({ scavengeTool: 'pickaxe' }),
      ])
    ).toEqual([])
  })

  it('REQ-81: toolKind fora de itemCategory tool', () => {
    expect(
      fields([
        makeItemCard({ toolKind: 'pickaxe', scavengeZoneTypes: ['urban'] }),
      ])
    ).toEqual([['toolKind', 'toolKindOnlyForTools']])
  })

  it('REQ-81: scavengeZoneTypes preenchida sem toolKind', () => {
    expect(fields([makeItemCard({ scavengeZoneTypes: ['urban'] })])).toEqual([
      ['scavengeZoneTypes', 'scavengeZoneTypesNotAllowed'],
    ])
  })

  it('REQ-81: scavengeZoneTypes vazia com toolKind preenchido', () => {
    expect(fields([tool({ scavengeZoneTypes: [] })])).toEqual([
      ['scavengeZoneTypes', 'scavengeZoneTypesRequired'],
    ])
  })

  it('REQ-81: tipo de zona repetido', () => {
    expect(fields([tool({ scavengeZoneTypes: ['urban', 'urban'] })])).toEqual([
      ['scavengeZoneTypes', 'duplicateValue'],
    ])
  })

  it('REQ-81: toolKind e scavengeTool fora de kebab-case', () => {
    expect(
      fields([
        tool({ toolKind: 'Pick Axe' }),
        makeItemCard({ id: 'fixture.ore', scavengeTool: 'pick_axe' }),
        makeEquipmentCard({ scavengeTool: '-x' }),
      ])
    ).toEqual([
      ['toolKind', 'notKebabCase'],
      ['scavengeTool', 'notKebabCase'],
      ['scavengeTool', 'notKebabCase'],
    ])
  })
})

describe('REQ-82: decks de recompensas na Carta de Dimensão (3.4, D-74)', () => {
  const potion = makeItemCard()
  const dimension = (rewardDecks: TRewardDeck[]) =>
    makeDimensionCard({ rewardDecks })
  const fields = (rewardDecks: TRewardDeck[], extra: TCard[] = [potion]) =>
    check([dimension(rewardDecks), ...extra]).map((issue) => [
      issue.field,
      issue.reason,
    ])

  it('REQ-82: composição válida (carta repetida entre tipos de zona) não tem problemas', () => {
    expect(
      fields([
        { zoneType: 'urban', cards: [{ cardId: potion.id, copies: 2 }] },
        { zoneType: 'forest', cards: [{ cardId: potion.id, copies: 1 }] },
      ])
    ).toEqual([])
  })

  it('REQ-82: zoneType repetido', () => {
    expect(
      fields([
        { zoneType: 'urban', cards: [{ cardId: potion.id, copies: 1 }] },
        { zoneType: 'urban', cards: [{ cardId: potion.id, copies: 1 }] },
      ])
    ).toEqual([['rewardDecks[1].zoneType', 'duplicateValue']])
  })

  it('REQ-82: deck sem cartas', () => {
    expect(fields([{ zoneType: 'urban', cards: [] }])).toEqual([
      ['rewardDecks[0].cards', 'empty'],
    ])
  })

  it('REQ-82: cardId repetido no mesmo deck', () => {
    expect(
      fields([
        {
          zoneType: 'urban',
          cards: [
            { cardId: potion.id, copies: 1 },
            { cardId: potion.id, copies: 1 },
          ],
        },
      ])
    ).toEqual([['rewardDecks[0].cards', 'duplicateValue']])
  })

  it('REQ-82: carta inexistente, de tipo que não entra e copies inválido', () => {
    expect(
      fields(
        [
          {
            zoneType: 'urban',
            cards: [
              { cardId: 'fixture.nope', copies: 1 },
              { cardId: 'fixture.old-mine', copies: 1 },
              { cardId: potion.id, copies: 0 },
            ],
          },
        ],
        [potion, makeZoneCard({ id: 'fixture.old-mine', title: 'Mina Velha' })]
      )
    ).toEqual([
      ['rewardDecks[0].cards[0].cardId', 'unknownCard'],
      ['rewardDecks[0].cards[1].cardId', 'notARewardCard'],
      ['rewardDecks[0].cards[2].copies', 'outOfRange'],
    ])
  })
})

describe('REQ-136 — conteúdo do mercado (README 3.4, 5.1, 5.2, 24; D-114)', () => {
  const reasons = (cards: TCard[], collections?: TCollection[]) =>
    check(cards, collections).map(({ cardId, field, reason }) => [
      cardId,
      field,
      reason,
    ])

  it('REQ-136: ajuste de preço de 0,8 a 1,5 com até 2 casas em atributo, equipamento e item', () => {
    const cards = (priceMultiplier: number) => [
      makeAttributeCard({ priceMultiplier }),
      makeEquipmentCard({ priceMultiplier }),
      makeItemCard({ priceMultiplier }),
    ]
    for (const valid of [0.8, 1, 1.15, 1.2, 1.5]) {
      expect(check(cards(valid))).toEqual([])
    }
    for (const invalid of [0.79, 1.51, 1.234, 0.805, Number.NaN]) {
      expect(reasons(cards(invalid))).toEqual([
        ['fixture.strength-basic', 'priceMultiplier', 'priceMultiplierInvalid'],
        ['fixture.blade-of-dusk', 'priceMultiplier', 'priceMultiplierInvalid'],
        ['fixture.healing-potion', 'priceMultiplier', 'priceMultiplierInvalid'],
      ])
    }
  })

  it('REQ-136: preço de estoque só em consumível, material e ferramenta, inteiro ≥ 1', () => {
    for (const itemCategory of ['consumable', 'material'] as const) {
      expect(check([makeItemCard({ itemCategory, stockPrice: 6 })])).toEqual([])
    }
    expect(
      check([
        makeItemCard({
          itemCategory: 'tool',
          effects: [],
          toolKind: 'pickaxe',
          scavengeZoneTypes: ['underground'],
          stockPrice: 20,
        }),
      ])
    ).toEqual([])
    for (const itemCategory of [
      'relic',
      'treasure',
      'document',
      'booster',
      'special',
    ] as const) {
      expect(
        reasons([
          makeItemCard({
            itemCategory,
            effects: [],
            stockPrice: 20,
            boosterCollectionId: itemCategory === 'booster' ? 'fixture' : null,
          }),
        ])
      ).toEqual([
        ['fixture.healing-potion', 'stockPrice', 'stockPriceNotAllowed'],
      ])
    }
    for (const stockPrice of [0, -1, 2.5]) {
      expect(reasons([makeItemCard({ stockPrice })])).toEqual([
        ['fixture.healing-potion', 'stockPrice', 'outOfRange'],
      ])
    }
  })

  it('REQ-136: lote inteiro ≥ 1; maior que 1 só com preço de estoque', () => {
    expect(check([makeItemCard({ stockPrice: 3, stockQuantity: 10 })])).toEqual(
      []
    )
    expect(reasons([makeItemCard({ stockQuantity: 10 })])).toEqual([
      [
        'fixture.healing-potion',
        'stockQuantity',
        'stockQuantityRequiresStockPrice',
      ],
    ])
    for (const stockQuantity of [0, 1.5]) {
      expect(reasons([makeItemCard({ stockPrice: 3, stockQuantity })])).toEqual(
        [['fixture.healing-potion', 'stockQuantity', 'outOfRange']]
      )
    }
  })

  it('REQ-136: booster, e só ele, indica uma coleção existente', () => {
    const booster = (boosterCollectionId: string | null) =>
      makeItemCard({
        id: 'fixture.booster',
        itemCategory: 'booster',
        effects: [],
        boosterCollectionId,
      })
    expect(check([booster('fixture')])).toEqual([])
    expect(
      check(
        [booster('other')],
        [makeCollection(), makeCollection({ id: 'other', name: 'Outra' })]
      )
    ).toEqual([])
    for (const id of [null, 'missing']) {
      expect(reasons([booster(id)])).toEqual([
        ['fixture.booster', 'boosterCollectionId', 'boosterCollectionRequired'],
      ])
    }
    expect(reasons([makeItemCard({ boosterCollectionId: 'fixture' })])).toEqual(
      [
        [
          'fixture.healing-potion',
          'boosterCollectionId',
          'boosterCollectionNotAllowed',
        ],
      ]
    )
  })

  it('REQ-136: booster de outra coleção é aceito no editor com as coleções de referência', () => {
    const booster = makeItemCard({
      id: 'fixture.booster',
      itemCategory: 'booster',
      effects: [],
      boosterCollectionId: 'other',
    })
    expect(
      checkCatalogIntegrity({
        collections: [makeCollection()],
        cards: [booster],
        referenceCollectionIds: ['other'],
      })
    ).toEqual([])
  })

  describe('mercado da zona (README 3.4, Apêndice B O2)', () => {
    const potion = makeItemCard({ stockPrice: 6 })
    const harbor = (market: TZoneCard['market'], withAction = true) =>
      makeUrbanZoneCard({
        zoneActions: [
          'startEvent',
          'useVault',
          ...(withAction ? (['visitMarket'] as const) : []),
          'saveRespawnPoint',
        ],
        market,
      })

    it('REQ-136: presente se e só se a zona tem Ir ao Mercado', () => {
      expect(
        check([potion, harbor({ stock: [potion.id], singles: true })])
      ).toEqual([])
      expect(check([harbor({ stock: [], singles: false })])).toEqual([])
      expect(reasons([harbor(null)])).toEqual([
        ['fixture.gray-harbor', 'market', 'marketMismatch'],
      ])
      expect(reasons([harbor({ stock: [], singles: true }, false)])).toEqual([
        ['fixture.gray-harbor', 'market', 'marketMismatch'],
      ])
    })

    it('REQ-136: estoque só com itens com preço de estoque, sem repetição, de qualquer coleção', () => {
      const relic = makeItemCard({
        id: 'fixture.relic',
        itemCategory: 'relic',
        effects: [],
      })
      expect(
        reasons([
          potion,
          relic,
          makeAttributeCard(),
          harbor({
            stock: [
              potion.id,
              relic.id,
              'fixture.nope',
              potion.id,
              'fixture.strength-basic',
            ],
            singles: false,
          }),
        ])
      ).toEqual([
        ['fixture.gray-harbor', 'market.stock.1', 'stockItemWithoutPrice'],
        ['fixture.gray-harbor', 'market.stock.2', 'unknownCard'],
        ['fixture.gray-harbor', 'market.stock.3', 'duplicateStockItem'],
        ['fixture.gray-harbor', 'market.stock.4', 'stockItemWithoutPrice'],
      ])

      const foreign = makeItemCard({
        id: 'other.arrows',
        collectionId: 'other',
        stockPrice: 3,
        stockQuantity: 10,
      })
      expect(
        checkCatalogIntegrity({
          collections: [makeCollection()],
          cards: [harbor({ stock: [foreign.id], singles: false })],
          referenceCards: [foreign],
        })
      ).toEqual([])
    })
  })
})
