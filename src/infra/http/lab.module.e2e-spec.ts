import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../../test/lab-app'

const NOT_FOUND = {
  error: { code: 'NOT_FOUND', message: 'Recurso não encontrado.' },
}

describe('Laboratório desligado (e2e)', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await createApp(false)
  })

  afterAll(async () => {
    await app.close()
  })

  it.each([
    ['get', '/lab/config'],
    ['patch', '/lab/config'],
    ['post', '/lab/config/reset'],
    ['get', '/lab/content/collections'],
    ['post', '/lab/content/import'],
    ['post', '/lab/parties/p/members/m/grants'],
  ] as const)(
    'REQ-08: com LAB_ENABLED=false, %s %s responde 404 NOT_FOUND',
    async (method, path) => {
      const response = await request(app.getHttpServer())[method](path)

      expect(response.status).toBe(404)
      expect(response.body).toEqual(NOT_FOUND)
    }
  )
})
