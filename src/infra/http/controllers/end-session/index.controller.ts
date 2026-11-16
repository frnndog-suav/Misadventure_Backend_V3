import { Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common'
import { EndSessionUseCase } from '@/domain/campaign/application/use-cases/end-session'
import { DomainErrorException } from '../../errors/domain-error-exception'
import {
  PartyPresenter,
  type TPartyHttp,
} from '../../presenters/party-presenter'

@Controller('parties/:partyId/session/end')
export class EndSessionController {
  constructor(private readonly endSession: EndSessionUseCase) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async handle(@Param('partyId') partyId: string): Promise<TPartyHttp> {
    const result = await this.endSession.execute({ partyId })
    if (result.isLeft()) {
      throw new DomainErrorException(result.value)
    }
    return PartyPresenter.toHTTP(result.value.party)
  }
}
