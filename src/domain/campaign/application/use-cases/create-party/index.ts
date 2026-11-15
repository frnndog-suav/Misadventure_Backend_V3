import { type Either, left, right } from '@/core/error/either'
import type { Clock } from '@/core/ports/clock'
import type { IdGenerator } from '@/core/ports/id-generator'
import type { SeedGenerator } from '@/core/ports/seed-generator'
import { SeededRng } from '@/core/rng/seeded-rng'
import { PartiesRepository } from '@/domain/campaign/application/repositories/parties-repository'
import { Party } from '@/domain/campaign/enterprise/entities/party'
import type { GetGameConfigUseCase } from '@/domain/lab/application/use-cases/get-game-config'

import { PartyInvalidError } from '../_errors/party-invalid-error'

export interface TCreatePartyUseCaseRequest {
  /** Corpo do POST, ainda não validado (REQ-17 inclui `invalidBody`). */
  body: unknown
}

export type TCreatePartyUseCaseResponse = Either<
  PartyInvalidError,
  { party: Party }
>

/** Criar grupo de 1 (REQ-16, REQ-17, REQ-23); grava ao terminar com sucesso (REQ-25). */
export class CreatePartyUseCase {
  constructor(
    private readonly partiesRepository: PartiesRepository,
    private readonly getGameConfig: GetGameConfigUseCase,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly seeds: SeedGenerator
  ) {}

  async execute({
    body,
  }: TCreatePartyUseCaseRequest): Promise<TCreatePartyUseCaseResponse> {
    if (!isPlainObject(body)) {
      return left(
        new PartyInvalidError([{ field: null, reason: 'invalidBody' }])
      )
    }

    const configResult = await this.getGameConfig.execute()
    const { config } = configResult.value

    const result = Party.create(
      {
        name: body.name,
        characterName: body.characterName,
        config: config.values,
        rngState: SeededRng.fromSeed(this.seeds.next()).state(),
        now: this.clock.now(),
      },
      this.ids
    )
    if (result.isLeft()) {
      return left(new PartyInvalidError(result.value))
    }

    await this.partiesRepository.create(result.value)

    return right({ party: result.value })
  }
}

function isPlainObject(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input)
}
