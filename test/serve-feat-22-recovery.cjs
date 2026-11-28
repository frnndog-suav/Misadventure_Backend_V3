/* global require, process, console */
/* eslint-disable @typescript-eslint/no-require-imports */
const { AsyncLocalStorage } = require('node:async_hooks')
const { NestFactory } = require('@nestjs/core')
const { AppModule } = require('../dist/infra/app.module')
const { EnvService } = require('../dist/infra/env/env.service')
const {
  TakePartyActionUseCase,
} = require('../dist/domain/campaign/application/use-cases/take-party-action')

async function main() {
  const [partyId, sessionKey, answerKey] = process.argv.slice(2)
  const uuid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i
  if (
    !uuid.test(partyId) ||
    ![sessionKey, answerKey].every(
      (value) => value === 'auto' || uuid.test(value)
    )
  ) {
    throw new Error(
      'Informe o UUID do save e as chaves de sessão e resposta ou auto.'
    )
  }

  const app = await NestFactory.create(AppModule)
  const env = app.get(EnvService)
  const request = new AsyncLocalStorage()
  const faults = new Map([
    [`/parties/${partyId}/session`, sessionKey],
    [`/parties/${partyId}/actions`, answerKey],
  ])
  app.use((req, _res, next) => {
    request.run(
      {
        method: req.method,
        path: req.path,
        key: req.headers['idempotency-key'],
      },
      next
    )
  })
  const executor = app.get(TakePartyActionUseCase)
  const executeAiTurn = executor.executeAiTurn.bind(executor)
  executor.executeAiTurn = async (party) => {
    const current = request.getStore()
    const fault = faults.get(current?.path)
    if (
      party.id.toString() === partyId &&
      current?.method === 'POST' &&
      uuid.test(current.key) &&
      (fault === current.key || fault === 'auto')
    ) {
      faults.delete(current.path)
      throw new Error(`T-117: interrupção injetada em ${current.path}`)
    }
    return executeAiTurn(party)
  }
  app.enableShutdownHooks()
  app.enableCors({ origin: env.get('CORS_ORIGIN') })
  await app.listen(env.get('PORT'), '127.0.0.1')
  console.log(
    `T-117: serviço de recuperação disponível em ${await app.getUrl()}`
  )
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
