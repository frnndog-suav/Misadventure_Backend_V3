import { Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common'
import { EndSessionUseCase } from '@/domain/campaign/application/use-cases/end-session'
import { CardCatalog } from '@/domain/catalog/application/repositories/card-catalog'
import { DomainErrorException } from '../../errors/domain-error-exception'
import {
  findPartyCards,
  PartyPresenter,
  type TPartyHttp,
} from '../../presenters/party-presenter'

@Controller('parties/:partyId/session/end')
export class EndSessionController {
  constructor(
    private readonly endSession: EndSessionUseCase,
    private readonly cardCatalog: CardCatalog
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async handle(@Param('partyId') partyId: string): Promise<TPartyHttp> {
    const result = await this.endSession.execute({ partyId })
    if (result.isLeft()) {
      throw new DomainErrorException(result.value)
    }
    const { party } = result.value
    return PartyPresenter.toHTTP(
      party,
      await findPartyCards(this.cardCatalog, party)
    )
  }
}
