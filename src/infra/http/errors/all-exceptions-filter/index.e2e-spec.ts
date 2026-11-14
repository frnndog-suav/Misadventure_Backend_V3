import { Controller, Get, INestApplication, Logger } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { AppModule } from '@/infra/app.module'

// Controller descartável, existe só neste teste (REQ-03: sem endpoint de depuração).
@Controller('__test-boom')
class BoomController {
  @Get()
  boom(): never {
    throw new Error('falha proposital do teste')
  }
}

describe('Filtro global de erros (e2e)', () => {
  let app: INestApplication

  beforeAll(async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [BoomController],
    }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
    vi.restoreAllMocks()
  })

  it.each(['get', 'post', 'put', 'patch', 'delete'] as const)(
    'REQ-02: %s em rota inexistente responde 404 NOT_FOUND',
    async (method) => {
      const response = await request(app.getHttpServer())[method](
        '/rota-que-nao-existe'
      )

      expect(response.status).toBe(404)
      expect(response.body).toEqual({
        error: { code: 'NOT_FOUND', message: 'Recurso não encontrado.' },
      })
    }
  )

  it('REQ-03: exceção não tratada responde 500 INTERNAL_ERROR sem stack trace', async () => {
    const response = await request(app.getHttpServer()).get('/__test-boom')

    expect(response.status).toBe(500)
    expect(response.body).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Erro inesperado no servidor. Tente novamente.',
      },
    })
    expect(response.text).not.toMatch(/falha proposital|at /)
  })
})
