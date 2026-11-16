import { Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common'
import { StartSessionUseCase } from '@/domain/campaign/application/use-cases/start-session'
import { DomainErrorException } from '../../errors/domain-error-exception'
import {
  PartyPresenter,
  type TPartyHttp,
} from '../../presenters/party-presenter'

@Controller('parties/:partyId/session')
export class StartSessionController {
  constructor(private readonly startSession: StartSessionUseCase) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async handle(@Param('partyId') partyId: string): Promise<TPartyHttp> {
    const result = await this.startSession.execute({ partyId })
    if (result.isLeft()) {
      throw new DomainErrorException(result.value)
    }
    return PartyPresenter.toHTTP(result.value.party)
  }
}
