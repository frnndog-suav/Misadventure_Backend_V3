import { beforeEach, describe, expect, it } from 'vitest'
import { ContentInvalidError } from '@/domain/catalog/application/use-cases/_errors/content-invalid-error'
import { CreateCardUseCase } from '@/domain/catalog/application/use-cases/create-card'
import { DeleteCardUseCase } from '@/domain/catalog/application/use-cases/delete-card'
import { DeleteCollectionUseCase } from '@/domain/catalog/application/use-cases/delete-collection'
import { ImportCollectionUseCase } from '@/domain/catalog/application/use-cases/import-collection'
import { PublishCardUseCase } from '@/domain/catalog/application/use-cases/publish-card'
import { ReplaceCardUseCase } from '@/domain/catalog/application/use-cases/replace-card'
import type { TCard } from '@/domain/catalog/enterprise/value-objects/card'
import { ContentIssuesPresenter } from '@/infra/http/presenters/content-issues-presenter'
import {
  makeCollection,
  makeEquipmentCard,
  makeItemCard,
  makeUrbanZoneCard,
  toCardInput,
} from '../../../test/factories/make-card'
import { FakeClassInputParser } from '../../../test/fakes/fake-class-input-parser'
import { InMemoryContentStore } from '../../../test/fakes/in-memory-content-store'
import { InMemoryPartiesRepository } from '../../../test/repositories/in-memory-parties-repository'
import { ZodCardInputParser } from './zod-card-input-parser'

const fixture = { ...makeCollection({ id: 'fixture' }), description: '' }
const other = {
  ...makeCollection({ id: 'other', name: 'Outra' }),
  description: '',
}
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
const sword = makeEquipmentCard({
  id: 'fixture.short-sword',
  name: 'Espada Curta',
  refinement: { maxLevel: 10, materials: [{ cardId: ore.id, quantity: 1 }] },
  enchantment: { slots: [{ kind: 'element', minRefinement: 2 }] },
})
const blueprint = makeItemCard({
  id: 'fixture.sword-blueprint',
  name: 'Projeto: Espada Curta',
  itemCategory: 'document',
  tags: [],
  effects: [],
  recipe: {
    equipmentId: sword.id,
    materials: [{ cardId: ore.id, quantity: 2 }],
    gold: 15,
    consumed: false,
  },
})
const harbor = makeUrbanZoneCard({
  zoneActions: [
    'startEvent',
    'useVault',
    'visitBlacksmith',
    'saveRespawnPoint',
  ],
  blacksmith: {
    enchantments: [
      {
        id: 'ember-edge',
        name: 'Fio de Brasa',
        kind: 'element',
        element: 'fire',
        bonusPercent: 10,
        materials: [{ cardId: shard.id, quantity: 1 }],
      },
    ],
  },
})
const referenced =
  'Esta carta é usada como material, receita ou encantamento de outra carta.'

function published(card: TCard) {
  return { status: 'published' as const, card }
}

function messages(error: unknown) {
  expect(error).toBeInstanceOf(ContentInvalidError)
  return ContentIssuesPresenter.toHTTP(
    (error as ContentInvalidError).details.fields
  ).fields
}

describe('REQ-145 — conteúdo do ferreiro no editor', () => {
  let store: InMemoryContentStore
  const parser = new ZodCardInputParser()

  beforeEach(() => {
    store = new InMemoryContentStore()
    store.collections = [fixture, other]
    store.cards = [published(ore), published(shard)]
  })

  it('REQ-145: lê o conteúdo legado: materiais em texto viram lista vazia; encantamento em texto, null; sem receita nem ferreiro', () => {
    const legacyEquipment: Record<string, unknown> = {
      ...toCardInput(makeEquipmentCard()),
      refinement: { maxLevel: 5, materials: { text: '1 minério de ferro' } },
      enchantment: { text: 'Encantamento: causa dano sombrio extra.' },
    }
    expect(parser.parse(legacyEquipment).value).toMatchObject({
      refinement: { maxLevel: 5, materials: [] },
      enchantment: null,
    })

    const legacyItem: Record<string, unknown> = toCardInput(makeItemCard())
    delete legacyItem.recipe
    expect(parser.parse(legacyItem).value).toMatchObject({ recipe: null })

    const legacyZone: Record<string, unknown> = toCardInput(makeUrbanZoneCard())
    delete legacyZone.blacksmith
    expect(parser.parse(legacyZone).value).toMatchObject({ blacksmith: null })

    const legacyForge: Record<string, unknown> = toCardInput(harbor)
    delete legacyForge.blacksmith
    expect(parser.parse(legacyForge).value).toMatchObject({
      blacksmith: { enchantments: [] },
    })
    expect(
      parser.parse({ ...toCardInput(harbor), blacksmith: null }).value
    ).toMatchObject({ blacksmith: null })
  })

  it('REQ-145: lê as formas novas', () => {
    expect(parser.parse(toCardInput(sword)).value).toMatchObject({
      refinement: sword.refinement,
      enchantment: sword.enchantment,
    })
    expect(parser.parse(toCardInput(blueprint)).value).toMatchObject({
      recipe: blueprint.recipe,
    })
    expect(parser.parse(toCardInput(harbor)).value).toMatchObject({
      blacksmith: harbor.blacksmith,
    })
  })

  it.each([
    {
      name: 'material que não é da categoria material',
      card: makeEquipmentCard({
        refinement: {
          maxLevel: 5,
          materials: [{ cardId: 'fixture.healing-potion', quantity: 1 }],
        },
      }),
      path: 'refinement.materials.0.cardId',
      message: 'O material precisa ser um item da categoria material.',
    },
    {
      name: 'material repetido',
      card: makeEquipmentCard({
        refinement: {
          maxLevel: 5,
          materials: [
            { cardId: ore.id, quantity: 1 },
            { cardId: ore.id, quantity: 2 },
          ],
        },
      }),
      path: 'refinement.materials.1.cardId',
      message: 'Material repetido.',
    },
    {
      name: 'refino mínimo acima do máximo',
      card: makeEquipmentCard({
        refinement: {
          maxLevel: 3,
          materials: [{ cardId: ore.id, quantity: 1 }],
        },
        enchantment: { slots: [{ kind: 'effect', minRefinement: 4 }] },
      }),
      path: 'enchantment.slots.0.minRefinement',
      message: 'O refino mínimo não pode passar do refino máximo.',
    },
    {
      name: 'receita fora de documento',
      card: makeItemCard({
        id: 'fixture.relic',
        itemCategory: 'relic',
        tags: [],
        effects: [],
        recipe: {
          equipmentId: sword.id,
          materials: [],
          gold: 0,
          consumed: true,
        },
      }),
      path: 'recipe',
      message: 'Só documentos têm receita.',
    },
    {
      name: 'receita de equipamento inexistente',
      card: makeItemCard({
        id: 'fixture.bad-blueprint',
        itemCategory: 'document',
        tags: [],
        effects: [],
        recipe: {
          equipmentId: 'fixture.nope',
          materials: [],
          gold: 0,
          consumed: false,
        },
      }),
      path: 'recipe.equipmentId',
      message: 'A receita precisa criar um equipamento existente.',
    },
    {
      name: 'zona com ferreiro sem a carta',
      card: makeUrbanZoneCard({ ...harbor, blacksmith: null }),
      path: 'blacksmith',
      message: 'Zona com Ir ao Ferreiro precisa do ferreiro, e só ela.',
    },
    {
      name: 'encantamento repetido',
      card: makeUrbanZoneCard({
        ...harbor,
        blacksmith: {
          enchantments: [
            ...harbor.blacksmith!.enchantments,
            ...harbor.blacksmith!.enchantments,
          ],
        },
      }),
      path: 'blacksmith.enchantments.1.id',
      message: 'Encantamento repetido nesta zona.',
    },
  ])(
    'REQ-145: recusa $name com o texto do contrato',
    async ({ card, path, message }) => {
      store.cards = [
        published(ore),
        published(shard),
        published(sword),
        published(makeItemCard()),
      ]
      const result = await new CreateCardUseCase(store, parser).execute({
        collectionId: 'fixture',
        body: toCardInput(card),
      })
      expect(messages(result.value)).toContainEqual({ path, message })
    }
  )

  it('REQ-145/D-135: refinável sem materiais salva em rascunho, mas não publica', async () => {
    const legacy = makeEquipmentCard({
      refinement: { maxLevel: 5, materials: [] },
    })
    const created = await new CreateCardUseCase(store, parser).execute({
      collectionId: 'fixture',
      body: toCardInput(legacy),
    })
    expect(created.isRight()).toBe(true)

    const publishedResult = await new PublishCardUseCase(store).execute({
      cardId: legacy.id,
    })
    expect(messages(publishedResult.value)).toContainEqual({
      path: 'refinement.materials',
      message: 'Equipamento refinável precisa dos materiais de refino.',
    })

    store.cards = [published(ore), published(sword)]
    const replaced = await new ReplaceCardUseCase(store, parser).execute({
      cardId: sword.id,
      body: toCardInput({
        ...sword,
        refinement: { maxLevel: 10, materials: [] },
      }),
    })
    expect(messages(replaced.value)).toContainEqual({
      path: 'refinement.materials',
      message: 'Equipamento refinável precisa dos materiais de refino.',
    })
  })

  it('REQ-145: habilidade do encantamento passa pelas regras de habilidade vigentes', async () => {
    const body = toCardInput(harbor)
    const ability = {
      id: 'flare',
      name: 'Clarão',
      text: 'Canaliza.',
      form: 'channeled',
      element: null,
      cost: [],
      power: null,
      effects: [],
      cooldown: 0,
      timing: 'combat',
      classRestriction: [],
      usesPerTurn: 1,
      target: 'opponent',
      duration: null,
      channel: null,
    }
    body.blacksmith = {
      enchantments: [
        {
          id: 'flare',
          name: 'Clarão',
          kind: 'effect',
          effects: [],
          abilities: [ability],
          materials: [{ cardId: shard.id, quantity: 1 }],
        },
      ],
    }
    const result = await new CreateCardUseCase(store, parser).execute({
      collectionId: 'fixture',
      body,
    })
    expect(messages(result.value)).toContainEqual(
      expect.objectContaining({
        path: 'blacksmith.enchantments.0.abilities.0.channel',
      })
    )
  })

  it('REQ-145: recusa habilidade da pool exclusiva de inimigos no encantamento', async () => {
    const enemyAbility = {
      id: 'shatter',
      name: 'Estilhaçar',
      text: 'Quebra um equipamento.',
      form: 'targeted',
      element: null,
      cost: [],
      power: null,
      effects: [
        {
          text: 'Quebre um equipamento.',
          trigger: null,
          cost: [],
          activation: [{ kind: 'breakEquipment', slots: [] }],
          duration: { kind: 'immediate' },
          mark: null,
        },
      ],
      cooldown: 0,
      timing: 'combat',
      classRestriction: [],
      usesPerTurn: 1,
      target: 'opponent',
      duration: null,
      channel: null,
    }
    const body = toCardInput(harbor)
    body.blacksmith = {
      enchantments: [
        {
          id: 'shatter',
          name: 'Estilhaço',
          kind: 'effect',
          effects: [],
          abilities: [{ name: 'Golpe', text: 'Dano.' }, enemyAbility],
          materials: [{ cardId: shard.id, quantity: 1 }],
        },
      ],
    }
    const result = await new CreateCardUseCase(store, parser).execute({
      collectionId: 'fixture',
      body,
    })
    expect(messages(result.value)).toContainEqual({
      path: 'blacksmith.enchantments.0.abilities.1',
      message: 'Habilidades exclusivas de inimigos não podem ser encantadas.',
    })
  })

  it('REQ-145: aceita material de outra coleção', async () => {
    const foreign = makeItemCard({
      id: 'other.ember',
      collectionId: 'other',
      itemCategory: 'material',
      tags: [],
      effects: [],
    })
    store.cards = [published(foreign)]
    const result = await new CreateCardUseCase(store, parser).execute({
      collectionId: 'fixture',
      body: toCardInput(
        makeEquipmentCard({
          refinement: {
            maxLevel: 4,
            materials: [{ cardId: foreign.id, quantity: 3 }],
          },
        })
      ),
    })
    expect(result.isRight()).toBe(true)
  })

  it('REQ-145: protege material, equipamento da receita e material do encantamento ao excluir, renomear ou mudar de categoria', async () => {
    store.cards = [
      { status: 'draft', card: ore },
      published(shard),
      published(sword),
      published(blueprint),
      published(harbor),
    ]
    const remove = new DeleteCardUseCase(store, new InMemoryPartiesRepository())
    const replace = new ReplaceCardUseCase(store, parser)

    for (const card of [ore, shard, sword]) {
      const deleted = await remove.execute({ cardId: card.id })
      expect(deleted.value).toMatchObject({
        code: 'CONTENT_REFERENCED',
        message: referenced,
      })
    }

    const renamed = await replace.execute({
      cardId: ore.id,
      body: toCardInput(ore, 'iron-bar'),
    })
    expect(renamed.value).toMatchObject({
      code: 'CONTENT_REFERENCED',
      message: referenced,
    })

    const reclassified = await replace.execute({
      cardId: ore.id,
      body: toCardInput({ ...ore, itemCategory: 'relic' }),
    })
    expect(reclassified.value).toMatchObject({
      code: 'CONTENT_REFERENCED',
      message: referenced,
    })
    expect(store.cards).toContainEqual({ status: 'draft', card: ore })

    const edited = await replace.execute({
      cardId: ore.id,
      body: toCardInput({ ...ore, rarity: 'uncommon' }),
    })
    expect(edited.isRight()).toBe(true)
  })

  it('REQ-145: protege a carta citada por conteúdo de outra coleção ao excluir ou substituir a coleção', async () => {
    const foreign = makeItemCard({
      id: 'other.ember',
      collectionId: 'other',
      itemCategory: 'material',
      tags: [],
      effects: [],
    })
    store.cards = [
      published(foreign),
      published({
        ...sword,
        refinement: {
          maxLevel: 4,
          materials: [{ cardId: foreign.id, quantity: 1 }],
        },
      }),
    ]
    const parties = new InMemoryPartiesRepository()

    const deleted = await new DeleteCollectionUseCase(store, parties).execute({
      collectionId: 'other',
    })
    expect(deleted.value).toMatchObject({
      code: 'CONTENT_REFERENCED',
      message: referenced,
    })

    const imported = await new ImportCollectionUseCase(
      store,
      parser,
      new FakeClassInputParser(),
      parties
    ).execute({
      body: {
        formatVersion: 1,
        collection: { id: 'other', name: 'Outra', description: '' },
        cards: [],
      },
      replace: 'true',
    })
    expect(imported.value).toMatchObject({
      code: 'CONTENT_REFERENCED',
      message: referenced,
    })

    const reclassified = await new ImportCollectionUseCase(
      store,
      parser,
      new FakeClassInputParser(),
      parties
    ).execute({
      body: {
        formatVersion: 1,
        collection: { id: 'other', name: 'Outra', description: '' },
        cards: [
          {
            status: 'draft',
            card: { ...foreign, itemCategory: 'relic' },
          },
        ],
      },
      replace: 'true',
    })
    expect(reclassified.value).toMatchObject({
      code: 'CONTENT_REFERENCED',
      message: referenced,
    })
    expect(store.cards).toContainEqual(published(foreign))
  })
})
