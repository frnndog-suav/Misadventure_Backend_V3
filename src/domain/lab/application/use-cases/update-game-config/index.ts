import { type Either, left, right } from '@/core/error/either'
import type { CardCatalog } from '@/domain/catalog/application/repositories/card-catalog'
import { GameConfigRepository } from '@/domain/lab/application/repositories/game-config-repository'
import {
  GameConfig,
  type TGameConfigIssue,
} from '@/domain/lab/enterprise/value-objects/game-config'

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
  constructor(
    private readonly gameConfigRepository: GameConfigRepository,
    private readonly catalog: CardCatalog
  ) {}

  async execute({
    patch,
  }: TUpdateGameConfigUseCaseRequest): Promise<TUpdateGameConfigUseCaseResponse> {
    const current =
      (await this.gameConfigRepository.get()) ?? GameConfig.withDefaults()

    const result = current.applyPatch(patch)
    if (result.isLeft()) {
      return left(new LabConfigInvalidError(result.value))
    }

    if (
      typeof patch === 'object' &&
      patch !== null &&
      Object.hasOwn(patch, 'reserveDeck')
    ) {
      const issues: TGameConfigIssue[] = []
      for (const [index, entry] of result.value.values.reserveDeck.entries()) {
        if (entry.type !== 'card') continue
        const card = await this.catalog.findCard(entry.cardId)
        if (
          card?.type !== 'item' ||
          (card.itemCategory !== 'consumable' &&
            card.itemCategory !== 'material')
        ) {
          issues.push({
            field: `reserveDeck.${index}.cardId`,
            reason: 'outOfRange',
          })
        }
      }
      if (issues.length > 0) {
        return left(new LabConfigInvalidError(issues))
      }
    }

    await this.gameConfigRepository.save(result.value)

    return right({ config: result.value })
  }
}
