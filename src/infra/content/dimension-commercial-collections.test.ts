import { describe, expect, it } from 'vitest'
import { ContentInvalidError } from '@/domain/catalog/application/use-cases/_errors/content-invalid-error'
import { ContentReferencedError } from '@/domain/catalog/application/use-cases/_errors/content-referenced-error'
import { DeleteCollectionUseCase } from '@/domain/catalog/application/use-cases/delete-collection'
import { PublishCardUseCase } from '@/domain/catalog/application/use-cases/publish-card'
import { ReplaceCardUseCase } from '@/domain/catalog/application/use-cases/replace-card'
import {
  makeDimensionCard,
  toCardInput,
} from '../../../test/factories/make-card'
import { InMemoryContentStore } from '../../../test/fakes/in-memory-content-store'
import { InMemoryPartiesRepository } from '../../../test/repositories/in-memory-parties-repository'
import { ZodCardInputParser } from './zod-card-input-parser'

describe('REQ-173 — coleções comerciais no CardInput', () => {
  const parser = new ZodCardInputParser()
  const dimension = toCardInput(makeDimensionCard({ releaseOrder: 5 }))

  it('usa listas vazias para uma dimensão legada', () => {
    const legacy = { ...dimension }
    delete legacy.extendedCollectionIds
    delete legacy.reprintCollectionIds

    expect(parser.parse(legacy).value).toMatchObject({
      extendedCollectionIds: [],
      reprintCollectionIds: [],
    })
  })

  it('aceita as duas listas e preserva a ordem do autor', () => {
    const configured = {
      extendedCollectionIds: ['second', 'first'],
      reprintCollectionIds: ['fourth', 'third'],
    }

    expect(parser.parse({ ...dimension, ...configured }).value).toMatchObject(
      configured
    )
  })
})

describe('REQ-173 — proteção de coleções referenciadas', () => {
  it.each(['excluir a coleção', 'mudar a ordem de lançamento'])(
    'recusa %s quando invalida a extensão de uma dimensão publicada',
    async (operation) => {
      const store = new InMemoryContentStore()
      store.collections = ['fixture', 'past'].map((id) => ({
        id,
        name: id,
        description: '',
      }))
      const earlier = makeDimensionCard({
        id: 'past.realm',
        collectionId: 'past',
        releaseOrder: 1,
      })
      const later = makeDimensionCard({
        releaseOrder: 2,
        extendedCollectionIds: ['past'],
      })
      store.cards = [
        { status: 'published', card: earlier },
        { status: 'published', card: later },
      ]

      const result =
        operation === 'excluir a coleção'
          ? await new DeleteCollectionUseCase(
              store,
              new InMemoryPartiesRepository()
            ).execute({ collectionId: 'past' })
          : await new ReplaceCardUseCase(
              store,
              new ZodCardInputParser()
            ).execute({
              cardId: earlier.id,
              body: toCardInput({ ...earlier, releaseOrder: 3 }),
            })

      expect(result.value).toBeInstanceOf(ContentReferencedError)
      expect(await store.findEditorCard(earlier.id)).toEqual({
        status: 'published',
        card: earlier,
      })
    }
  )
})

describe('REQ-173 — referências comerciais na publicação', () => {
  it.each([
    { extended: ['missing'], reprints: [], path: 'extendedCollectionIds.0' },
    { extended: ['draft'], reprints: [], path: 'extendedCollectionIds.0' },
    { extended: ['future'], reprints: [], path: 'extendedCollectionIds.0' },
    { extended: ['fixture'], reprints: [], path: 'extendedCollectionIds.0' },
    {
      extended: ['past', 'past'],
      reprints: [],
      path: 'extendedCollectionIds.1',
    },
    { extended: ['past'], reprints: ['past'], path: 'reprintCollectionIds.0' },
  ])(
    'rejeita $extended e $reprints no campo $path',
    async ({ extended, reprints, path }) => {
      const store = new InMemoryContentStore()
      store.collections = ['fixture', 'past', 'draft', 'future'].map((id) => ({
        id,
        name: id,
        description: '',
      }))
      const candidate = makeDimensionCard({
        releaseOrder: 3,
        extendedCollectionIds: extended,
        reprintCollectionIds: reprints,
      })
      store.cards = [
        { status: 'draft', card: candidate },
        {
          status: 'published',
          card: makeDimensionCard({ id: 'past.realm', collectionId: 'past' }),
        },
        {
          status: 'draft',
          card: makeDimensionCard({
            id: 'draft.realm',
            collectionId: 'draft',
            releaseOrder: 2,
          }),
        },
        {
          status: 'published',
          card: makeDimensionCard({
            id: 'future.realm',
            collectionId: 'future',
            releaseOrder: 4,
          }),
        },
      ]

      const result = await new PublishCardUseCase(store).execute({
        cardId: candidate.id,
      })

      expect(result.value).toBeInstanceOf(ContentInvalidError)
      if (result.value instanceof ContentInvalidError) {
        expect(result.value.details.fields).toContainEqual(
          expect.objectContaining({ path })
        )
      }
      expect((await store.findEditorCard(candidate.id))?.status).toBe('draft')
    }
  )
})
