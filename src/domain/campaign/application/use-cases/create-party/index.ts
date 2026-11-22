import { type Either, left, right } from '@/core/error/either'
import type { Clock } from '@/core/ports/clock'
import type { IdGenerator } from '@/core/ports/id-generator'
import type { SeedGenerator } from '@/core/ports/seed-generator'
import { SeededRng } from '@/core/rng/seeded-rng'
import { PartiesRepository } from '@/domain/campaign/application/repositories/parties-repository'
import { Party } from '@/domain/campaign/enterprise/entities/party'
import { CardCatalog } from '@/domain/catalog/application/repositories/card-catalog'
import type {
  TAttributeCard,
  TCard,
  TClassDefinition,
  TDimensionCard,
  TZoneCard,
} from '@/domain/catalog/enterprise/value-objects/card'
import type { GetGameConfigUseCase } from '@/domain/lab/application/use-cases/get-game-config'

import { DimensionInvalidError } from '../_errors/dimension-invalid-error'
import { PartyInvalidError } from '../_errors/party-invalid-error'

export interface TCreatePartyUseCaseRequest {
  /** Corpo do POST, ainda não validado (REQ-17 inclui `invalidBody`). */
  body: unknown
}

export type TCreatePartyUseCaseResponse = Either<
  PartyInvalidError | DimensionInvalidError,
  { party: Party }
>

/**
 * Criar grupo de 1 já preparado (REQ-16, REQ-17, REQ-23, REQ-31 a REQ-36);
 * grava ao terminar com sucesso (REQ-25). Só o conteúdo publicado entra
 * (`CardCatalog`, REQ-41).
 */
export class CreatePartyUseCase {
  constructor(
    private readonly partiesRepository: PartiesRepository,
    private readonly getGameConfig: GetGameConfigUseCase,
    private readonly cardCatalog: CardCatalog,
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

    const classDefinition =
      typeof body.playerClass === 'string'
        ? await this.cardCatalog.findClass(body.playerClass)
        : null
    const { dimension, zones, cards } = await this.findFirstDimension()

    const result = Party.create(
      {
        name: body.name,
        characterName: body.characterName,
        playerClass: body.playerClass,
        classDefinition,
        attributeCards: await this.findStarterCards(classDefinition),
        dimension,
        zones,
        dimensionCards: cards,
        config: config.values,
        rngState: SeededRng.fromSeed(this.seeds.next()).state(),
        now: this.clock.now(),
      },
      this.ids
    )
    if (result.isLeft()) {
      const failure = result.value
      switch (failure.type) {
        case 'invalid':
          return left(new PartyInvalidError(failure.issues))
        case 'dimensionInvalid':
          return left(
            new DimensionInvalidError(failure.dimensionCardId, failure.problems)
          )
        default: {
          const _exhaustive: never = failure
          return _exhaustive
        }
      }
    }

    await this.partiesRepository.create(result.value)

    return right({ party: result.value })
  }

  /** A dimensão de menor `releaseOrder` (README 28.1) e as zonas da sua coleção (README 27). */
  private async findFirstDimension(): Promise<{
    dimension: TDimensionCard | null
    zones: TZoneCard[]
    cards: TCard[]
  }> {
    let first: { dimension: TDimensionCard; cards: TCard[] } | null = null
    for (const collection of await this.cardCatalog.listCollections()) {
      const cards = await this.cardCatalog.listCards(collection.id)
      for (const card of cards) {
        if (card.type !== 'dimension') continue
        if (!first || card.releaseOrder < first.dimension.releaseOrder) {
          first = { dimension: card, cards }
        }
      }
    }
    if (!first) return { dimension: null, zones: [], cards: [] }

    return {
      dimension: first.dimension,
      cards: first.cards,
      zones: first.cards.filter(
        (card): card is TZoneCard => card.type === 'zone'
      ),
    }
  }

  private async findStarterCards(
    classDefinition: TClassDefinition | null
  ): Promise<TAttributeCard[]> {
    const cards: TAttributeCard[] = []
    for (const { cardId } of classDefinition?.starterDeck ?? []) {
      const card = await this.cardCatalog.findCard(cardId)
      if (card?.type === 'attribute') cards.push(card)
    }
    return cards
  }
}

function isPlainObject(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input)
}
