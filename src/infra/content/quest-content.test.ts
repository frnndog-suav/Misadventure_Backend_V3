import { beforeEach, describe, expect, it } from 'vitest'
import { CreateCardUseCase } from '@/domain/catalog/application/use-cases/create-card'
import { ContentInvalidError } from '@/domain/catalog/application/use-cases/_errors/content-invalid-error'
import { DeleteCardUseCase } from '@/domain/catalog/application/use-cases/delete-card'
import { ListCollectionCardsUseCase } from '@/domain/catalog/application/use-cases/list-collection-cards'
import { PublishCardUseCase } from '@/domain/catalog/application/use-cases/publish-card'
import { ReplaceCardUseCase } from '@/domain/catalog/application/use-cases/replace-card'
import { ReplaceClassUseCase } from '@/domain/catalog/application/use-cases/replace-class'
import { ValidateDimensionUseCase } from '@/domain/catalog/application/use-cases/validate-dimension'
import { describeCollection } from '@/domain/catalog/enterprise/editor-collection'
import type {
  TCard,
  TZoneQuestCard,
  TZoneQuestStage,
} from '@/domain/catalog/enterprise/value-objects/card'
import { ContentIssuesPresenter } from '@/infra/http/presenters/content-issues-presenter'
import {
  makeClassDefinition,
  makeCollection,
  makeCombatEventCard,
  makeDimensionCard,
  makeEnemy,
  makeFixtureContent,
  makeRandomEventCard,
  makeUrbanZoneCard,
  toCardInput,
} from '../../../test/factories/make-card'
import { InMemoryContentStore } from '../../../test/fakes/in-memory-content-store'
import { InMemoryPartiesRepository } from '../../../test/repositories/in-memory-parties-repository'
import { ZodCardInputParser } from './zod-card-input-parser'
import { ZodClassInputParser } from './zod-class-input-parser'

const collection = { ...makeCollection({ id: 'fixture' }), description: '' }
const port = makeUrbanZoneCard({ title: 'Porto', connectionArrows: 4 })
const event = makeRandomEventCard({
  requirements: [
    {
      id: 'help',
      text: 'Ajude o viajante',
      kind: 'minimum',
      stat: 'peak',
      value: 1,
    },
  ],
  escapeThreshold: null,
  goodOutcome: { text: 'Êxito', steps: [] },
  badOutcome: { text: 'Revés', steps: [] },
})
const stage: TZoneQuestStage = {
  type: 'randomEvent',
  text: 'Ajude o viajante',
  location: { type: 'zoneTitle', title: 'Porto' },
  eventCardId: event.id,
}
const questId = 'fixture.help-at-the-port'
const quest: TZoneQuestCard = {
  type: 'zoneQuest',
  id: questId,
  collectionId: 'fixture',
  title: 'Ajuda no Porto',
  summary: 'Socorra o viajante',
  stages: [stage],
  rewards: [],
}
const questInput = toCardInput(quest)

function published(card: TCard) {
  return { status: 'published' as const, card }
}

describe('REQ-135 — conteúdo de missões e especializações', () => {
  let store: InMemoryContentStore
  const parser = new ZodCardInputParser()

  beforeEach(() => {
    store = new InMemoryContentStore()
    store.collections = [collection]
  })

  it('aceita referências em rascunho e exige que todas estejam publicadas para publicar', async () => {
    store.cards = [port, event].map((card) => ({ status: 'draft', card }))
    const created = await new CreateCardUseCase(store, parser).execute({
      collectionId: 'fixture',
      body: questInput,
    })
    expect(created.value).toMatchObject({
      editorCard: { status: 'draft', card: quest },
    })

    const publish = new PublishCardUseCase(store)
    const refused = await publish.execute({ cardId: questId })
    expect(refused.value).toMatchObject({ code: 'CONTENT_INVALID' })
    expect(await store.findEditorCard(questId)).toMatchObject({
      status: 'draft',
    })

    await store.saveCard(port, 'published')
    await store.saveCard(event, 'published')
    const accepted = await publish.execute({ cardId: questId })
    expect(accepted.value).toMatchObject({
      editorCard: { status: 'published', card: quest },
    })
  })

  it.each([
    {
      change: { eventCardId: 'fixture.road-ambush' },
      path: 'stages.0.eventCardId',
      message:
        'A carta referenciada deve ser um evento aleatório executável da mesma coleção.',
    },
    {
      change: { location: { type: 'zoneTitle', title: 'Porto Inexistente' } },
      path: 'stages.0.location.title',
      message: 'Não há uma zona com esse título na coleção.',
    },
  ])(
    'recusa edição publicada em $path e preserva a carta',
    async ({ change, path, message }) => {
      store.cards = [
        port,
        event,
        makeCombatEventCard({ id: 'fixture.road-ambush' }),
        quest,
      ].map(published)
      const result = await new ReplaceCardUseCase(store, parser).execute({
        cardId: questId,
        body: { ...questInput, stages: [{ ...stage, ...change }] },
      })
      expect(result.value).toBeInstanceOf(ContentInvalidError)
      if (!(result.value instanceof ContentInvalidError)) return
      expect(
        ContentIssuesPresenter.toHTTP(result.value.details.fields)
      ).toEqual({
        fields: [{ path, message }],
      })
      expect(await store.findEditorCard(questId)).toMatchObject({ card: quest })
    }
  )

  it('aponta o campo do inimigo inválido no combate embutido', async () => {
    store.cards = [port, event].map(published)
    const combatStage = {
      type: 'combatEvent',
      text: 'Defenda o Porto',
      location: stage.location,
      combat: {
        enemies: [makeEnemy({ count: 0 })],
        goodOutcome: { text: 'Vitória', steps: [] },
        badOutcome: { text: 'Derrota', steps: [] },
        noEscape: false,
      },
    }
    const result = await new CreateCardUseCase(store, parser).execute({
      collectionId: 'fixture',
      body: { ...questInput, stages: [stage, combatStage] },
    })
    expect(result.value).toMatchObject({
      code: 'CONTENT_INVALID',
      details: {
        fields: expect.arrayContaining([
          {
            path: 'stages.1.combat.enemies.0.count',
            reason: expect.any(String),
          },
        ]),
      },
    })
  })

  it('mantém conteúdo legado com listas vazias', () => {
    const { collectionId, ...classInput } = makeClassDefinition()
    expect(collectionId).toBe('fixture')
    expect(parser.parse(toCardInput(port)).value).toMatchObject({
      questDeck: [],
    })
    expect(new ZodClassInputParser().parse(classInput).value).toMatchObject({
      specializations: [],
    })
  })

  it('aponta a posição de uma missão inexistente no deck da zona', async () => {
    store.cards = [published(port)]
    const result = await new ReplaceCardUseCase(store, parser).execute({
      cardId: port.id,
      body: { ...toCardInput(port), questDeck: [questId] },
    })
    expect(result.value).toMatchObject({
      code: 'CONTENT_INVALID',
      details: { fields: [expect.objectContaining({ path: 'questDeck.0' })] },
    })
  })

  it('recusa mais de dois atributos adicionais na especialização', async () => {
    const fixture = makeFixtureContent()
    store.cards = fixture.cards.map(published)
    store.classes = fixture.classes.map((classDefinition) => ({
      status: 'published',
      classDefinition,
    }))
    const warrior = fixture.classes.find(
      (entry) => entry.playerClass === 'warrior'
    )!
    const { collectionId, ...body } = warrior
    expect(collectionId).toBe('fixture')
    const specializations = ['knight', 'guard', 'veteran', 'champion'].map(
      (id, index) => ({
        id,
        name: id,
        additionalAttributes:
          index === 0 ? ['wisdom', 'dexterity', 'intelligence'] : [],
        reinforcedAttributes: [],
        effects: [],
      })
    )
    const result = await new ReplaceClassUseCase(
      store,
      new ZodClassInputParser()
    ).execute({
      playerClass: 'warrior',
      body: { ...body, specializations },
    })
    expect(result.value).toMatchObject({
      code: 'CONTENT_INVALID',
      details: {
        fields: expect.arrayContaining([
          expect.objectContaining({
            path: 'specializations.0.additionalAttributes',
          }),
        ]),
      },
    })
  })

  it('rejeita título de destino ambíguo no mapa publicado', async () => {
    store.cards = [
      makeDimensionCard({ arrivalZoneTitle: null }),
      port,
      makeUrbanZoneCard({
        id: 'fixture.second-port',
        title: 'Porto',
        connectionArrows: 4,
      }),
      event,
      quest,
    ].map(published)
    const result = await new ValidateDimensionUseCase(store).execute({
      collectionId: 'fixture',
    })
    expect(result.value).toEqual({
      valid: false,
      problems: [
        `A etapa 1 da missão ${questId} exige um título de zona único: Porto.`,
      ],
    })
  })

  it('rejeita a mesma carta no deck de duas zonas da dimensão', async () => {
    store.cards = [
      makeDimensionCard({ arrivalZoneTitle: null }),
      { ...port, questDeck: [questId] },
      {
        ...makeUrbanZoneCard({
          id: 'fixture.second-port',
          title: 'Outro Porto',
          connectionArrows: 4,
        }),
        questDeck: [questId],
      },
      event,
      quest,
    ].map(published)
    const result = await new ValidateDimensionUseCase(store).execute({
      collectionId: 'fixture',
    })
    expect(result.value).toMatchObject({ valid: false })
  })

  it.each([questId, event.id])(
    'protege a carta referenciada %s da exclusão',
    async (cardId) => {
      store.cards = [{ ...port, questDeck: [questId] }, event, quest].map(
        published
      )
      const result = await new DeleteCardUseCase(
        store,
        new InMemoryPartiesRepository()
      ).execute({ cardId })
      expect(result.value).toMatchObject({ code: 'CONTENT_REFERENCED' })
      expect(await store.findEditorCard(cardId)).toBeTruthy()
    }
  )

  it('filtra e conta missões sem acrescentar contagem de raridade', async () => {
    store.cards = [port, quest].map(published)
    const filtered = await new ListCollectionCardsUseCase(store).execute({
      collectionId: 'fixture',
      type: 'zoneQuest',
    })
    expect(filtered.value).toEqual({ cards: [quest] })
    const counts = describeCollection(collection, store.cards)
    expect(counts.cardCounts).toMatchObject({ zoneQuest: 1 })
    expect(
      Object.values(counts.rarityCounts).every((count) => count === 0)
    ).toBe(true)
  })
})
