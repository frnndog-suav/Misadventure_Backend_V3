import { describe, expect, it, vi } from 'vitest'

import { UniqueEntityID } from '@/core/entities/unique-entity-id'

import {
  makeAttributeCard,
  makeEquipmentCard,
} from '../../../../../../test/factories/make-card'
import {
  makeParty,
  makePlayerState,
} from '../../../../../../test/factories/make-party'
import { fixedClock } from '../../../../../../test/fakes/fixed-clock'
import { InMemoryCardCatalog } from '../../../../../../test/fakes/in-memory-card-catalog'
import { sequentialIds } from '../../../../../../test/fakes/sequential-ids'
import { InMemoryPartiesRepository } from '../../../../../../test/repositories/in-memory-parties-repository'
import { PartyMember } from '../../../enterprise/entities/party-member'
import { ActionInvalidError } from '../_errors/action-invalid-error'
import { ActionNotAllowedError } from '../_errors/action-not-allowed-error'

import { TakePartyActionUseCase } from '.'

describe('TakePartyActionUseCase: ativar', () => {
  it('REQ-107: mantém a ativação fora da rota enquanto a persistência de status está indisponível', async () => {
    const repository = new InMemoryPartiesRepository()
    const party = makeParty({ status: 'inSession' })
    await repository.create(party)
    const save = vi.spyOn(repository, 'save')
    const sut = new TakePartyActionUseCase(
      repository,
      fixedClock(),
      new InMemoryCardCatalog()
    )

    const result = await sut.execute({
      partyId: party.id.toString(),
      body: {
        type: 'prepare',
        operation: 'activate',
        cardId: 'fixture.healing-potion',
        effectIndex: 0,
      },
    })

    expect(result.value).toBeInstanceOf(ActionInvalidError)
    expect(result.value).toMatchObject({
      details: {
        fields: [{ field: 'operation', reason: 'unknownOperation' }],
      },
    })
    expect(save).not.toHaveBeenCalled()
  })

  it('REQ-104, REQ-105, REQ-107: valida a escolha pelo catálogo e salva o status em memória só após sucesso', async () => {
    const strength = makeAttributeCard()
    const endurance = makeAttributeCard({
      id: 'fixture.endurance-basic',
      attributes: ['endurance'],
    })
    const amulet = makeEquipmentCard({
      id: 'fixture.test-amulet',
      slot: 'accessory',
      effects: [
        {
          text: 'Pague uma carta de Força para ganhar 25% de Defesa por duas rodadas.',
          trigger: null,
          cost: [
            {
              kind: 'discardFromHand',
              requirements: [{ attribute: 'strength', count: 1 }],
              excludeAttributes: [],
              constraint: 'none',
              random: false,
            },
          ],
          activation: [
            {
              kind: 'modifierPercent',
              changes: [{ modifier: 'defense', percent: 25 }],
            },
          ],
          duration: { kind: 'forRounds', rounds: 2 },
          mark: 'buff',
        },
      ],
    })
    const player = makePlayerState({
      equipment: { ...makePlayerState().equipment, accessory: amulet.id },
      hand: [endurance.id, strength.id],
    })
    const host = PartyMember.create(
      { characterName: 'Lia', kind: 'human', player },
      new UniqueEntityID('member-1')
    )
    const party = makeParty({ status: 'inSession', members: [host] })
    const repository = new InMemoryPartiesRepository()
    await repository.create(party)
    const save = vi.spyOn(repository, 'save')
    const catalog = new InMemoryCardCatalog()
    catalog.cards = [amulet, strength, endurance]
    const sut = new TakePartyActionUseCase(
      repository,
      fixedClock(),
      catalog,
      sequentialIds('status')
    )
    const partyId = party.id.toString()
    const action = {
      type: 'prepare',
      operation: 'activate',
      cardId: amulet.id,
      effectIndex: 0,
    }

    const refused = await sut.execute({
      partyId,
      body: { ...action, payment: { handCards: [endurance.id] } },
    })

    expect(refused.value).toBeInstanceOf(ActionNotAllowedError)
    expect(refused.value).toMatchObject({
      details: { reason: 'paymentInvalid', cardId: endurance.id },
    })
    expect(save).not.toHaveBeenCalled()

    const accepted = await sut.execute({
      partyId,
      body: { ...action, payment: { handCards: [strength.id] } },
    })

    expect(accepted.isRight()).toBe(true)
    expect(save).toHaveBeenCalledTimes(1)
    const saved = await repository.findById(partyId)
    expect(saved?.members[0].player).toMatchObject({
      hand: [endurance.id],
      discard: [strength.id],
      statuses: [
        {
          statusId: 'status-1',
          sourceCardId: amulet.id,
          text: amulet.effects[0].text,
          activation: amulet.effects[0].activation,
          duration: amulet.effects[0].duration,
          remaining: 2,
        },
      ],
    })
  })
})
