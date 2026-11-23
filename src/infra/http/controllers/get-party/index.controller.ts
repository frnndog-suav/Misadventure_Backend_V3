import { Controller, Get, Param } from '@nestjs/common'
import { GetPartyUseCase } from '@/domain/campaign/application/use-cases/get-party'
import { CardCatalog } from '@/domain/catalog/application/repositories/card-catalog'
import { DomainErrorException } from '../../errors/domain-error-exception'
import {
  findPartyCards,
  PartyPresenter,
  type TPartyHttp,
} from '../../presenters/party-presenter'

@Controller('parties')
export class GetPartyController {
  constructor(
    private readonly getParty: GetPartyUseCase,
    private readonly cardCatalog: CardCatalog
  ) {}

  @Get(':partyId')
  async handle(@Param('partyId') partyId: string): Promise<TPartyHttp> {
    const result = await this.getParty.execute({ partyId })
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
