import { describe, expect, it } from 'vitest'

import type {
  TAbility,
  TBlacksmithEnchantment,
  TCard,
  TEquipmentCard,
  TItemCard,
  TZoneCard,
} from '@/domain/catalog/enterprise/value-objects/card'
import {
  makeCollection,
  makeEffect,
  makeEquipmentCard,
  makeItemCard,
  makeUrbanZoneCard,
} from '../../../../../test/factories/make-card'

import { checkCatalogIntegrity } from '.'

function check(cards: TCard[]) {
  return checkCatalogIntegrity({ collections: [makeCollection()], cards })
}

function reasons(cards: TCard[]) {
  return check(cards).map(({ cardId, field, reason }) => [
    cardId,
    field,
    reason,
  ])
}

describe('REQ-145 — conteúdo do ferreiro (README 3.4, 5.1, 5.2, 25; D-129)', () => {
  const ore = makeItemCard({
    id: 'fixture.iron-ore',
    name: 'Minério de Ferro',
    itemCategory: 'material',
    tags: [],
    effects: [],
  })
  const shard = makeItemCard({
    id: 'fixture.ember-shard',
    name: 'Fragmento de Brasa',
    itemCategory: 'material',
    tags: [],
    effects: [],
  })
  const blade = 'fixture.blade-of-dusk'
  const sword = (override: Partial<TEquipmentCard> = {}) =>
    makeEquipmentCard({
      refinement: {
        maxLevel: 10,
        materials: [{ cardId: ore.id, quantity: 1 }],
      },
      ...override,
    })

  describe('refino e encantamento do equipamento', () => {
    it('REQ-145: refinável com materiais existentes é válido', () => {
      expect(check([ore, sword()])).toEqual([])
      expect(check([sword({ refinement: null })])).toEqual([])
    })

    it('REQ-145: materiais de refino: lista não vazia de itens material, sem repetir', () => {
      const materialsOf = (materials: { cardId: string; quantity: number }[]) =>
        reasons([
          ore,
          shard,
          makeItemCard(),
          sword({ refinement: { maxLevel: 5, materials } }),
        ])
      // D-135: lista vazia (legado) só bloqueia publicar.
      expect(materialsOf([])).toEqual([])
      expect(
        materialsOf([
          { cardId: ore.id, quantity: 1 },
          { cardId: 'fixture.nope', quantity: 1 },
          { cardId: 'fixture.healing-potion', quantity: 1 },
          { cardId: ore.id, quantity: 2 },
        ])
      ).toEqual([
        [blade, 'refinement.materials.1.cardId', 'unknownCard'],
        [blade, 'refinement.materials.2.cardId', 'materialNotMaterial'],
        [blade, 'refinement.materials.3.cardId', 'duplicateMaterial'],
      ])
      for (const quantity of [0, -1, 1.5]) {
        expect(materialsOf([{ cardId: ore.id, quantity }])).toEqual([
          [blade, 'refinement.materials.0.quantity', 'outOfRange'],
        ])
      }
    })

    it('REQ-145: encantamento é null ou 1+ slots de elemento/efeito com refino mínimo de 0 a 10', () => {
      const slots = (
        list: { kind: 'element' | 'effect'; minRefinement: number }[]
      ) => reasons([ore, sword({ enchantment: { slots: list } })])

      expect(
        slots([
          { kind: 'element', minRefinement: 2 },
          { kind: 'effect', minRefinement: 10 },
        ])
      ).toEqual([])
      expect(slots([])).toEqual([[blade, 'enchantment.slots', 'empty']])
      expect(slots([{ kind: 'element', minRefinement: 11 }])).toEqual([
        [blade, 'enchantment.slots.0.minRefinement', 'outOfRange'],
      ])
      expect(slots([{ kind: 'element', minRefinement: -1 }])).toEqual([
        [blade, 'enchantment.slots.0.minRefinement', 'outOfRange'],
      ])
    })

    it('REQ-145: refino mínimo do slot não passa do refino máximo; sem refino, é 0', () => {
      expect(
        reasons([
          ore,
          sword({
            refinement: {
              maxLevel: 3,
              materials: [{ cardId: ore.id, quantity: 1 }],
            },
            enchantment: {
              slots: [
                { kind: 'element', minRefinement: 3 },
                { kind: 'effect', minRefinement: 4 },
              ],
            },
          }),
        ])
      ).toEqual([
        [blade, 'enchantment.slots.1.minRefinement', 'minRefinementAboveMax'],
      ])
      expect(
        check([
          sword({
            refinement: null,
            enchantment: { slots: [{ kind: 'element', minRefinement: 0 }] },
          }),
        ])
      ).toEqual([])
      expect(
        reasons([
          sword({
            refinement: null,
            enchantment: { slots: [{ kind: 'element', minRefinement: 1 }] },
          }),
        ])
      ).toEqual([
        [blade, 'enchantment.slots.0.minRefinement', 'minRefinementAboveMax'],
      ])
    })
  })

  describe('receita do documento', () => {
    const bp = 'fixture.sword-blueprint'
    const document = (recipe: TItemCard['recipe']) =>
      makeItemCard({
        id: bp,
        itemCategory: 'document',
        tags: [],
        effects: [],
        recipe,
      })
    const recipe = (
      override: Partial<NonNullable<TItemCard['recipe']>> = {}
    ) => ({
      equipmentId: blade,
      materials: [{ cardId: ore.id, quantity: 2 }],
      gold: 15,
      consumed: false,
      ...override,
    })

    it('REQ-145: documento com receita válida (materiais podem ser vazios, ouro 0)', () => {
      expect(check([ore, makeEquipmentCard(), document(recipe())])).toEqual([])
      expect(
        check([
          makeEquipmentCard(),
          document(recipe({ materials: [], gold: 0, consumed: true })),
        ])
      ).toEqual([])
    })

    it('REQ-145: só documento tem receita', () => {
      expect(
        reasons([ore, makeEquipmentCard(), makeItemCard({ recipe: recipe() })])
      ).toEqual([['fixture.healing-potion', 'recipe', 'recipeNotAllowed']])
    })

    it('REQ-145: a receita cria equipamento existente; ouro inteiro ≥ 0; materiais pelas mesmas regras', () => {
      expect(
        reasons([
          makeEquipmentCard(),
          document(recipe({ equipmentId: 'fixture.nope', materials: [] })),
        ])
      ).toEqual([[bp, 'recipe.equipmentId', 'recipeEquipmentInvalid']])
      expect(
        reasons([
          makeItemCard(),
          document(
            recipe({ equipmentId: 'fixture.healing-potion', materials: [] })
          ),
        ])
      ).toEqual([[bp, 'recipe.equipmentId', 'recipeEquipmentInvalid']])
      for (const gold of [-1, 1.5]) {
        expect(
          reasons([ore, makeEquipmentCard(), document(recipe({ gold }))])
        ).toEqual([[bp, 'recipe.gold', 'outOfRange']])
      }
      expect(
        reasons([
          ore,
          makeEquipmentCard(),
          document(
            recipe({
              materials: [
                { cardId: ore.id, quantity: 0 },
                { cardId: ore.id, quantity: 1 },
              ],
            })
          ),
        ])
      ).toEqual([
        [bp, 'recipe.materials.0.quantity', 'outOfRange'],
        [bp, 'recipe.materials.1.cardId', 'duplicateMaterial'],
      ])
    })
  })

  describe('ferreiro da zona', () => {
    const zone = 'fixture.gray-harbor'
    const harbor = (blacksmith: TZoneCard['blacksmith'], withAction = true) =>
      makeUrbanZoneCard({
        zoneActions: [
          'startEvent',
          'useVault',
          ...(withAction ? (['visitBlacksmith'] as const) : []),
          'saveRespawnPoint',
        ],
        blacksmith,
      })
    const element = (
      override: Record<string, unknown> = {}
    ): TBlacksmithEnchantment =>
      ({
        id: 'ember-edge',
        name: 'Fio de Brasa',
        kind: 'element',
        element: 'fire',
        bonusPercent: 10,
        materials: [{ cardId: shard.id, quantity: 1 }],
        ...override,
      }) as TBlacksmithEnchantment
    const effectEnchant = (
      override: Record<string, unknown> = {}
    ): TBlacksmithEnchantment =>
      ({
        id: 'vigor',
        name: 'Vigor',
        kind: 'effect',
        effects: [],
        abilities: [{ name: 'Golpe de Brasa', text: 'Causa dano.' }],
        materials: [{ cardId: shard.id, quantity: 1 }],
        ...override,
      }) as TBlacksmithEnchantment

    it('REQ-145: presente se e só se a zona tem Ir ao Ferreiro (lista pode ser vazia)', () => {
      expect(check([shard, harbor({ enchantments: [element()] })])).toEqual([])
      expect(check([harbor({ enchantments: [] })])).toEqual([])
      expect(check([harbor(null, false)])).toEqual([])
      expect(reasons([harbor(null)])).toEqual([
        [zone, 'blacksmith', 'blacksmithMismatch'],
      ])
      expect(reasons([harbor({ enchantments: [] }, false)])).toEqual([
        [zone, 'blacksmith', 'blacksmithMismatch'],
      ])
    })

    it('REQ-145: id único na zona', () => {
      expect(
        reasons([
          shard,
          harbor({ enchantments: [element(), element({ name: 'Outro' })] }),
        ])
      ).toEqual([
        [zone, 'blacksmith.enchantments.1.id', 'duplicateEnchantment'],
      ])
    })

    it('REQ-145: encantamento de elemento: bônus inteiro de 1 a 100 e materiais não vazios', () => {
      for (const bonusPercent of [0, 101, 1.5]) {
        expect(
          reasons([
            shard,
            harbor({ enchantments: [element({ bonusPercent })] }),
          ])
        ).toEqual([
          [zone, 'blacksmith.enchantments.0.bonusPercent', 'outOfRange'],
        ])
      }
      for (const bonusPercent of [1, 100]) {
        expect(
          check([shard, harbor({ enchantments: [element({ bonusPercent })] })])
        ).toEqual([])
      }
      expect(
        reasons([harbor({ enchantments: [element({ materials: [] })] })])
      ).toEqual([[zone, 'blacksmith.enchantments.0.materials', 'empty']])
      expect(
        reasons([
          ore,
          harbor({
            enchantments: [
              element({
                materials: [
                  { cardId: 'fixture.nope', quantity: 1 },
                  { cardId: ore.id, quantity: 1 },
                  { cardId: ore.id, quantity: 1 },
                ],
              }),
            ],
          }),
        ])
      ).toEqual([
        [zone, 'blacksmith.enchantments.0.materials.0.cardId', 'unknownCard'],
        [
          zone,
          'blacksmith.enchantments.0.materials.2.cardId',
          'duplicateMaterial',
        ],
      ])
    })

    it('REQ-145: encantamento de efeito tem ao menos um efeito ou habilidade', () => {
      expect(
        check([shard, harbor({ enchantments: [effectEnchant()] })])
      ).toEqual([])
      expect(
        reasons([
          shard,
          harbor({
            enchantments: [effectEnchant({ abilities: [], effects: [] })],
          }),
        ])
      ).toEqual([[zone, 'blacksmith.enchantments.0.effects', 'empty']])
    })

    it('REQ-145: habilidade ou efeito da pool exclusiva de inimigos é recusado (README 17.5)', () => {
      const breaker = makeEffect({
        cost: [],
        activation: [{ kind: 'breakEquipment', slots: [] }],
        duration: { kind: 'immediate' },
      })
      const enemyAbility = {
        id: 'shatter',
        name: 'Estilhaçar',
        text: 'Quebra um equipamento.',
        form: 'targeted',
        element: null,
        cost: [],
        power: null,
        effects: [breaker],
        cooldown: 0,
        timing: 'combat',
        classRestriction: [],
        usesPerTurn: 1,
        target: 'opponent',
        duration: null,
        channel: null,
      } as unknown as TAbility
      expect(
        reasons([
          shard,
          harbor({
            enchantments: [
              effectEnchant({
                abilities: [
                  { name: 'Golpe', text: 'Causa dano.' },
                  enemyAbility,
                ],
              }),
            ],
          }),
        ])
      ).toContainEqual([
        zone,
        'blacksmith.enchantments.0.abilities.1',
        'enemyOnlyAbility',
      ])
      expect(
        reasons([
          shard,
          harbor({
            enchantments: [
              effectEnchant({ abilities: [], effects: [breaker] }),
            ],
          }),
        ])
      ).toContainEqual([
        zone,
        'blacksmith.enchantments.0.effects.0',
        'enemyOnlyAbility',
      ])
    })

    it('REQ-145: o efeito do encantamento passa pelas regras de efeito vigentes', () => {
      expect(
        reasons([
          shard,
          harbor({
            enchantments: [
              effectEnchant({
                abilities: [],
                effects: [
                  makeEffect({
                    cost: [],
                    mark: null,
                    duration: { kind: 'infinite' },
                  }),
                ],
              }),
            ],
          }),
        ])
      ).toEqual([
        [zone, 'blacksmith.enchantments.0.effects[0].mark', 'markRequired'],
      ])
    })

    it('REQ-145: materiais de outra coleção valem com as cartas de referência', () => {
      const foreign = makeItemCard({
        id: 'other.ember',
        collectionId: 'other',
        itemCategory: 'material',
        tags: [],
        effects: [],
      })
      expect(
        checkCatalogIntegrity({
          collections: [makeCollection()],
          cards: [
            harbor({
              enchantments: [
                element({ materials: [{ cardId: foreign.id, quantity: 1 }] }),
              ],
            }),
          ],
          referenceCards: [foreign],
        })
      ).toEqual([])
    })
  })
})
