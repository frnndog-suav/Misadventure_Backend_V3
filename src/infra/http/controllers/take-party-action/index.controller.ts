import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common'
import { PartyAdvanceService } from '../../party-advance.service'

@Controller('parties/:partyId/actions')
export class TakePartyActionController {
  constructor(private readonly advance: PartyAdvanceService) {}

  // O corpo vai cru: toda a validação é do domínio (REQ-53, D-62).
  @Post()
  @HttpCode(HttpStatus.OK)
  handle(
    @Param('partyId') partyId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined
  ) {
    return this.advance.takeAction(partyId, body, key)
  }
}
