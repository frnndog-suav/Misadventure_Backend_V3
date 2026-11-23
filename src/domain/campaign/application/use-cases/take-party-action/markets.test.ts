import { describe, expect, it } from 'vitest'

import { GAME_CONFIG_DEFAULTS } from '@/domain/lab/enterprise/value-objects/game-config/defaults'
import { makeFixtureContent } from '../../../../../../test/factories/make-card'
import { makeParty } from '../../../../../../test/factories/make-party'
import { fixedClock } from '../../../../../../test/fakes/fixed-clock'
import { InMemoryCardCatalog } from '../../../../../../test/fakes/in-memory-card-catalog'
import { InMemoryPartiesRepository } from '../../../../../../test/repositories/in-memory-parties-repository'

import { TakePartyActionUseCase } from '.'

describe('TakePartyActionUseCase — mercados (REQ-139)', () => {
  it('REQ-139: o novo pool do fim da rodada sorteia entre as elegíveis da coleção da dimensão', async () => {
    const repository = new InMemoryPartiesRepository()
    const content = makeFixtureContent()
    const catalog = new InMemoryCardCatalog()
    catalog.collections = content.collections
    catalog.cards = content.cards
    catalog.classes = content.classes
    const party = makeParty({
      status: 'inSession',
      config: { ...GAME_CONFIG_DEFAULTS, singlesDecayMax: 20 },
      markets: [
        {
          zoneId: 'fixture.gray-harbor',
          factorPercent: 100,
          singles: true,
          stock: [{ cardId: 'gone', copies: 1 }],
          showcase: ['gone', null, null, null],
        },
      ],
      marketPool: [{ cardId: 'gone', departed: 0 }],
    })
    await repository.create(party)
    const sut = new TakePartyActionUseCase(
      repository,
      fixedClock('2026-11-23T12:00:00.000Z'),
      catalog
    )

    const result = await sut.execute({
      partyId: party.id.toString(),
      body: { type: 'endTurn' },
    })

    expect(result.isRight()).toBe(true)
    const stored = await repository.findById(party.id.toString())
    const eligible = [
      'fixture.dexterity-basic',
      'fixture.endurance-basic',
      'fixture.strength-basic',
    ]
    expect(stored?.marketPool.length).toBeGreaterThan(0)
    expect(
      stored?.marketPool.every(({ cardId }) => eligible.includes(cardId))
    ).toBe(true)
    expect(stored?.contentInUse().cardIds).not.toContain('gone')
  })
})
