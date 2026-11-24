import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { DRIZZLE, type Database } from '@/infra/database/database.tokens'
import { parties } from '@/infra/database/drizzle/schema'
import { removePostV6Config } from '../../../../../test/factories/remove-post-v6-config'
import { createContentApp } from '../../../../../test/content-app'
import {
  postParty,
  resetCampaign,
  withoutMarkets,
} from '../../../../../test/parties-e2e'

// CONTRATO FEAT-10: Preparar (REQ-71 a REQ-75) e save v5 (REQ-79). O estado é
// montado pela doação do laboratório; só o Pico abaixo do requisito com o
// equipamento em uso e o save antigo vão direto no jsonb (não há como chegar lá
// pelo jogo ainda).

const B = 'fixture.blade-of-dusk'
const W = 'fixture.short-sword'
const D = 'fixture.oak-shield'
const H = 'fixture.iron-helm'
const R = 'fixture.arcane-wand'
const P = 'fixture.healing-potion'
const K = 'fixture.pickaxe'
const A = 'fixture.guardian-armor'

/** FEAT-17: todo equipamento no inventário traz o estado (padrão). */
const DEFAULT_STATE = {
  refinement: 0,
  enchantments: [],
  repairMarks: 0,
  broken: false,
}

const EMPTY_EQUIPMENT = {
  head: null,
  torso: null,
  legs: null,
  feet: null,
  cape: null,
  weapon: null,
  shield: null,
  accessory: null,
}

const BASE_EFFECTIVE = {
  attack: 6,
  defense: 5,
  accuracy: 49,
  evasion: 16,
  celerity: 8,
  piercing: 0,
  reflection: 0,
}

type TPlayer = {
  gold: number
  inventory: { cardId: string; quantity: number }[]
  equipment: Record<string, string | null>
  effectiveModifiers: Record<string, number>
  availableActions: string[]
}

type TParty = {
  id: string
  savedAt: string
  turn: { actionPoints: number }
  members: { id: string; player: TPlayer }[]
}

const notAllowed = (reason: string) => ({
  error: {
    code: 'ACTION_NOT_ALLOWED',
    message: 'Esta ação não é permitida agora.',
    details: { reason },
  },
})

const invalid = (fields: object[]) => ({
  error: {
    code: 'ACTION_INVALID',
    message: 'Ação inválida.',
    details: { fields },
  },
})

const equip = (cardId: string) => ({
  type: 'prepare',
  operation: 'equip',
  cardId,
})
const unequip = (slot: string) => ({
  type: 'prepare',
  operation: 'unequip',
  slot,
})

describe('Preparar — equip e unequip (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createContentApp>>

  beforeAll(async () => {
    ctx = await createContentApp()
  })

  beforeEach(async () => {
    await resetCampaign(ctx.app)
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

  async function give(party: TParty, cardId: string, quantity = 1) {
    await request(server())
      .post(`/lab/parties/${party.id}/members/${party.members[0].id}/grants`)
      .send({ type: 'card', cardId, quantity })
      .expect(200)
  }

  const get = async (id: string): Promise<TParty> =>
    (await request(server()).get(`/parties/${id}`)).body

  async function rawState(id: string): Promise<Record<string, unknown>> {
    const db = ctx.app.get<Database>(DRIZZLE)
    const [row] = await db.select().from(parties).where(eq(parties.id, id))
    return row.state as Record<string, unknown>
  }

  async function writeState(id: string, state: object): Promise<void> {
    const db = ctx.app.get<Database>(DRIZZLE)
    await db.update(parties).set({ state }).where(eq(parties.id, id))
  }

  it('REQ-70/REQ-71/REQ-75: na criação, inventário vazio, nada equipado, efetivos pelo Pico e sem prepare', async () => {
    const party = await startedParty()

    const { player } = party.members[0]
    expect(player.inventory).toEqual([])
    expect(player.equipment).toEqual(EMPTY_EQUIPMENT)
    expect(player.effectiveModifiers).toEqual(BASE_EFFECTIVE)
    expect(player.availableActions).toEqual([
      'move',
      'recover',
      'adjustDeck',
      'useVault',
      'visitMarket',
      'saveRespawnPoint',
      'startEvent',
      'endTurn',
    ])
  })

  it('REQ-102: passivo da armadura entra no cálculo enquanto equipada', async () => {
    const party = await startedParty()
    await give(party, A)
    expect(
      (await get(party.id)).members[0].player.effectiveModifiers.defense
    ).toBe(5)

    const { body: equipped } = await act(party.id, equip(A)).expect(200)
    expect(equipped.members[0].player.effectiveModifiers.defense).toBe(19)
    expect(
      (await get(party.id)).members[0].player.effectiveModifiers.defense
    ).toBe(19)

    const { body: unequipped } = await act(party.id, unequip('torso')).expect(
      200
    )
    expect(unequipped.members[0].player.effectiveModifiers.defense).toBe(5)
  })

  it('REQ-72/REQ-71/REQ-75: equipar B é gratuito, soma os modificadores e grava', async () => {
    const party = await startedParty()
    await give(party, P)
    expect((await get(party.id)).members[0].player.availableActions).toEqual([
      'move',
      'recover',
      'prepare',
      'adjustDeck',
      'useVault',
      'visitMarket',
      'saveRespawnPoint',
      'startEvent',
      'endTurn',
    ])
    await give(party, B)
    expect((await get(party.id)).members[0].player.availableActions).toEqual([
      'move',
      'recover',
      'prepare',
      'adjustDeck',
      'useVault',
      'visitMarket',
      'saveRespawnPoint',
      'startEvent',
      'endTurn',
    ])

    const response = await act(party.id, equip(B))

    expect(response.status).toBe(200)
    const { player } = response.body.members[0] as { player: TPlayer }
    expect(player.equipment.weapon).toBe(B)
    expect(player.inventory).toEqual([{ cardId: P, quantity: 1 }])
    expect(player.effectiveModifiers.attack).toBe(9)
    expect(player.effectiveModifiers.accuracy).toBe(50)
    expect(response.body.turn.actionPoints).toBe(3)
    expect(player.availableActions).toContain('prepare')
    expect((await get(party.id)).members[0].player.equipment.weapon).toBe(B)
  })

  it('REQ-72/REQ-74: escudo bloqueado pela arma; troca de arma leva o escudo; inventoryFull no caso J1', async () => {
    const party = await startedParty()
    await give(party, B)
    await give(party, D)
    await act(party.id, equip(B)).expect(200)

    const blocked = await act(party.id, equip(D))
    expect(blocked.status).toBe(409)
    expect(blocked.body).toEqual(notAllowed('shieldBlocked'))

    await give(party, W)
    await act(party.id, equip(W)).expect(200)
    const shielded = await act(party.id, equip(D))
    expect(shielded.status).toBe(200)
    expect(shielded.body.members[0].player.equipment).toMatchObject({
      weapon: W,
      shield: D,
    })
    expect(shielded.body.members[0].player.inventory).toEqual([
      { cardId: B, quantity: 1, equipmentState: DEFAULT_STATE },
    ])

    await give(party, K, 9)
    const full = await act(party.id, equip(B))
    expect(full.status).toBe(409)
    expect(full.body).toEqual(notAllowed('inventoryFull'))

    // Libera 1 slot: guarda-se a picareta direto no save (não há Descartar ainda).
    const state = (await rawState(party.id)) as {
      members: { player: { inventory: unknown[] } }[]
    }
    state.members[0].player.inventory.pop()
    await writeState(party.id, state)

    const swapped = await act(party.id, equip(B))
    expect(swapped.status).toBe(200)
    const { player } = swapped.body.members[0] as { player: TPlayer }
    expect(player.equipment).toMatchObject({ weapon: B, shield: null })
    expect(player.inventory.slice(-2)).toEqual([
      { cardId: W, quantity: 1, equipmentState: DEFAULT_STATE },
      { cardId: D, quantity: 1, equipmentState: DEFAULT_STATE },
    ])
    expect(player.inventory).toHaveLength(10)
  })

  it('REQ-74: equip recusado por Pico, classe, tipo e ausência, nada gravado', async () => {
    const party = await startedParty()
    await give(party, H)
    await give(party, R)
    await give(party, P)
    const before = await get(party.id)

    for (const [cardId, reason] of [
      [H, 'peakRequirementNotMet'],
      [R, 'classRestricted'],
      [P, 'notEquipment'],
      [W, 'notInInventory'],
    ] as const) {
      const response = await act(party.id, equip(cardId))
      expect(response.status).toBe(409)
      expect(response.body).toEqual(notAllowed(reason))
    }

    expect((await get(party.id)).savedAt).toBe(before.savedAt)
  })

  it('REQ-73/REQ-74: unequip guarda no fim e tira o bônus; slot vazio → slotEmpty', async () => {
    const party = await startedParty()
    await give(party, B)
    await give(party, P)
    await act(party.id, equip(B)).expect(200)

    const response = await act(party.id, unequip('weapon'))

    expect(response.status).toBe(200)
    const { player } = response.body.members[0] as { player: TPlayer }
    expect(player.equipment.weapon).toBeNull()
    expect(player.inventory).toEqual([
      { cardId: P, quantity: 1 },
      { cardId: B, quantity: 1, equipmentState: DEFAULT_STATE },
    ])
    expect(player.effectiveModifiers.attack).toBe(6)
    expect(response.body.turn.actionPoints).toBe(3)

    const empty = await act(party.id, unequip('head'))
    expect(empty.status).toBe(409)
    expect(empty.body).toEqual(notAllowed('slotEmpty'))
  })

  it('REQ-74: unequip com o inventário cheio → inventoryFull', async () => {
    const party = await startedParty()
    await give(party, B)
    await act(party.id, equip(B)).expect(200)
    await give(party, K, 10)

    const response = await act(party.id, unequip('weapon'))

    expect(response.status).toBe(409)
    expect(response.body).toEqual(notAllowed('inventoryFull'))
  })

  it('REQ-72/REQ-75: com 0 pontos, equip continua 200 e prepare continua disponível', async () => {
    const party = await startedParty()
    await give(party, B)
    for (let i = 0; i < 3; i++) {
      await act(party.id, { type: 'recover', option: 'drawToHand' }).expect(200)
    }

    const response = await act(party.id, equip(B))

    expect(response.status).toBe(200)
    expect(response.body.turn.actionPoints).toBe(0)
    expect(response.body.members[0].player.availableActions).toEqual([
      'prepare',
      'endTurn',
    ])
  })

  it('REQ-74: forma inválida → 400; sem sessão → 409 PARTY_SESSION_NOT_ACTIVE', async () => {
    const party = await startedParty()

    const wear = await act(party.id, { type: 'prepare', operation: 'wear' })
    expect(wear.status).toBe(400)
    expect(wear.body).toEqual(
      invalid([{ field: 'operation', reason: 'unknownOperation' }])
    )

    const hat = await act(party.id, unequip('hat'))
    expect(hat.status).toBe(400)
    expect(hat.body).toEqual(
      invalid([{ field: 'slot', reason: 'unknownSlot' }])
    )

    await request(server()).post(`/parties/${party.id}/session/end`).expect(200)
    const idle = await act(party.id, equip(B))
    expect(idle.status).toBe(409)
    expect(idle.body.error.code).toBe('PARTY_SESSION_NOT_ACTIVE')
  })

  it('REQ-71: com o Pico abaixo do requisito, o equipamento em uso fica no slot e não soma', async () => {
    const party = await startedParty()
    const state = (await rawState(party.id)) as {
      members: { player: { equipment: Record<string, string | null> } }[]
    }
    state.members[0].player.equipment.head = H
    await writeState(party.id, state)

    const read = await get(party.id)

    const { player } = read.members[0]
    expect(player.equipment.head).toBe(H)
    expect(player.effectiveModifiers.defense).toBe(BASE_EFFECTIVE.defense)
    expect(player.availableActions).toContain('prepare')
  })

  it('REQ-79/D-79: save v4 inserido à mão é lido (vazio, padrões, ouro limitado) e regravado como v9', async () => {
    const party = await startedParty()
    await give(party, B)
    const state = (await rawState(party.id)) as {
      config: Record<string, number>
      members: { player: Record<string, unknown> }[]
    }
    const config = { ...state.config }
    removePostV6Config(config)
    delete config.inventoryCapacity
    delete config.purseCapacity
    delete config.escapeVigorPercent
    delete config.reserveDeck
    delete config.vaultCapacity
    delete config.vaultDeckSlots
    delete config.vaultGoldCapacity
    const members = state.members.map((m) => {
      const player: Record<string, unknown> = { ...m.player, gold: 450 }
      delete player.inventory
      delete player.equipment
      delete player.statuses
      delete player.vault
      delete player.lastScavenge
      return { ...m, player }
    })
    await writeState(
      party.id,
      withoutMarkets({
        ...state,
        rewardDecks: undefined,
        schemaVersion: 4,
        config,
        members,
      })
    )

    const read = await get(party.id)
    const { player } = read.members[0]
    expect(player.inventory).toEqual([])
    expect(player.equipment).toEqual(EMPTY_EQUIPMENT)
    expect(player.gold).toBe(300)

    await act(party.id, { type: 'endTurn' }).expect(200)
    expect(await rawState(party.id)).toMatchObject({
      schemaVersion: 10,
      config: { inventoryCapacity: 10, purseCapacity: 300 },
      members: [{ player: { inventory: [], gold: 300 } }],
    })
  })
})
