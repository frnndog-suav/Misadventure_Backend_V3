import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'

/**
 * Sobe o app completo com o laboratório ligado ou desligado (D-14).
 * O `ConditionalModule` lê `LAB_ENABLED` quando o `app.module` é importado,
 * por isso a flag é definida antes do import dinâmico. Use um valor só por
 * arquivo de teste (o Vitest isola os módulos por arquivo).
 */
export async function createApp(
  labEnabled: boolean
): Promise<INestApplication> {
  process.env.LAB_ENABLED = labEnabled ? 'true' : 'false'
  const { AppModule } = await import('@/infra/app.module')
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile()
  const app = moduleRef.createNestApplication()
  await app.init()
  return app
}
