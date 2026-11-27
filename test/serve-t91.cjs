/* global require, process, console */
/* eslint-disable @typescript-eslint/no-require-imports */
require('reflect-metadata')
const { AsyncLocalStorage } = require('node:async_hooks')
const { URL } = require('node:url')
const { NestFactory } = require('@nestjs/core')
const { AppModule } = require('../dist/infra/app.module')
const { EnvService } = require('../dist/infra/env/env.service')
const { SeedGenerator } = require('../dist/core/ports/seed-generator')
const { SeededRng } = require('../dist/core/rng/seeded-rng')
const {
  TakePartyActionUseCase,
} = require('../dist/domain/campaign/application/use-cases/take-party-action')
const turnOrder = require('../dist/domain/campaign/enterprise/turn-order')

const context = new AsyncLocalStorage()

async function main() {
  const database = new URL(process.env.DATABASE_URL)
  if (
    database.hostname !== 'localhost' ||
    database.pathname !== '/misadventures_t91'
  )
    throw new Error('Use o banco local dedicado misadventures_t91.')
  if (!process.env.CONTENT_DIR)
    throw new Error('Informe o diretório da cópia dedicada do catálogo.')

  const app = await NestFactory.create(AppModule)
  const env = app.get(EnvService)
  app.enableShutdownHooks()
  app.enableCors({ origin: env.get('CORS_ORIGIN') })
  app.use((request, response, next) => {
    const seedHeader = request.headers['x-t91-seed']
    const cutHeader = request.headers['x-t91-cut-after-ai-turns']
    const seed = seedHeader === undefined ? undefined : Number(seedHeader)
    const cut = cutHeader === undefined ? undefined : Number(cutHeader)
    if (
      (seedHeader !== undefined &&
        (!/^\d+$/.test(seedHeader) || seed > 0xffffffff)) ||
      (cutHeader !== undefined && (!/^\d+$/.test(cutHeader) || cut > 4))
    ) {
      response
        .status(400)
        .json({ error: 'Cabeçalho de preparação T-91 inválido.' })
      return
    }
    context.run({ seed, cut, aiTurns: 0 }, next)
  })

  const seeds = app.get(SeedGenerator)
  const nextSeed = seeds.next.bind(seeds)
  seeds.next = () => context.getStore()?.seed ?? nextSeed()

  const roll = turnOrder.rollTurnOrder
  const nextInt = SeededRng.prototype.nextInt
  turnOrder.rollTurnOrder = (members, rng) => {
    const rolls = []
    rng.nextInt = (min, max) => {
      const result = nextInt.call(rng, min, max)
      rolls.push(result)
      return result
    }
    try {
      const order = roll(members, rng)
      console.log(JSON.stringify({ t91: 'D20', members, rolls, order }))
      return order
    } finally {
      delete rng.nextInt
    }
  }

  const actions = app.get(TakePartyActionUseCase)
  const executeAiTurn = actions.executeAiTurn.bind(actions)
  actions.executeAiTurn = async (party) => {
    const run = context.getStore()
    if (run && run.aiTurns === run.cut) {
      throw new Error(
        `T-91: corte após ${run.aiTurns} vezes automáticas confirmadas.`
      )
    }
    const result = await executeAiTurn(party)
    if (run && result.isRight()) run.aiTurns++
    return result
  }

  await app.listen(env.get('PORT'), '127.0.0.1')
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
