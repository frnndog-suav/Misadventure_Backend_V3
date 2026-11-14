import { Controller, Get, Param } from '@nestjs/common'
import { GetCardUseCase } from '@/domain/catalog/application/use-cases/get-card'
import { DomainErrorException } from '../../errors/domain-error-exception'
import { CardPresenter, type TCardHttp } from '../../presenters/card-presenter'

@Controller('catalog/cards')
export class GetCardController {
  constructor(private readonly getCard: GetCardUseCase) {}

  @Get(':cardId')
  async handle(@Param('cardId') cardId: string): Promise<TCardHttp> {
    const result = await this.getCard.execute({ cardId })
    if (result.isLeft()) {
      throw new DomainErrorException(result.value)
    }
    return CardPresenter.toHTTP(result.value.card)
  }
}
