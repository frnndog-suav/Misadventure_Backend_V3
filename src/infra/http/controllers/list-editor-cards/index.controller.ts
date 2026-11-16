import { Controller, Get, Param, Query } from '@nestjs/common'
import { ListEditorCardsUseCase } from '@/domain/catalog/application/use-cases/list-editor-cards'
import { DomainErrorException } from '../../errors/domain-error-exception'
import {
  EditorCardPresenter,
  type TEditorCardSummaryHttp,
} from '../../presenters/editor-card-presenter'

@Controller('lab/content/collections/:collectionId/cards')
export class ListEditorCardsController {
  constructor(private readonly listEditorCards: ListEditorCardsUseCase) {}

  // Filtros crus (repetido chega como lista): a validação é do caso de uso (REQ-46).
  @Get()
  async handle(
    @Param('collectionId') collectionId: string,
    @Query('type') type: unknown,
    @Query('status') status: unknown,
    @Query('q') q: unknown
  ): Promise<TEditorCardSummaryHttp[]> {
    const result = await this.listEditorCards.execute({
      collectionId,
      type,
      status,
      q,
    })
    if (result.isLeft()) {
      throw new DomainErrorException(result.value)
    }
    return result.value.cards.map((card) =>
      EditorCardPresenter.toSummaryHTTP(card)
    )
  }
}
