import { Body, Controller, Post } from '@nestjs/common'
import { CreatePartyUseCase } from '@/domain/campaign/application/use-cases/create-party'
import { DomainErrorException } from '../../errors/domain-error-exception'
import {
  PartyPresenter,
  type TPartyHttp,
} from '../../presenters/party-presenter'

@Controller('parties')
export class CreatePartyController {
  constructor(private readonly createParty: CreatePartyUseCase) {}

  // O corpo vai cru: toda a validação é do domínio (REQ-17, como D-17).
  @Post()
  async handle(@Body() body: unknown): Promise<TPartyHttp> {
    const result = await this.createParty.execute({ body })
    if (result.isLeft()) {
      throw new DomainErrorException(result.value)
    }
    return PartyPresenter.toHTTP(result.value.party)
  }
}
