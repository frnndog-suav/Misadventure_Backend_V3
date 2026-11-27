import { Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common'
import { PartyAdvanceService } from '../../party-advance.service'

@Controller('parties/:partyId/session')
export class StartSessionController {
  constructor(private readonly advance: PartyAdvanceService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  handle(@Param('partyId') partyId: string) {
    return this.advance.startSession(partyId)
  }
}
