import { describe, expect, it } from 'vitest'

import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { PartyMember } from '@/domain/campaign/enterprise/entities/party-member'
import {
  makeParty,
  makePlayerState,
} from '../../../../../../test/factories/make-party'
import { InMemoryPartiesRepository } from '../../../../../../test/repositories/in-memory-parties-repository'

describe('REQ-39: conteúdo em uso por saves', () => {
  it('REQ-39: o save usa a Carta de Dimensão, as zonas do mapa, a build e as classes', () => {
    const inUse = makeParty().contentInUse()

    expect(inUse.cardIds.sort()).toEqual([
      'fixture.endurance-basic',
      'fixture.gray-harbor',
      'fixture.old-mine',
      'fixture.strength-basic',
      'fixture.test-dimension',
    ])
    expect(inUse.playerClasses).toEqual(['warrior'])
  })

  it('REQ-39: junta a build e as classes de todos os membros', () => {
    const second = PartyMember.create(
      {
        characterName: 'Bia',
        kind: 'human',
        player: makePlayerState({
          playerClasses: [{ playerClass: 'rogue', deckLockMet: true }],
          build: [{ cardId: 'fixture.dexterity-basic', copies: 60 }],
        }),
      },
      new UniqueEntityID('member-2')
    )
    const party = makeParty()
    const inUse = makeParty({
      members: [...party.members, second],
    }).contentInUse()

    expect(inUse.cardIds).toContain('fixture.dexterity-basic')
    expect(inUse.playerClasses.sort()).toEqual(['rogue', 'warrior'])
  })

  it('REQ-39: repositório em memória une os saves; apagado o grupo, deixa de estar em uso', async () => {
    const repository = new InMemoryPartiesRepository()
    expect((await repository.findContentInUse()).cardIds.size).toBe(0)

    const party = makeParty()
    await repository.create(party)
    const inUse = await repository.findContentInUse()
    expect(inUse.cardIds.has('fixture.test-dimension')).toBe(true)
    expect(inUse.playerClasses.has('warrior')).toBe(true)

    await repository.delete(party)
    const after = await repository.findContentInUse()
    expect(after.cardIds.size).toBe(0)
    expect(after.playerClasses.size).toBe(0)
  })
})
