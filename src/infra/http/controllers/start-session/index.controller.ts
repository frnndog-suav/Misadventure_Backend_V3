import { Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common'
import { StartSessionUseCase } from '@/domain/campaign/application/use-cases/start-session'
import { CardCatalog } from '@/domain/catalog/application/repositories/card-catalog'
import { DomainErrorException } from '../../errors/domain-error-exception'
import {
  findPartyCards,
  PartyPresenter,
  type TPartyHttp,
} from '../../presenters/party-presenter'

@Controller('parties/:partyId/session')
export class StartSessionController {
  constructor(
    private readonly startSession: StartSessionUseCase,
    private readonly cardCatalog: CardCatalog
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async handle(@Param('partyId') partyId: string): Promise<TPartyHttp> {
    const result = await this.startSession.execute({ partyId })
    if (result.isLeft()) {
      throw new DomainErrorException(result.value)
    }
    const { party } = result.value
    return PartyPresenter.toHTTP(
      party,
      await findPartyCards(this.cardCatalog, party),
      await this.cardCatalog.listClasses()
    )
  }
}
