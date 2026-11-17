import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createContentApp } from '../../../../../test/content-app'
import {
  DIMENSION_INVALID,
  WARRIOR_BODY,
  resetCampaign,
} from '../../../../../test/parties-e2e'

// D-52: cópia da fixture sem `dimension.json`; um app por arquivo.
describe('POST /parties sem Carta de Dimensão publicada (e2e)', () => {
  let content: Awaited<ReturnType<typeof createContentApp>>

  beforeAll(async () => {
    content = await createContentApp((root) =>
      rm(join(root, 'fixture', 'dimension.json'))
    )
  })

  afterAll(async () => {
    await content.close()
  })

  it('REQ-36: 409 DIMENSION_INVALID com dimensionCardId null e nada é gravado', async () => {
    await resetCampaign(content.app)

    const response = await request(content.app.getHttpServer())
      .post('/parties')
      .send(WARRIOR_BODY)

    expect(response.status).toBe(409)
    expect(response.body).toEqual({
      error: {
        ...DIMENSION_INVALID,
        details: {
          dimensionCardId: null,
          // Sem Carta não há coleção da dimensão, logo nenhuma zona (D-58 e).
          problems: [
            'A coleção precisa de 1 Carta de Dimensão publicada.',
            'A coleção precisa de pelo menos 1 zona Urbana publicada.',
          ],
        },
      },
    })
    const list = await request(content.app.getHttpServer()).get('/parties')
    expect(list.body).toEqual([])
  })
})
