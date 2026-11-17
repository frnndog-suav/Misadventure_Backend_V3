import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common'
import { TakePartyActionUseCase } from '@/domain/campaign/application/use-cases/take-party-action'
import { DomainErrorException } from '../../errors/domain-error-exception'
import {
  PartyPresenter,
  type TPartyHttp,
} from '../../presenters/party-presenter'

@Controller('parties/:partyId/actions')
export class TakePartyActionController {
  constructor(private readonly takePartyAction: TakePartyActionUseCase) {}

  // O corpo vai cru: toda a validação é do domínio (REQ-53, D-62).
  @Post()
  @HttpCode(HttpStatus.OK)
  async handle(
    @Param('partyId') partyId: string,
    @Body() body: unknown
  ): Promise<TPartyHttp> {
    const result = await this.takePartyAction.execute({ partyId, body })
    if (result.isLeft()) {
      throw new DomainErrorException(result.value)
    }
    return PartyPresenter.toHTTP(result.value.party)
  }
}
