import { Controller, Get } from '@nestjs/common'
import { GetGameConfigUseCase } from '@/domain/lab/application/use-cases/get-game-config'
import {
  LabConfigPresenter,
  type TLabConfigHttp,
} from '../../presenters/lab-config-presenter'

@Controller('lab/config')
export class GetLabConfigController {
  constructor(private readonly getGameConfig: GetGameConfigUseCase) {}

  @Get()
  async handle(): Promise<TLabConfigHttp> {
    const result = await this.getGameConfig.execute()
    return LabConfigPresenter.toHTTP(result.value.config)
  }
}
