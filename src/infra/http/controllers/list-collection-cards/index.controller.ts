import { Controller, Get, Param, Query } from '@nestjs/common'
import { ListCollectionCardsUseCase } from '@/domain/catalog/application/use-cases/list-collection-cards'
import { DomainErrorException } from '../../errors/domain-error-exception'
import { CardPresenter, type TCardHttp } from '../../presenters/card-presenter'

@Controller('catalog/collections/:collectionId/cards')
export class ListCollectionCardsController {
  constructor(
    private readonly listCollectionCards: ListCollectionCardsUseCase
  ) {}

  // O filtro vai cru: a validação é do caso de uso (REQ-13, D-23).
  @Get()
  async handle(
    @Param('collectionId') collectionId: string,
    @Query('type') type: unknown
  ): Promise<TCardHttp[]> {
    const result = await this.listCollectionCards.execute({
      collectionId,
      type,
    })
    if (result.isLeft()) {
      throw new DomainErrorException(result.value)
    }
    return result.value.cards.map((card) => CardPresenter.toHTTP(card))
  }
}
