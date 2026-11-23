import { beforeEach, describe, expect, it } from 'vitest'
import { CreateCardUseCase } from '@/domain/catalog/application/use-cases/create-card'
import { ContentInvalidError } from '@/domain/catalog/application/use-cases/_errors/content-invalid-error'
import { DeleteCardUseCase } from '@/domain/catalog/application/use-cases/delete-card'
import { DeleteCollectionUseCase } from '@/domain/catalog/application/use-cases/delete-collection'
import { ImportCollectionUseCase } from '@/domain/catalog/application/use-cases/import-collection'
import { ReplaceCardUseCase } from '@/domain/catalog/application/use-cases/replace-card'
import type { TCard } from '@/domain/catalog/enterprise/value-objects/card'
import { ContentIssuesPresenter } from '@/infra/http/presenters/content-issues-presenter'
import {
  makeAttributeCard,
  makeCollection,
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
const arrows = makeItemCard({
  id: 'fixture.arrows',
  name: 'Flechas',
  tags: [],
  stockPrice: 3,
  stockQuantity: 10,
})
const harbor = makeUrbanZoneCard({
  zoneActions: ['startEvent', 'useVault', 'visitMarket', 'saveRespawnPoint'],
  market: { stock: [arrows.id], singles: true },
})
const referenced = 'Esta carta está no estoque do mercado de uma zona.'

function published(card: TCard) {
  return { status: 'published' as const, card }
}

function messages(error: unknown) {
  expect(error).toBeInstanceOf(ContentInvalidError)
  return ContentIssuesPresenter.toHTTP(
    (error as ContentInvalidError).details.fields
  ).fields
}

describe('REQ-136 — conteúdo do mercado no editor', () => {
  let store: InMemoryContentStore
  const parser = new ZodCardInputParser()

  beforeEach(() => {
    store = new InMemoryContentStore()
    store.collections = [fixture, other]
  })

  it('REQ-136: lê a carta sem os campos novos com os valores legados', () => {
    const legacyAttribute: Record<string, unknown> = toCardInput(
      makeAttributeCard({ priceMultiplier: 1.2 })
    )
    delete legacyAttribute.priceMultiplier
    expect(parser.parse(legacyAttribute).value).toMatchObject({
      priceMultiplier: 1,
    })

    const legacyItem: Record<string, unknown> = toCardInput(makeItemCard())
    for (const key of [
      'priceMultiplier',
      'stockPrice',
      'stockQuantity',
      'boosterCollectionId',
    ])
      delete legacyItem[key]
    expect(parser.parse(legacyItem).value).toMatchObject({
      priceMultiplier: 1,
      stockPrice: null,
      stockQuantity: 1,
      boosterCollectionId: null,
    })

    const legacyZone: Record<string, unknown> = toCardInput(makeUrbanZoneCard())
    delete legacyZone.market
    expect(parser.parse(legacyZone).value).toMatchObject({ market: null })
  })

  it.each([
    {
      card: makeItemCard({
        id: 'fixture.pickaxe',
        itemCategory: 'relic',
        effects: [],
        stockPrice: 20,
      }),
      path: 'stockPrice',
      message: 'Só consumíveis, materiais e ferramentas têm preço de estoque.',
    },
    {
      card: makeItemCard({ priceMultiplier: 1.234 }),
      path: 'priceMultiplier',
      message:
        'O ajuste de preço deve estar entre 0,8 e 1,5, com até 2 casas decimais.',
    },
    {
      card: makeItemCard({ stockQuantity: 10 }),
      path: 'stockQuantity',
      message: 'Lote maior que 1 exige preço de estoque.',
    },
    {
      card: makeItemCard({
        id: 'fixture.booster',
        itemCategory: 'booster',
        effects: [],
        boosterCollectionId: 'missing',
      }),
      path: 'boosterCollectionId',
      message: 'Booster precisa de uma coleção existente.',
    },
    {
      card: makeItemCard({ boosterCollectionId: 'fixture' }),
      path: 'boosterCollectionId',
      message: 'Só boosters indicam coleção.',
    },
    {
      card: makeUrbanZoneCard({
        zoneActions: [
          'startEvent',
          'useVault',
          'visitMarket',
          'saveRespawnPoint',
        ],
        market: null,
      }),
      path: 'market',
      message: 'Zona com Ir ao Mercado precisa do mercado, e só ela.',
    },
  ])(
    'REQ-136: recusa $path com o texto do contrato',
    async ({ card, path, message }) => {
      const result = await new CreateCardUseCase(store, parser).execute({
        collectionId: 'fixture',
        body: toCardInput(card),
      })
      expect(messages(result.value)).toContainEqual({ path, message })
    }
  )

  it('REQ-136: recusa os itens inválidos do estoque com o caminho de cada um', async () => {
    store.cards = [published(arrows), published(makeItemCard())]
    const result = await new CreateCardUseCase(store, parser).execute({
      collectionId: 'fixture',
      body: toCardInput({
        ...harbor,
        market: {
          stock: [arrows.id, 'fixture.healing-potion', arrows.id, 'fixture.x'],
          singles: false,
        },
      }),
    })
    expect(messages(result.value)).toEqual([
      {
        path: 'market.stock.1',
        message: 'O item do estoque precisa ter preço de estoque.',
      },
      { path: 'market.stock.2', message: 'Item repetido no estoque.' },
      { path: 'market.stock.3', message: 'Carta inexistente.' },
    ])
  })

  it('REQ-136: aceita estoque com item e booster de outra coleção', async () => {
    const foreign = makeItemCard({
      id: 'other.rope',
      collectionId: 'other',
      stockPrice: 4,
    })
    store.cards = [published(foreign)]
    const zone = await new CreateCardUseCase(store, parser).execute({
      collectionId: 'fixture',
      body: toCardInput({
        ...harbor,
        market: { stock: [foreign.id], singles: false },
      }),
    })
    expect(zone.isRight()).toBe(true)

    const booster = await new CreateCardUseCase(store, parser).execute({
      collectionId: 'fixture',
      body: toCardInput(
        makeItemCard({
          id: 'fixture.booster',
          itemCategory: 'booster',
          effects: [],
          boosterCollectionId: 'other',
        })
      ),
    })
    expect(booster.isRight()).toBe(true)
  })

  it('REQ-136: protege a carta citada no estoque ao excluir, renomear ou tirar o preço', async () => {
    store.cards = [published(harbor), { status: 'draft', card: arrows }]

    const deleted = await new DeleteCardUseCase(
      store,
      new InMemoryPartiesRepository()
    ).execute({ cardId: arrows.id })
    expect(deleted.value).toMatchObject({
      code: 'CONTENT_REFERENCED',
      message: referenced,
    })

    const replace = new ReplaceCardUseCase(store, parser)
    const renamed = await replace.execute({
      cardId: arrows.id,
      body: toCardInput(arrows, 'quiver'),
    })
    expect(renamed.value).toMatchObject({
      code: 'CONTENT_REFERENCED',
      message: referenced,
    })

    const unpriced = await replace.execute({
      cardId: arrows.id,
      body: toCardInput({ ...arrows, stockPrice: null, stockQuantity: 1 }),
    })
    expect(unpriced.value).toMatchObject({
      code: 'CONTENT_REFERENCED',
      message: referenced,
    })
    expect(store.cards).toContainEqual({ status: 'draft', card: arrows })

    const repriced = await replace.execute({
      cardId: arrows.id,
      body: toCardInput({ ...arrows, stockPrice: 5 }),
    })
    expect(repriced.isRight()).toBe(true)
  })

  it('REQ-136: protege o item citado por zona de outra coleção ao excluir ou substituir a coleção', async () => {
    const foreign = makeItemCard({
      id: 'other.rope',
      collectionId: 'other',
      stockPrice: 4,
    })
    store.cards = [
      published({ ...harbor, market: { stock: [foreign.id], singles: false } }),
      published(foreign),
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
    expect(store.cards).toContainEqual(published(foreign))
  })
})
