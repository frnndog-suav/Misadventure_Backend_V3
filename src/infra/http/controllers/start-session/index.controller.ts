import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common'
import { PartyAdvanceService } from '../../party-advance.service'

@Controller('parties/:partyId/session')
export class StartSessionController {
  constructor(private readonly advance: PartyAdvanceService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  handle(
    @Param('partyId') partyId: string,
    @Headers('idempotency-key') key?: string
  ) {
    return this.advance.startSession(partyId, key)
  }
}
