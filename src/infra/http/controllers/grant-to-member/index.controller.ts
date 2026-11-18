import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common'
import { GrantToMemberUseCase } from '@/domain/campaign/application/use-cases/grant-to-member'
import { CardCatalog } from '@/domain/catalog/application/repositories/card-catalog'
import { DomainErrorException } from '../../errors/domain-error-exception'
import {
  findPartyCards,
  PartyPresenter,
  type TPartyHttp,
} from '../../presenters/party-presenter'

// Doação do laboratório (REQ-77, D-78). Só existe com LAB_ENABLED (D-14).
@Controller('lab/parties/:partyId/members/:memberId/grants')
export class GrantToMemberController {
  constructor(
    private readonly grantToMember: GrantToMemberUseCase,
    private readonly cardCatalog: CardCatalog
  ) {}

  // O corpo vai cru: toda a validação é do domínio (como D-62).
  @Post()
  @HttpCode(HttpStatus.OK)
  async handle(
    @Param('partyId') partyId: string,
    @Param('memberId') memberId: string,
    @Body() body: unknown
  ): Promise<TPartyHttp> {
    const result = await this.grantToMember.execute({ partyId, memberId, body })
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
