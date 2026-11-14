import { type Either, right } from '@/core/error/either'
import { GameConfigRepository } from '@/domain/lab/application/repositories/game-config-repository'
import { GameConfig } from '@/domain/lab/enterprise/value-objects/game-config'

export type TResetGameConfigUseCaseResponse = Either<
  never,
  { config: GameConfig }
>

/** Restaura os padrões apagando o ajuste salvo (REQ-07, D-13). */
export class ResetGameConfigUseCase {
  constructor(private readonly gameConfigRepository: GameConfigRepository) {}

  async execute(): Promise<TResetGameConfigUseCaseResponse> {
    await this.gameConfigRepository.delete()

    return right({ config: GameConfig.withDefaults() })
  }
}
