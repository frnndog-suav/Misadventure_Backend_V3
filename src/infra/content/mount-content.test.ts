import { beforeEach, describe, expect, it } from 'vitest'
import { CreateCardUseCase } from '@/domain/catalog/application/use-cases/create-card'
import { ContentInvalidError } from '@/domain/catalog/application/use-cases/_errors/content-invalid-error'
import { DeleteCardUseCase } from '@/domain/catalog/application/use-cases/delete-card'
import { DeleteCollectionUseCase } from '@/domain/catalog/application/use-cases/delete-collection'
import { ImportCollectionUseCase } from '@/domain/catalog/application/use-cases/import-collection'
import { ReplaceCardUseCase } from '@/domain/catalog/application/use-cases/replace-card'
import { marketCandidatesOf } from '@/domain/campaign/enterprise/markets'
import { checkCatalogIntegrity } from '@/domain/catalog/enterprise/catalog-integrity'
import type { TCard } from '@/domain/catalog/enterprise/value-objects/card'
import { ContentIssuesPresenter } from '@/infra/http/presenters/content-issues-presenter'
import {
  makeCollection,
  makeEffect,
  makeItemCard,
  makeMountCard,
  makeUrbanZoneCard,
  makeZoneCard,
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
const horse = makeMountCard()
const farm = makeZoneCard({
  id: 'fixture.old-mine',
  title: 'Mina Velha',
  zoneType: 'rural',
  connectionArrows: 1,
  arrowLayout: null,
  zoneActions: ['startEvent', 'visitMarket'],
  market: { stock: [], singles: false, mounts: [horse.id] },
})
const harbor = makeUrbanZoneCard({
  zoneActions: ['startEvent', 'useVault', 'visitMarket', 'saveRespawnPoint'],
  market: { stock: [], singles: true, mounts: [] },
})
const referenced = 'Esta montaria está no Estábulo de uma zona.'

function published(card: TCard) {
  return { status: 'published' as const, card }
}

function messages(error: unknown) {
  expect(error).toBeInstanceOf(ContentInvalidError)
  return ContentIssuesPresenter.toHTTP(
    (error as ContentInvalidError).details.fields
  ).fields
}

function reasons(cards: TCard[]) {
  return checkCatalogIntegrity({
    collections: [makeCollection()],
    cards,
  }).map((issue) => [issue.field, issue.reason])
}

describe('REQ-155 — conteúdo da montaria', () => {
  let store: InMemoryContentStore
  const parser = new ZodCardInputParser()

  beforeEach(() => {
    store = new InMemoryContentStore()
    store.collections = [fixture, other]
  })

  it('REQ-155: montaria válida, com efeitos e habilidades do equipamento, passa na integridade', () => {
    expect(reasons([horse, farm])).toEqual([])
    const pony = makeMountCard({
      id: 'fixture.war-pony',
      mountTypes: ['beast', 'humanoid'],
      effects: [
        makeEffect({
          cost: [{ kind: 'payGold', amount: 1 }],
          activation: [{ kind: 'heal', amount: 2 }],
        }),
      ],
      abilities: [{ name: 'Galope', text: 'Corre.' }],
    })
    expect(reasons([pony])).toEqual([])
  })

  it('REQ-155: tipos vazios ou repetidos, criatura vazia e custo de item são recusados', () => {
    expect(
      reasons([
        makeMountCard({
          mountTypes: [],
          creature: ' ',
          effects: [makeEffect()],
        }),
      ])
    ).toEqual([
      ['mountTypes', 'mountTypesInvalid'],
      ['creature', 'creatureRequired'],
      ['effects[0].cost[0]', 'consumeSelfOnlyInItem'],
    ])
    expect(
      reasons([makeMountCard({ mountTypes: ['beast', 'beast'] })])
    ).toEqual([['mountTypes', 'mountTypesInvalid']])
  })

  it('REQ-155: Estábulo só em Rural ou Habitada, com montarias existentes e sem repetição', () => {
    expect(
      reasons([
        horse,
        makeItemCard(),
        {
          ...harbor,
          market: {
            stock: [],
            singles: true,
            mounts: [horse.id, makeItemCard().id, horse.id, 'fixture.x'],
          },
        },
      ])
    ).toEqual([
      ['market.mounts', 'stableNotAllowed'],
      ['market.mounts.1', 'notAMount'],
      ['market.mounts.2', 'duplicateMount'],
      ['market.mounts.3', 'unknownCard'],
    ])
    expect(reasons([horse, { ...farm, zoneType: 'inhabited' }])).toEqual([])
  })

  it('REQ-155: montaria fica fora de booster e da vitrine de singles', () => {
    const item = makeItemCard()
    expect(marketCandidatesOf([horse, item])).toEqual([
      { cardId: item.id, rarity: item.rarity },
    ])
  })

  it('REQ-155: conteúdo legado sem `mounts` é lido com a lista vazia', () => {
    const legacy = toCardInput(harbor) as unknown as {
      market: Record<string, unknown>
    }
    delete legacy.market.mounts
    expect(parser.parse(legacy).value).toMatchObject({
      market: { stock: [], singles: true, mounts: [] },
    })
  })

  it('REQ-155: o editor recusa com as mensagens do contrato', async () => {
    const create = new CreateCardUseCase(store, parser)
    const invalidMount = await create.execute({
      collectionId: 'fixture',
      body: toCardInput(makeMountCard({ mountTypes: [], creature: '' })),
    })
    expect(messages(invalidMount.value)).toEqual([
      {
        path: 'mountTypes',
        message: 'A montaria precisa de ao menos um tipo, sem repetição.',
      },
      { path: 'creature', message: 'A montaria precisa da criatura.' },
    ])

    store.cards = [published(horse), published(makeItemCard())]
    const invalidStable = await create.execute({
      collectionId: 'fixture',
      body: toCardInput({
        ...harbor,
        market: {
          stock: [],
          singles: true,
          mounts: [horse.id, makeItemCard().id, horse.id],
        },
      }),
    })
    expect(messages(invalidStable.value)).toEqual([
      {
        path: 'market.mounts',
        message: 'Só zonas Rurais e Habitadas têm Estábulo.',
      },
      {
        path: 'market.mounts.1',
        message: 'A carta do Estábulo precisa ser uma montaria.',
      },
      { path: 'market.mounts.2', message: 'Montaria repetida no Estábulo.' },
    ])

    const valid = await create.execute({
      collectionId: 'fixture',
      body: toCardInput(farm),
    })
    expect(valid.isRight()).toBe(true)
  })

  it('REQ-155: aceita montaria de outra coleção no Estábulo', async () => {
    const foreign = makeMountCard({ id: 'other.mule', collectionId: 'other' })
    store.cards = [published(foreign)]
    const zone = await new CreateCardUseCase(store, parser).execute({
      collectionId: 'fixture',
      body: toCardInput({
        ...farm,
        market: { stock: [], singles: false, mounts: [foreign.id] },
      }),
    })
    expect(zone.isRight()).toBe(true)
  })

  it('REQ-155: protege a montaria do Estábulo ao excluir, renomear ou mudar de tipo', async () => {
    store.cards = [published(farm), { status: 'draft', card: horse }]

    const deleted = await new DeleteCardUseCase(
      store,
      new InMemoryPartiesRepository()
    ).execute({ cardId: horse.id })
    expect(deleted.value).toMatchObject({
      code: 'CONTENT_REFERENCED',
      message: referenced,
    })

    const replace = new ReplaceCardUseCase(store, parser)
    const renamed = await replace.execute({
      cardId: horse.id,
      body: toCardInput(horse, 'mule'),
    })
    expect(renamed.value).toMatchObject({
      code: 'CONTENT_REFERENCED',
      message: referenced,
    })

    const retyped = await replace.execute({
      cardId: horse.id,
      body: toCardInput(
        makeItemCard({ id: horse.id, name: 'Cavalo de Arado', effects: [] })
      ),
    })
    expect(retyped.value).toMatchObject({
      code: 'CONTENT_REFERENCED',
      message: referenced,
    })
    expect(store.cards).toContainEqual({ status: 'draft', card: horse })

    const edited = await replace.execute({
      cardId: horse.id,
      body: toCardInput({ ...horse, creature: 'Cavalo de tração' }),
    })
    expect(edited.isRight()).toBe(true)
  })

  it('REQ-155: protege a montaria citada por zona de outra coleção ao excluir ou substituir a coleção', async () => {
    const foreign = makeMountCard({ id: 'other.mule', collectionId: 'other' })
    store.cards = [
      published({
        ...farm,
        market: { stock: [], singles: false, mounts: [foreign.id] },
      }),
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
