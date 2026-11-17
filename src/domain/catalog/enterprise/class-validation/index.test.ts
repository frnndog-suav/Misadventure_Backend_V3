import { describe, expect, it } from 'vitest'

import {
  makeAttributeCard,
  makeClassDefinition,
} from '../../../../../test/factories/make-card'
import type { TEditorCard } from '@/domain/catalog/enterprise/value-objects/content'

import { validateClassCandidate } from '.'

const published = (card = makeAttributeCard()): TEditorCard => ({
  status: 'published',
  card,
})
const dexterity = makeAttributeCard({
  id: 'fixture.dexterity-basic',
  name: 'Destreza',
  attributes: ['dexterity'],
})
const cards = [published(), published(dexterity)]

describe('validateClassCandidate (REQ-38)', () => {
  it('REQ-38: classe válida, rascunho ou publicada, não tem problemas', () => {
    for (const status of ['draft', 'published'] as const) {
      expect(
        validateClassCandidate({
          candidate: makeClassDefinition(),
          status,
          others: [],
          cards,
        })
      ).toEqual([])
    }
  })

  it('REQ-38: caminhos com pontos e índices; rascunho não confere tamanho nem trava', () => {
    const candidate = makeClassDefinition({
      essentialAttributes: [],
      baseModifiers: { ...makeClassDefinition().baseModifiers, attack: -1 },
      starterDeck: [{ cardId: 'fixture.ghost', copies: 0 }],
    })

    expect(
      validateClassCandidate({ candidate, status: 'draft', others: [], cards })
    ).toEqual([
      { path: 'essentialAttributes', reason: 'essentialAttributeCount' },
      { path: 'baseModifiers.attack', reason: 'outOfRange' },
      { path: 'starterDeck.0.cardId', reason: 'unknownCard' },
      { path: 'starterDeck.0.copies', reason: 'outOfRange' },
    ])
  })

  it('REQ-38: publicada confere total e trava', () => {
    const candidate = makeClassDefinition({
      starterDeck: [
        { cardId: 'fixture.strength-basic', copies: 1 },
        { cardId: 'fixture.dexterity-basic', copies: 1 },
      ],
    })

    expect(
      validateClassCandidate({
        candidate,
        status: 'published',
        others: [],
        cards,
      })
    ).toEqual([
      { path: 'starterDeck', reason: 'starterDeckSize' },
      { path: 'starterDeck', reason: 'starterDeckLockNotMet' },
    ])
  })

  it('REQ-38: publicada exige todas as cartas do deck publicadas', () => {
    const draftDexterity: TEditorCard = { status: 'draft', card: dexterity }

    expect(
      validateClassCandidate({
        candidate: makeClassDefinition(),
        status: 'published',
        others: [],
        cards: [published(), draftDexterity],
      })
    ).toEqual([
      { path: 'starterDeck.1.cardId', reason: 'starterDeckCardNotPublished' },
    ])
    expect(
      validateClassCandidate({
        candidate: makeClassDefinition(),
        status: 'draft',
        others: [],
        cards: [published(), draftDexterity],
      })
    ).toEqual([])
  })

  it('REQ-38: name único entre todas as classes; essenciais únicos só entre as publicadas (8.5)', () => {
    const other = {
      status: 'published' as const,
      classDefinition: makeClassDefinition({ playerClass: 'mage' }),
    }
    const candidate = makeClassDefinition({ playerClass: 'rogue' })

    expect(
      validateClassCandidate({
        candidate,
        status: 'published',
        others: [other],
        cards,
      })
    ).toEqual([
      { path: 'name', reason: 'duplicateName' },
      { path: 'essentialAttributes', reason: 'duplicateEssentials' },
    ])
    expect(
      validateClassCandidate({
        candidate,
        status: 'draft',
        others: [other],
        cards,
      })
    ).toEqual([{ path: 'name', reason: 'duplicateName' }])
  })

  it('REQ-38: o playerClass repetido não é problema aqui (vira 409 no caso de uso)', () => {
    expect(
      validateClassCandidate({
        candidate: makeClassDefinition(),
        status: 'draft',
        others: [
          {
            status: 'draft',
            classDefinition: makeClassDefinition({ name: 'Outro' }),
          },
        ],
        cards,
      })
    ).toEqual([])
  })
})
