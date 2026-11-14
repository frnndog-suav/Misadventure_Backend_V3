import { type Either, right } from '@/core/error/either'
import { GameConfigRepository } from '@/domain/lab/application/repositories/game-config-repository'
import { GameConfig } from '@/domain/lab/enterprise/value-objects/game-config'

export type TGetGameConfigUseCaseResponse = Either<
  never,
  { config: GameConfig }
>

/** Porta pela qual as regras leem os valores ajustáveis (REQ-09, Constituição 7). */
export class GetGameConfigUseCase {
  constructor(private readonly gameConfigRepository: GameConfigRepository) {}

  async execute(): Promise<TGetGameConfigUseCaseResponse> {
    const saved = await this.gameConfigRepository.get()

    return right({ config: saved ?? GameConfig.withDefaults() })
  }
}
