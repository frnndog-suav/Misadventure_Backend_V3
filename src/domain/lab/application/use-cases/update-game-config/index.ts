import { type Either, left, right } from '@/core/error/either'
import { GameConfigRepository } from '@/domain/lab/application/repositories/game-config-repository'
import { GameConfig } from '@/domain/lab/enterprise/value-objects/game-config'

import { LabConfigInvalidError } from '../_errors/lab-config-invalid-error'

export interface TUpdateGameConfigUseCaseRequest {
  /** Corpo do PATCH, ainda não validado (REQ-06 inclui `invalidBody`). */
  patch: unknown
}

export type TUpdateGameConfigUseCaseResponse = Either<
  LabConfigInvalidError,
  { config: GameConfig }
>

/** Ajuste parcial, tudo ou nada (REQ-05, REQ-06). */
export class UpdateGameConfigUseCase {
  constructor(private readonly gameConfigRepository: GameConfigRepository) {}

  async execute({
    patch,
  }: TUpdateGameConfigUseCaseRequest): Promise<TUpdateGameConfigUseCaseResponse> {
    const current =
      (await this.gameConfigRepository.get()) ?? GameConfig.withDefaults()

    const result = current.applyPatch(patch)
    if (result.isLeft()) {
      return left(new LabConfigInvalidError(result.value))
    }

    await this.gameConfigRepository.save(result.value)

    return right({ config: result.value })
  }
}
