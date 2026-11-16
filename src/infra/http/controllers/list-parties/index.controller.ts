import { Controller, Get } from '@nestjs/common'
import { ListPartiesUseCase } from '@/domain/campaign/application/use-cases/list-parties'
import {
  PartySummaryPresenter,
  type TPartySummaryHttp,
} from '../../presenters/party-summary-presenter'

@Controller('parties')
export class ListPartiesController {
  constructor(private readonly listParties: ListPartiesUseCase) {}

  @Get()
  async handle(): Promise<TPartySummaryHttp[]> {
    const result = await this.listParties.execute()
    return result.value.parties.map(PartySummaryPresenter.toHTTP)
  }
}
