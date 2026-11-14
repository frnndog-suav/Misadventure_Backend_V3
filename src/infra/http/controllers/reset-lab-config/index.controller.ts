import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common'
import { ResetGameConfigUseCase } from '@/domain/lab/application/use-cases/reset-game-config'
import {
  LabConfigPresenter,
  type TLabConfigHttp,
} from '../../presenters/lab-config-presenter'

@Controller('lab/config/reset')
export class ResetLabConfigController {
  constructor(private readonly resetGameConfig: ResetGameConfigUseCase) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async handle(): Promise<TLabConfigHttp> {
    const result = await this.resetGameConfig.execute()
    return LabConfigPresenter.toHTTP(result.value.config)
  }
}
