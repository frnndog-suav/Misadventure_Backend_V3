import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createContentApp } from '../../../../../test/content-app'
import {
  DIMENSION_INVALID,
  WARRIOR_BODY,
  resetCampaign,
} from '../../../../../test/parties-e2e'

// D-52: cópia da fixture com a zona de chegada trocada; um app por arquivo.
describe('POST /parties com zona de chegada que não é Urbana da coleção (e2e)', () => {
  let content: Awaited<ReturnType<typeof createContentApp>>

  beforeAll(async () => {
    content = await createContentApp(async (root) => {
      const file = join(root, 'fixture', 'dimension.json')
      const [dimension] = JSON.parse(await readFile(file, 'utf-8'))
      await writeFile(
        file,
        JSON.stringify([{ ...dimension, arrivalZoneTitle: 'Lugar Nenhum' }])
      )
    })
  })

  afterAll(async () => {
    await content.close()
  })

  it('REQ-36: 409 DIMENSION_INVALID com o id da dimensão e o problema em pt-BR', async () => {
    await resetCampaign(content.app)

    const response = await request(content.app.getHttpServer())
      .post('/parties')
      .send(WARRIOR_BODY)

    expect(response.status).toBe(409)
    expect(response.body).toEqual({
      error: {
        ...DIMENSION_INVALID,
        details: {
          dimensionCardId: 'fixture.test-dimension',
          problems: [
            'A zona de chegada "Lugar Nenhum" da Carta de Dimensão não é uma zona Urbana publicada da coleção.',
          ],
        },
      },
    })
    const list = await request(content.app.getHttpServer()).get('/parties')
    expect(list.body).toEqual([])
  })
})
