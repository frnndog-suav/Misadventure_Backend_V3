import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common'
import { TakePartyActionUseCase } from '@/domain/campaign/application/use-cases/take-party-action'
import { CardCatalog } from '@/domain/catalog/application/repositories/card-catalog'
import { DomainErrorException } from '../../errors/domain-error-exception'
import {
  findPartyCards,
  PartyPresenter,
  type TPartyHttp,
} from '../../presenters/party-presenter'
import type { TCombatUpdate } from '@/domain/campaign/enterprise/combat'

@Controller('parties/:partyId/actions')
export class TakePartyActionController {
  constructor(
    private readonly takePartyAction: TakePartyActionUseCase,
    private readonly cardCatalog: CardCatalog
  ) {}

  // O corpo vai cru: toda a validação é do domínio (REQ-53, D-62).
  @Post()
  @HttpCode(HttpStatus.OK)
  async handle(
    @Param('partyId') partyId: string,
    @Body() body: unknown
  ): Promise<TPartyHttp & { combatUpdates: readonly TCombatUpdate[] }> {
    const result = await this.takePartyAction.execute({ partyId, body })
    if (result.isLeft()) {
      throw new DomainErrorException(result.value)
    }
    const { party } = result.value
    return {
      ...PartyPresenter.toHTTP(
        party,
        await findPartyCards(this.cardCatalog, party)
      ),
      combatUpdates: party.combatUpdates,
    }
  }
}
