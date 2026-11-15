import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SeededRng } from '@/core/rng/seeded-rng'
import { GetGameConfigUseCase } from '@/domain/lab/application/use-cases/get-game-config'
import { GameConfig } from '@/domain/lab/enterprise/value-objects/game-config'
import { GAME_CONFIG_DEFAULTS } from '@/domain/lab/enterprise/value-objects/game-config/defaults'
import { fixedClock } from '../../../../../../test/fakes/fixed-clock'
import { fixedSeed } from '../../../../../../test/fakes/fixed-seed'
import { sequentialIds } from '../../../../../../test/fakes/sequential-ids'
import { InMemoryGameConfigRepository } from '../../../../../../test/repositories/in-memory-game-config-repository'
import { InMemoryPartiesRepository } from '../../../../../../test/repositories/in-memory-parties-repository'

import { PartyInvalidError } from '../_errors/party-invalid-error'
import { CreatePartyUseCase } from '.'

const NOW = '2026-11-14T12:00:00.000Z'

let parties: InMemoryPartiesRepository
let configs: InMemoryGameConfigRepository
let sut: CreatePartyUseCase

describe('CreatePartyUseCase', () => {
  beforeEach(() => {
    parties = new InMemoryPartiesRepository()
    configs = new InMemoryGameConfigRepository()
    sut = new CreatePartyUseCase(
      parties,
      new GetGameConfigUseCase(configs),
      fixedClock(NOW),
      sequentialIds('p'),
      fixedSeed(42)
    )
  })

  it('REQ-16: cria e grava o grupo de 1 com o estado inicial do RNG', async () => {
    const result = await sut.execute({
      body: { name: 'Os Teimosos', characterName: 'Lia' },
    })

    expect(result.isRight()).toBe(true)
    if (!result.isRight()) return
    const { party } = result.value
    expect(party.name).toBe('Os Teimosos')
    expect(party.status).toBe('idle')
    expect(party.members.map((m) => m.characterName)).toEqual(['Lia'])
    expect(party.createdAt.toISOString()).toBe(NOW)
    expect(party.savedAt.toISOString()).toBe(NOW)
    expect(party.rngState).toEqual(SeededRng.fromSeed(42).state())
    const stored = await parties.findById(party.id.toString())
    expect(stored?.name).toBe('Os Teimosos')
    expect(stored?.rngState).toEqual(party.rngState)
    expect(stored?.config).toEqual(party.config)
  })

  it('REQ-16: o evento PartyCreated fica no agregado para o despacho', async () => {
    const result = await sut.execute({
      body: { name: 'Os Teimosos', characterName: 'Lia' },
    })
    if (!result.isRight()) throw new Error('esperava sucesso')

    expect(result.value.party.pullDomainEvents().map((e) => e.type)).toEqual([
      'PartyCreated',
    ])
  })

  it.each([null, 'texto', 42, ['a']])(
    'REQ-17: corpo que não é objeto (%j) → invalidBody',
    async (body) => {
      const result = await sut.execute({ body })

      expect(result.isLeft()).toBe(true)
      if (result.isLeft()) {
        expect(result.value).toBeInstanceOf(PartyInvalidError)
        expect(result.value.details).toEqual({
          fields: [{ field: null, reason: 'invalidBody' }],
        })
      }
    }
  )

  it('REQ-17: campos inválidos → PARTY_INVALID e nada é gravado', async () => {
    const result = await sut.execute({
      body: {
        name: '   ',
        characterName: 'Um nome com mais de vinte e quatro letras',
      },
    })

    expect(result.isLeft()).toBe(true)
    if (result.isLeft()) {
      expect(result.value.code).toBe('PARTY_INVALID')
      expect(result.value.message).toBe('Dados do grupo inválidos.')
      expect(result.value.details).toEqual({
        fields: [
          { field: 'name', reason: 'blank' },
          { field: 'characterName', reason: 'tooLong' },
        ],
      })
    }
    expect(parties.items).toEqual([])
  })

  it('REQ-17: minPlayers = 2 → belowMinPlayers', async () => {
    configs.item = GameConfig.create({ ...GAME_CONFIG_DEFAULTS, minPlayers: 2 })

    const result = await sut.execute({
      body: { name: 'Solo', characterName: 'Lia' },
    })

    expect(result.isLeft()).toBe(true)
    if (result.isLeft())
      expect(result.value.details).toEqual({
        fields: [{ field: 'members', reason: 'belowMinPlayers' }],
      })
    expect(parties.items).toEqual([])
  })

  it('REQ-23: grupo guarda a config da criação; o laboratório muda depois', async () => {
    const first = await sut.execute({
      body: { name: 'Antes', characterName: 'Lia' },
    })
    configs.item = GameConfig.create({
      ...GAME_CONFIG_DEFAULTS,
      actionPointsPerTurn: 4,
    })
    const second = await sut.execute({
      body: { name: 'Depois', characterName: 'Lia' },
    })
    configs.item = null

    if (!first.isRight() || !second.isRight())
      throw new Error('esperava sucesso')
    expect(first.value.party.config.actionPointsPerTurn).toBe(3)
    expect(second.value.party.config.actionPointsPerTurn).toBe(4)
  })

  it('REQ-25: sucesso grava uma vez; erro não grava', async () => {
    const create = vi.spyOn(parties, 'create')

    await sut.execute({ body: { name: '', characterName: 'Lia' } })
    expect(create).not.toHaveBeenCalled()

    await sut.execute({ body: { name: 'Ok', characterName: 'Lia' } })
    expect(create).toHaveBeenCalledTimes(1)
  })
})
