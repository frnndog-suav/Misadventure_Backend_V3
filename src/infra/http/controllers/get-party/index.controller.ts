import { Controller, Get, Param } from '@nestjs/common'
import { GetPartyUseCase } from '@/domain/campaign/application/use-cases/get-party'
import { DomainErrorException } from '../../errors/domain-error-exception'
import {
  PartyPresenter,
  type TPartyHttp,
} from '../../presenters/party-presenter'

@Controller('parties')
export class GetPartyController {
  constructor(private readonly getParty: GetPartyUseCase) {}

  @Get(':partyId')
  async handle(@Param('partyId') partyId: string): Promise<TPartyHttp> {
    const result = await this.getParty.execute({ partyId })
    if (result.isLeft()) {
      throw new DomainErrorException(result.value)
    }
    return PartyPresenter.toHTTP(result.value.party)
  }
}
