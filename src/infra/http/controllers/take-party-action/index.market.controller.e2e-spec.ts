import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createContentApp } from '../../../../../test/content-app'
import { postParty, resetCampaign } from '../../../../../test/parties-e2e'

// CONTRATO v0.80, FEAT-16 (T-63): Ir ao Mercado de ponta a ponta (REQ-140 a
// REQ-142). O fator fixo (115) e o ouro inicial 0 vêm do laboratório; o estado
// é montado pela doação (REQ-77). Compra de single e sorteio exato ficam nos
// testes de unidade (`fixedRng`); aqui o slot sorteado é lido da projeção.

const A = 'fixture.arrows'
const P = 'fixture.healing-potion'
const F = 'fixture.fishing-rod'
const BO = 'fixture.booster'
const C = 'fixture.lucky-coin'
const W = 'fixture.short-sword'
const STR = 'fixture.strength-basic'

type TOffer = { cardId: string; price: number; destination: string } | null

type TPlayer = {
  gold: number
  inventory: { cardId: string; quantity: number }[]
  tcgFolder: { cardId: string; copies: number }[]
  availableActions: string[]
  purseCapacity: number
  vaultCapacity: number
  vaultDeckSlots: number
  vaultGoldCapacity: number
  tcgFolderCapacity: number
  expansions: Record<string, number>
  moveTargets: string[]
  market: {
    zoneId: string
    factorPercent: number
    stock: { cardId: string; price: number; copiesPerPurchase: number }[]
    boosters: { cardId: string; price: number }[]
    showcase: { slotIndex: number; offer: TOffer }[] | null
    services: { expansion: string; price: number; capacity: number }[]
    sellOffers: {
      source: string
      cardId: string
      owned: number
      lotSize: number
      price: number
    }[]
  } | null
  lastMarketVisit: {
    zoneId: string
    results: Record<string, unknown>[]
    goldLost: number
  } | null
  lastBoosterOpening: {
    boosterCardId: string
    via: string
    cards: { cardId: string; destination: string }[]
  } | null
  vault: { slots: { cardId: string; quantity: number }[] }
}

type TParty = {
  id: string
  turn: { actionPoints: number }
  members: { id: string; player: TPlayer }[]
}

const notAllowed = (details: object) => ({
  error: {
    code: 'ACTION_NOT_ALLOWED',
    message: 'Esta ação não é permitida agora.',
    details,
  },
})

const visitMarket = (...operations: unknown[]) => ({
  type: 'visitMarket',
  operations,
})

describe('Ir ao Mercado (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createContentApp>>

  beforeAll(async () => {
    ctx = await createContentApp()
  })

  beforeEach(async () => {
    await resetCampaign(ctx.app)
    await request(server())
      .patch('/lab/config')
      .send({
        initialGold: 0,
        marketFactorMinPercent: 115,
        marketFactorMaxPercent: 115,
      })
      .expect(200)
  })

  afterAll(async () => {
    await ctx.close()
  })

  const server = () => ctx.app.getHttpServer()

  async function startedParty(): Promise<TParty> {
    const created = await postParty(ctx.app)
    return (
      await request(server()).post(`/parties/${created.id}/session`).expect(200)
    ).body
  }

  const act = (id: string, body: unknown) =>
    request(server())
      .post(`/parties/${id}/actions`)
      .send(body as object)

  async function grant(party: TParty, body: object) {
    await request(server())
      .post(`/lab/parties/${party.id}/members/${party.members[0].id}/grants`)
      .send(body)
      .expect(200)
  }

  const give = (party: TParty, cardId: string, quantity = 1) =>
    grant(party, { type: 'card', cardId, quantity })

  const get = async (id: string): Promise<TParty> =>
    (await request(server()).get(`/parties/${id}`)).body

  const player = (party: TParty) => party.members[0].player

  it('REQ-140: na criação, market com preços no fator 115, lastMarketVisit null e visitMarket depois de useVault', async () => {
    const created = (await postParty(ctx.app)) as unknown as TParty
    const p = player(created)

    expect(p.lastMarketVisit).toBeNull()
    expect(p.market?.zoneId).toBe('fixture.gray-harbor')
    expect(p.market?.factorPercent).toBe(115)
    expect(p.market?.stock).toEqual([
      { cardId: P, price: 7, copiesPerPurchase: 1 },
      { cardId: A, price: 4, copiesPerPurchase: 10 },
      { cardId: F, price: 23, copiesPerPurchase: 1 },
    ])
    expect(p.market?.boosters).toEqual([{ cardId: BO, price: 30 }])
    expect(p.market?.showcase).toHaveLength(4)
    expect(p.market?.services).toEqual([
      { expansion: 'vaultSlots', price: 50, capacity: 35 },
      { expansion: 'deckSlots', price: 100, capacity: 11 },
      { expansion: 'tcgFolder', price: 60, capacity: 40 },
      { expansion: 'purse', price: 150, capacity: 600 },
      { expansion: 'vaultGold', price: 500, capacity: 4000 },
    ])
    expect(p.market?.sellOffers).toEqual([])
    // Grupo idle: saveRespawnPoint só entra em sessão (REQ-124).
    expect(p.availableActions).toEqual([
      'move',
      'recover',
      'adjustDeck',
      'useVault',
      'visitBlacksmith',
      'visitMarket',
      'startEvent',
      'endTurn',
    ])
  })

  it('REQ-141/REQ-142: estoque em lote — 2 compras de flechas a 4 ouro dão 20 cópias; vender 15 recusa, vender 10 paga 1', async () => {
    const party = await startedParty()
    await grant(party, { type: 'gold', amount: 100 })

    const bought = await act(
      party.id,
      visitMarket({ operation: 'buyStock', cardId: A, quantity: 2 })
    )

    expect(bought.status).toBe(200)
    const p = player(bought.body)
    expect(p.gold).toBe(92)
    expect(p.inventory).toContainEqual({ cardId: A, quantity: 20 })
    expect(bought.body.turn.actionPoints).toBe(party.turn.actionPoints - 1)
    expect(p.lastMarketVisit?.results).toEqual([
      {
        operation: 'buyStock',
        cardId: A,
        quantity: 2,
        copiesReceived: 20,
        gold: -8,
      },
    ])
    expect(p.market?.sellOffers).toContainEqual({
      source: 'inventory',
      cardId: A,
      owned: 20,
      lotSize: 10,
      price: 1,
    })

    const bad = await act(
      party.id,
      visitMarket({
        operation: 'sell',
        source: 'inventory',
        cardId: A,
        quantity: 15,
      })
    )
    expect(bad.status).toBe(409)
    expect(bad.body).toEqual(
      notAllowed({ reason: 'notLotMultiple', cardId: A, operationIndex: 0 })
    )

    const sold = await act(
      party.id,
      visitMarket({
        operation: 'sell',
        source: 'inventory',
        cardId: A,
        quantity: 10,
      })
    )
    expect(sold.status).toBe(200)
    expect(player(sold.body).gold).toBe(93)
  })

  it('REQ-142: venda de tesouro, equipamento e atributo da pasta paga 25, 3 e 4', async () => {
    const party = await startedParty()
    await give(party, C)
    await give(party, W)
    await give(party, STR, 2)

    const sold = await act(
      party.id,
      visitMarket(
        { operation: 'sell', source: 'inventory', cardId: C, quantity: 1 },
        { operation: 'sell', source: 'inventory', cardId: W, quantity: 1 },
        { operation: 'sell', source: 'tcgFolder', cardId: STR, quantity: 2 }
      )
    )

    expect(sold.status).toBe(200)
    expect(player(sold.body).gold).toBe(32)
    expect(
      player(sold.body).lastMarketVisit?.results.map(({ gold }) => gold)
    ).toEqual([25, 3, 4])
    expect(player(sold.body).inventory).toEqual([])
    expect(player(sold.body).tcgFolder).toEqual([])
  })

  it('REQ-142: o ouro acima da bolsa é perdido e informado (290 + 25 → 300; perdidos 15)', async () => {
    const party = await startedParty()
    await give(party, C)
    await grant(party, { type: 'gold', amount: 290 })

    const sold = await act(
      party.id,
      visitMarket({
        operation: 'sell',
        source: 'inventory',
        cardId: C,
        quantity: 1,
      })
    )

    expect(sold.status).toBe(200)
    expect(player(sold.body).gold).toBe(300)
    expect(player(sold.body).lastMarketVisit?.goldLost).toBe(15)
  })

  it('REQ-140: lote recusado devolve o índice e nada muda (PA, ouro, cartas)', async () => {
    const party = await startedParty()
    await grant(party, { type: 'gold', amount: 35 })

    const refused = await act(
      party.id,
      visitMarket(
        { operation: 'buyBooster', cardId: BO, quantity: 1 },
        { operation: 'buyStock', cardId: P, quantity: 1 }
      )
    )

    expect(refused.status).toBe(409)
    expect(refused.body).toEqual(
      notAllowed({ reason: 'notEnoughGold', cardId: P, operationIndex: 1 })
    )
    const after = await get(party.id)
    expect(player(after).gold).toBe(35)
    expect(player(after).inventory.some(({ cardId }) => cardId === BO)).toBe(
      false
    )
    expect(after.turn.actionPoints).toBe(party.turn.actionPoints)

    const outside = await act(
      party.id,
      visitMarket({
        operation: 'buyStock',
        cardId: 'fixture.pickaxe',
        quantity: 1,
      })
    )
    expect(outside.status).toBe(409)
    expect(outside.body.error.details.reason).toBe('notInMarketStock')
  })

  it('REQ-141: single — paga o preço da projeção, entrega no destino e repõe o slot; fora da vitrine recusa', async () => {
    const party = await startedParty()
    await grant(party, { type: 'gold', amount: 300 })
    const before = player(await get(party.id))
    const filled = before.market?.showcase?.find(({ offer }) => offer !== null)
    if (!filled?.offer)
      throw new Error('a vitrine deveria ter ao menos 1 carta')

    const bought = await act(
      party.id,
      visitMarket({ operation: 'buySingle', slotIndex: filled.slotIndex })
    )

    expect(bought.status).toBe(200)
    const p = player(bought.body)
    expect(p.gold).toBe(300 - filled.offer.price)
    expect(p.lastMarketVisit?.results[0]).toMatchObject({
      operation: 'buySingle',
      slotIndex: filled.slotIndex,
      cardId: filled.offer.cardId,
      destination: filled.offer.destination,
      gold: -filled.offer.price,
    })
    const owned =
      filled.offer.destination === 'tcgFolder'
        ? p.tcgFolder.map(({ cardId }) => cardId)
        : p.inventory.map(({ cardId }) => cardId)
    expect(owned).toContain(filled.offer.cardId)

    const missing = await act(
      party.id,
      visitMarket({ operation: 'buySingle', slotIndex: 4 })
    )
    expect(missing.status).toBe(409)
    expect(missing.body).toEqual(
      notAllowed({ reason: 'showcaseSlotNotFound', operationIndex: 0 })
    )
  })

  it('REQ-140: a visita pode ser repetida na mesma vez (1 PA cada)', async () => {
    const party = await startedParty()
    await grant(party, { type: 'gold', amount: 100 })

    await act(
      party.id,
      visitMarket({ operation: 'buyStock', cardId: P, quantity: 1 })
    ).expect(200)
    const second = await act(
      party.id,
      visitMarket({ operation: 'buyStock', cardId: P, quantity: 1 })
    )

    expect(second.status).toBe(200)
    expect(second.body.turn.actionPoints).toBe(party.turn.actionPoints - 2)
    expect(player(second.body).inventory).toContainEqual({
      cardId: P,
      quantity: 2,
    })
  })

  it('REQ-140: fora do Porto — market null, sem visitMarket e 409 zoneActionUnavailable; com 0 PA no Porto — market presente, sem visitMarket e 409 noActionPoints', async () => {
    const party = await startedParty()
    // Zona sem mercado (a Mina Velha tem Estábulo desde a FEAT-18).
    const target = player(party).moveTargets.find(
      (zoneId: string) => zoneId !== 'fixture.old-mine'
    )
    const moved = await act(party.id, { type: 'move', zoneId: target })
    expect(moved.status).toBe(200)
    expect(player(moved.body).market).toBeNull()
    expect(player(moved.body).availableActions).not.toContain('visitMarket')
    const away = await act(
      party.id,
      visitMarket({ operation: 'buyStock', cardId: P, quantity: 1 })
    )
    expect(away.status).toBe(409)
    expect(away.body).toEqual(notAllowed({ reason: 'zoneActionUnavailable' }))

    // Grupo solo: a vez seguinte começa com 3 PA; 1 para voltar e 2 para zerar.
    await act(party.id, { type: 'endTurn' }).expect(200)
    await act(party.id, { type: 'move', zoneId: 'fixture.gray-harbor' }).expect(
      200
    )
    await act(party.id, { type: 'recover', option: 'shuffleHand' }).expect(200)
    const tired = await act(party.id, {
      type: 'recover',
      option: 'shuffleHand',
    })
    expect(tired.status).toBe(200)
    expect(tired.body.turn.actionPoints).toBe(0)
    expect(player(tired.body).market).not.toBeNull()
    expect(player(tired.body).availableActions).not.toContain('visitMarket')
    const broke = await act(
      party.id,
      visitMarket({ operation: 'buyStock', cardId: P, quantity: 1 })
    )
    expect(broke.status).toBe(409)
    expect(broke.body).toEqual(notAllowed({ reason: 'noActionPoints' }))
  })

  it('REQ-143: expansões — vaultGold recusado com 300 (500); purse a 150 → bolsa 600 e serviço seguinte; com 110, 50 + 100 recusa no índice 1; persiste', async () => {
    const party = await startedParty()
    await grant(party, { type: 'gold', amount: 300 })

    const tooPoor = await act(
      party.id,
      visitMarket({ operation: 'buyExpansion', expansion: 'vaultGold' })
    )
    expect(tooPoor.status).toBe(409)
    expect(tooPoor.body).toEqual(
      notAllowed({ reason: 'notEnoughGold', operationIndex: 0 })
    )
    expect(player(await get(party.id)).gold).toBe(300)

    const bought = await act(
      party.id,
      visitMarket({ operation: 'buyExpansion', expansion: 'purse' })
    )
    expect(bought.status).toBe(200)
    const p = player(bought.body)
    expect(p.gold).toBe(150)
    expect(p.purseCapacity).toBe(600)
    expect(p.expansions.purse).toBe(1)
    expect(p.market?.services.find((s) => s.expansion === 'purse')).toEqual({
      expansion: 'purse',
      price: 300,
      capacity: 1200,
    })
    expect(p.lastMarketVisit?.results).toEqual([
      {
        operation: 'buyExpansion',
        expansion: 'purse',
        capacity: 600,
        gold: -150,
      },
    ])

    const reread = player(await get(party.id))
    expect(reread.expansions.purse).toBe(1)
    expect(reread.purseCapacity).toBe(600)

    const poorer = await startedParty()
    await grant(poorer, { type: 'gold', amount: 110 })
    const second = await act(
      poorer.id,
      visitMarket(
        { operation: 'buyExpansion', expansion: 'vaultSlots' },
        { operation: 'buyExpansion', expansion: 'vaultSlots' }
      )
    )
    expect(second.status).toBe(409)
    expect(second.body).toEqual(
      notAllowed({ reason: 'notEnoughGold', operationIndex: 1 })
    )
  })

  it('REQ-143: o cofre e a pasta efetivos aparecem no presenter (vaultSlots +5 → 35; tcgFolder +10 → 40)', async () => {
    const party = await startedParty()
    await grant(party, { type: 'gold', amount: 110 })

    const bought = await act(
      party.id,
      visitMarket(
        { operation: 'buyExpansion', expansion: 'vaultSlots' },
        { operation: 'buyExpansion', expansion: 'tcgFolder' }
      )
    )

    expect(bought.status).toBe(200)
    const p = player(bought.body)
    expect(p.vaultCapacity).toBe(35)
    expect(p.tcgFolderCapacity).toBe(40)
    expect(p.vaultDeckSlots).toBe(10)
    expect(p.vaultGoldCapacity).toBe(2000)
    expect(p.expansions).toEqual({
      vaultSlots: 1,
      deckSlots: 0,
      tcgFolder: 1,
      purse: 0,
      vaultGold: 0,
    })
    expect(p.gold).toBe(0)
  })

  it('CONTRATO FEAT-16, Formato: lista vazia, slotIndex negativo, source e operation desconhecidos → 400', async () => {
    const party = await startedParty()
    const fields = async (body: unknown) =>
      (await act(party.id, body)).body.error.details.fields

    expect(await fields(visitMarket())).toEqual([
      { field: 'operations', reason: 'invalidLength' },
    ])
    expect(
      await fields(visitMarket({ operation: 'buySingle', slotIndex: -1 }))
    ).toEqual([
      { field: 'operations.0.slotIndex', reason: 'notNonNegativeInteger' },
    ])
    expect(
      await fields(
        visitMarket({
          operation: 'sell',
          source: 'vault',
          cardId: P,
          quantity: 1,
        })
      )
    ).toEqual([{ field: 'operations.0.source', reason: 'unknownOption' }])
    expect(await fields(visitMarket({ operation: 'haggle' }))).toEqual([
      { field: 'operations.0.operation', reason: 'unknownOperation' },
    ])
  })

  // CONTRATO v0.80, FEAT-16 (T-65): abrir booster (REQ-144). O sorteio exato
  // fica nos testes de unidade; aqui as 8 cartas vêm da coleção da fixture.
  it('REQ-144: Preparar — abre o booster, 8 cartas para a pasta ou o inventário, de graça, e a embalagem sai', async () => {
    const party = await startedParty()
    await give(party, BO)
    expect(player(await get(party.id)).availableActions).toContain('prepare')

    const opened = await act(party.id, {
      type: 'prepare',
      operation: 'openBooster',
      cardId: BO,
    })

    expect(opened.status).toBe(200)
    const p = player(opened.body)
    expect(p.inventory.find(({ cardId }) => cardId === BO)).toBeUndefined()
    expect(p.lastBoosterOpening?.boosterCardId).toBe(BO)
    expect(p.lastBoosterOpening?.via).toBe('prepare')
    expect(p.lastBoosterOpening?.cards).toHaveLength(8)
    for (const { destination } of p.lastBoosterOpening?.cards ?? []) {
      expect(['tcgFolder', 'inventory', 'pending']).toContain(destination)
    }
    expect(opened.body.turn.actionPoints).toBe(party.turn.actionPoints)
  })

  it('REQ-144: Preparar — 23 cartas na pasta → 409 tcgFolderFull; carta que não é booster → 409 notBooster; sem a carta → 409 notInInventory', async () => {
    const party = await startedParty()
    await give(party, BO)
    await give(party, STR, 23)
    await give(party, P)

    const full = await act(party.id, {
      type: 'prepare',
      operation: 'openBooster',
      cardId: BO,
    })
    const notBooster = await act(party.id, {
      type: 'prepare',
      operation: 'openBooster',
      cardId: P,
    })
    const missing = await act(party.id, {
      type: 'prepare',
      operation: 'openBooster',
      cardId: C,
    })

    expect(full.status).toBe(409)
    expect(full.body).toEqual(notAllowed({ reason: 'tcgFolderFull' }))
    expect(notBooster.body).toEqual(notAllowed({ reason: 'notBooster' }))
    expect(missing.body).toEqual(notAllowed({ reason: 'notInInventory' }))
  })

  it('REQ-144: Usar cofre — store e openBooster no lote, 8 cartas no cofre, 1 PA', async () => {
    const party = await startedParty()
    await give(party, BO)

    const opened = await act(party.id, {
      type: 'useVault',
      operations: [
        { operation: 'store', cardId: BO, quantity: 1 },
        { operation: 'openBooster', cardId: BO },
      ],
    })

    expect(opened.status).toBe(200)
    const p = player(opened.body)
    expect(p.lastBoosterOpening?.via).toBe('useVault')
    expect(p.lastBoosterOpening?.cards).toHaveLength(8)
    expect(p.vault.slots.reduce((sum, { quantity }) => sum + quantity, 0)).toBe(
      8
    )
    expect(opened.body.turn.actionPoints).toBe(party.turn.actionPoints - 1)
  })
})
