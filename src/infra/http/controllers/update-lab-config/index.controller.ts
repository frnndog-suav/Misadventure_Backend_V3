import { Body, Controller, Patch } from '@nestjs/common'
import { UpdateGameConfigUseCase } from '@/domain/lab/application/use-cases/update-game-config'
import { DomainErrorException } from '../../errors/domain-error-exception'
import {
  LabConfigPresenter,
  type TLabConfigHttp,
} from '../../presenters/lab-config-presenter'

@Controller('lab/config')
export class UpdateLabConfigController {
  constructor(private readonly updateGameConfig: UpdateGameConfigUseCase) {}

  // O corpo vai cru: toda a validação é do domínio (D-15).
  @Patch()
  async handle(@Body() body: unknown): Promise<TLabConfigHttp> {
    const result = await this.updateGameConfig.execute({ patch: body })
    if (result.isLeft()) {
      throw new DomainErrorException(result.value)
    }
    return LabConfigPresenter.toHTTP(result.value.config)
  }
}
