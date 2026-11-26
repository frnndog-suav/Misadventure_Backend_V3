import { beforeEach, describe, expect, it } from 'vitest'

import { ContentInvalidError } from '@/domain/catalog/application/use-cases/_errors/content-invalid-error'
import { ContentReferencedError } from '@/domain/catalog/application/use-cases/_errors/content-referenced-error'
import { CreateCardUseCase } from '@/domain/catalog/application/use-cases/create-card'
import { DeleteCardUseCase } from '@/domain/catalog/application/use-cases/delete-card'
import { ContentIssuesPresenter } from '@/infra/http/presenters/content-issues-presenter'

import {
  makeDimensionCard,
  makeEnemy,
  makeItemCard,
  makeUrbanZoneCard,
  toCardInput,
} from '../../../test/factories/make-card'
import { InMemoryContentStore } from '../../../test/fakes/in-memory-content-store'
import { InMemoryPartiesRepository } from '../../../test/repositories/in-memory-parties-repository'
import { ZodCardInputParser } from './zod-card-input-parser'

const item = makeItemCard()
const shard = { ...makeItemCard({ id: 'fixture.shard' }), completionItem: true }
const zone = makeUrbanZoneCard()
const dimension = makeDimensionCard({ arrivalZoneTitle: null })
const completion = {
  zoneTitle: zone.title,
  requirement: [{ cardId: shard.id, count: 3 }],
  grandPrize: { cards: [{ cardId: item.id, copies: 1 }], gold: 100 },
  finalBoss: null,
}

describe('REQ-164 — conteúdo de conclusão da dimensão', () => {
  const parser = new ZodCardInputParser()
  let store: InMemoryContentStore

  beforeEach(() => {
    store = new InMemoryContentStore()
    store.collections = [{ id: 'fixture', name: 'Coleção', description: '' }]
    store.cards = [item, shard, zone].map((card) => ({
      status: 'published',
      card,
    }))
  })

  it('REQ-164: aplica os padrões de item e dimensão legados', () => {
    expect(parser.parse(toCardInput(item)).value).toMatchObject({
      completionItem: false,
    })
    expect(parser.parse(toCardInput(dimension)).value).toMatchObject({
      completion: null,
    })
  })

  it('REQ-164: salva o requisito e o prêmio válidos no editor', async () => {
    const result = await new CreateCardUseCase(store, parser).execute({
      collectionId: 'fixture',
      body: { ...toCardInput(dimension), completion },
    })

    expect(result.isRight()).toBe(true)
    expect(result.value).toMatchObject({ editorCard: { card: { completion } } })
  })

  it.each([
    [{ zoneTitle: 'Nenhuma' }, 'completion.zoneTitle'],
    [{ requirement: [] }, 'completion.requirement'],
    [
      { requirement: [{ cardId: item.id, count: 1 }] },
      'completion.requirement.0.cardId',
    ],
    [
      { requirement: [...completion.requirement, ...completion.requirement] },
      'completion.requirement.1.cardId',
    ],
    [
      { requirement: [{ cardId: shard.id, count: 0 }] },
      'completion.requirement.0.count',
    ],
    [
      { grandPrize: { cards: [{ cardId: shard.id, copies: 1 }], gold: 0 } },
      'completion.grandPrize.cards.0.cardId',
    ],
    [{ grandPrize: { cards: [], gold: -1 } }, 'completion.grandPrize.gold'],
    [
      {
        finalBoss: {
          title: 'Guardião',
          flavorText: null,
          enemies: [makeEnemy({ health: 0 })],
          noEscape: true,
        },
      },
      'completion.finalBoss.enemies.0.health',
    ],
  ] as const)(
    'REQ-164: informa o problema no caminho %j (%s)',
    async (invalid, path) => {
      const result = await new CreateCardUseCase(store, parser).execute({
        collectionId: 'fixture',
        body: {
          ...toCardInput(dimension),
          completion: { ...completion, ...invalid },
        },
      })

      expect(result.value).toBeInstanceOf(ContentInvalidError)
      if (!(result.value instanceof ContentInvalidError)) return
      const { fields } = ContentIssuesPresenter.toHTTP(
        result.value.details.fields
      )
      expect(fields).toContainEqual({
        path,
        message: expect.stringMatching(/\S/),
      })
    }
  )

  it('REQ-164: protege da exclusão o item citado no requisito', async () => {
    const card = { ...dimension, completion }
    store.cards.push({ status: 'published', card })

    const result = await new DeleteCardUseCase(
      store,
      new InMemoryPartiesRepository()
    ).execute({ cardId: shard.id })

    expect(result.value).toBeInstanceOf(ContentReferencedError)
    expect(await store.findEditorCard(shard.id)).not.toBeNull()
  })
})
