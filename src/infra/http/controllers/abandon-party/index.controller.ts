import { Controller, Delete, HttpCode, HttpStatus, Param } from '@nestjs/common'
import { AbandonPartyUseCase } from '@/domain/campaign/application/use-cases/abandon-party'
import { DomainErrorException } from '../../errors/domain-error-exception'

@Controller('parties')
export class AbandonPartyController {
  constructor(private readonly abandonParty: AbandonPartyUseCase) {}

  @Delete(':partyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async handle(@Param('partyId') partyId: string): Promise<void> {
    const result = await this.abandonParty.execute({ partyId })
    if (result.isLeft()) {
      throw new DomainErrorException(result.value)
    }
  }
}
