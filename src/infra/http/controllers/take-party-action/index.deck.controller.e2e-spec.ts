import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { DRIZZLE, type Database } from '@/infra/database/database.tokens'
import { parties } from '@/infra/database/drizzle/schema'
import { GAME_CONFIG_DEFAULTS } from '@/domain/lab/enterprise/value-objects/game-config/defaults'
import {
  CONTENT_INVALID,
  createContentApp,
  MAGE_INPUT,
} from '../../../../../test/content-app'
import { removePostV6Config } from '../../../../../test/factories/remove-post-v6-config'
import {
  postParty,
  resetCampaign,
  withoutMarkets,
} from '../../../../../test/parties-e2e'

// CONTRATO FEAT-09 (REQ-60 a REQ-68). A pasta ainda não enche no jogo (D-69):
// as trocas com a pasta partem de saves montados direto no jsonb.

const S = 'fixture.strength-basic'
const E = 'fixture.endurance-basic'
const D = 'fixture.dexterity-basic'
/** Só na cópia temporária do conteúdo: a fixture não tem carta sinérgica. */
const SYN = 'fixture.might-synergy'

const NEW_KEYS = {
  maxCopiesPerCard: 4,
  tcgFolderCapacity: 30,
  recoverHealthPercent: 15,
  recoverVigorPercent: 5,
  recoverHandSize: 7,
}

type TCopies = { cardId: string; copies: number }[]

type TPlayer = {
  playerClasses: { playerClass: string; deckLockMet: boolean }[]
  health: number
  vigor: number
  hand: string[]
  attributeDeckCount: number
  attributeDiscardPileCount: number
  build: TCopies
  buildSize: number
  tcgFolder: TCopies
  tcgFolderCapacity: number
  availableActions: string[]
}

type TParty = {
  id: string
  savedAt: string
  turn: { actionPoints: number }
  members: { player: TPlayer }[]
}

type TRawPlayer = {
  build: TCopies
  tcgFolder?: TCopies
  deck: string[]
  hand: string[]
  discard: string[]
  health: number
  vigor: number
}

const notAllowed = (details: object) => ({
  error: {
    code: 'ACTION_NOT_ALLOWED',
    message: 'Esta ação não é permitida agora.',
    details,
  },
})

const invalid = (fields: object[]) => ({
  error: {
    code: 'ACTION_INVALID',
    message: 'Ação inválida.',
    details: { fields },
  },
})

const WARRIOR_BUILD = [
  { cardId: E, copies: 30 },
  { cardId: S, copies: 30 },
]

describe('Deck de atributos — recover e adjustDeck (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createContentApp>>

  beforeAll(async () => {
    ctx = await createContentApp(async (root) => {
      const file = join(root, 'fixture', 'attribute.json')
      const cards = JSON.parse(await readFile(file, 'utf8')) as object[]
      cards.push({
        id: SYN,
        name: 'Ímpeto',
        flavorText: null,
        rarity: 'uncommon',
        attributeKind: 'synergy',
        attributes: ['strength', 'endurance'],
        effects: [],
      })
      await writeFile(file, JSON.stringify(cards, null, 2))
    })
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

  const get = async (id: string): Promise<TParty> =>
    (await request(server()).get(`/parties/${id}`)).body

  /** Monta o estado do jogador direto no save (D-69). */
  async function mount(
    id: string,
    change: (player: TRawPlayer) => void
  ): Promise<void> {
    const db = ctx.app.get<Database>(DRIZZLE)
    const [row] = await db.select().from(parties).where(eq(parties.id, id))
    const state = row.state as { members: { player: TRawPlayer }[] }
    change(state.members[0].player)
    await db.update(parties).set({ state }).where(eq(parties.id, id))
  }

  it('REQ-60: /lab/config traz as chaves novas com padrões e limites; o grupo guarda a cópia', async () => {
    const config = await request(server()).get('/lab/config').expect(200)
    expect(config.body.values).toMatchObject(NEW_KEYS)
    expect(config.body.defaults).toMatchObject(NEW_KEYS)
    expect(config.body.limits).toMatchObject({
      maxCopiesPerCard: { min: 1, max: 200 },
      tcgFolderCapacity: { min: 0, max: 1000 },
      recoverHealthPercent: { min: 0, max: 100 },
      recoverVigorPercent: { min: 0, max: 100 },
      recoverHandSize: { min: 0, max: 200 },
    })

    const old = await startedParty()
    await act(old.id, { type: 'recover', option: 'shuffleHand' }).expect(200)
    await request(server())
      .patch('/lab/config')
      .send({ recoverHandSize: 10 })
      .expect(200)

    const created = await postParty(ctx.app)
    await request(server()).post(`/parties/${created.id}/session`).expect(200)
    const drawn = await act(created.id, {
      type: 'recover',
      option: 'drawToHand',
    })
    expect(drawn.body.members[0].player.hand).toHaveLength(10)
    expect(drawn.body.members[0].player.attributeDeckCount).toBe(50)

    const oldDrawn = await act(old.id, {
      type: 'recover',
      option: 'drawToHand',
    })
    expect(oldDrawn.body.members[0].player.hand).toHaveLength(7)
  })

  it('REQ-61: publicar classe com sinérgica acima de maxCopiesPerCard → 400 CONTENT_INVALID em starterDeck.0.copies', async () => {
    await request(server())
      .post('/lab/content/collections/fixture/classes')
      .send({
        ...MAGE_INPUT,
        essentialAttributes: ['strength', 'dexterity'],
        starterDeck: [
          { cardId: SYN, copies: 5 },
          { cardId: S, copies: 30 },
          { cardId: D, copies: 25 },
        ],
      })
      .expect(201)

    const response = await request(server()).post(
      '/lab/content/classes/mage/publish'
    )
    expect(response.status).toBe(400)
    expect(response.body.error).toMatchObject(CONTENT_INVALID)
    expect(response.body.error.details.fields).toEqual([
      {
        path: 'starterDeck.0.copies',
        message:
          'Carta sinérgica ou aprimorada pode ter no máximo 4 cópias no deck pré-pronto.',
      },
    ])
    await request(server()).delete('/lab/content/classes/mage').expect(204)
  })

  it('REQ-62: o jogador traz build, buildSize, tcgFolder vazia e tcgFolderCapacity; cartas em jogo = build', async () => {
    const created = (await postParty(ctx.app)) as unknown as TParty
    const player = created.members[0].player
    expect(player.build).toEqual(WARRIOR_BUILD)
    expect(player.buildSize).toBe(60)
    expect(player.tcgFolder).toEqual([])
    expect(player.tcgFolderCapacity).toBe(30)
    expect(
      player.attributeDeckCount +
        player.hand.length +
        player.attributeDiscardPileCount
    ).toBe(player.buildSize)
  })

  it('REQ-63: drawToHand com tudo cheio só gasta 1 ponto; shuffleHand esvazia a mão; drawToHand volta a 7', async () => {
    const party = await startedParty()

    const full = await act(party.id, { type: 'recover', option: 'drawToHand' })
    expect(full.status).toBe(200)
    expect(full.body.turn.actionPoints).toBe(2)
    const p1 = full.body.members[0].player as TPlayer
    expect([p1.health, p1.vigor]).toEqual([22, 10])
    expect(p1.hand).toHaveLength(7)
    expect(p1.attributeDeckCount).toBe(53)

    const shuffled = await act(party.id, {
      type: 'recover',
      option: 'shuffleHand',
    })
    expect(shuffled.status).toBe(200)
    expect(shuffled.body.turn.actionPoints).toBe(1)
    expect(shuffled.body.members[0].player.hand).toEqual([])
    expect(shuffled.body.members[0].player.attributeDeckCount).toBe(60)

    const drawn = await act(party.id, { type: 'recover', option: 'drawToHand' })
    expect(drawn.body.members[0].player.hand).toHaveLength(7)
    expect(drawn.body.members[0].player.attributeDeckCount).toBe(53)
    {
      const { combatUpdates, ...snapshot } = drawn.body
      expect(combatUpdates).toEqual([])
      expect(await get(party.id)).toEqual(snapshot)
    }
  })

  it('REQ-63: recupera vida e Vigor (mínimo 1) e shuffleDiscard devolve a pilha ao deck', async () => {
    const party = await startedParty()
    await mount(party.id, (player) => {
      player.health = 10
      player.vigor = 3
      player.discard = player.deck.splice(0, 5)
    })
    const before = (await get(party.id)).members[0].player
    expect(before.attributeDiscardPileCount).toBe(5)

    const response = await act(party.id, {
      type: 'recover',
      option: 'shuffleDiscard',
    })
    expect(response.status).toBe(200)
    const player = response.body.members[0].player as TPlayer
    expect(player.health).toBe(13)
    expect(player.vigor).toBe(4)
    expect(player.attributeDiscardPileCount).toBe(0)
    expect(player.attributeDeckCount).toBe(53)
    expect(player.hand).toEqual(before.hand)
  })

  it('REQ-64: recover malformado → 400; sem sessão → 409; nada gravado', async () => {
    const party = await startedParty()
    for (const [body, fields] of [
      [
        { type: 'recover', option: 'nap' },
        [{ field: 'option', reason: 'unknownOption' }],
      ],
      [{ type: 'recover' }, [{ field: 'option', reason: 'required' }]],
      [
        { type: 'recover', option: 1, extra: true },
        [
          { field: 'option', reason: 'notString' },
          { field: 'extra', reason: 'unknownKey' },
        ],
      ],
    ] as const) {
      const response = await act(party.id, body)
      expect(response.status).toBe(400)
      expect(response.body).toEqual(invalid([...fields]))
    }
    expect((await get(party.id)).savedAt).toBe(party.savedAt)

    await request(server()).post(`/parties/${party.id}/session/end`).expect(200)
    const idle = await act(party.id, { type: 'recover', option: 'drawToHand' })
    expect(idle.status).toBe(409)
    expect(idle.body.error.code).toBe('PARTY_SESSION_NOT_ACTIVE')
  })

  it('REQ-64/REQ-66/REQ-67: com 0 pontos, recover e adjustDeck → 409 noActionPoints; availableActions = [endTurn]', async () => {
    const party = await startedParty()
    let last: TParty = party
    for (let i = 0; i < 3; i++) {
      last = (
        await act(party.id, { type: 'recover', option: 'drawToHand' }).expect(
          200
        )
      ).body
    }
    expect(last.turn.actionPoints).toBe(0)
    expect(last.members[0].player.availableActions).toEqual(['endTurn'])

    for (const body of [
      { type: 'recover', option: 'drawToHand' },
      { type: 'adjustDeck', build: WARRIOR_BUILD },
    ]) {
      const response = await act(party.id, body)
      expect(response.status).toBe(409)
      expect(response.body).toEqual(notAllowed({ reason: 'noActionPoints' }))
    }
    expect((await get(party.id)).savedAt).toBe(last.savedAt)
  })

  it('REQ-65: adjustDeck sem mudanças gasta 1 ponto, recolhe, embaralha e compra a mesma quantidade', async () => {
    const party = await startedParty()
    const response = await act(party.id, {
      type: 'adjustDeck',
      build: WARRIOR_BUILD,
    })
    expect(response.status).toBe(200)
    expect(response.body.turn.actionPoints).toBe(2)
    const player = response.body.members[0].player as TPlayer
    expect(player.build).toEqual(WARRIOR_BUILD)
    expect(player.tcgFolder).toEqual([])
    expect(player.hand).toHaveLength(7)
    expect(player.attributeDeckCount).toBe(53)
    expect(player.attributeDiscardPileCount).toBe(0)
    expect(player.playerClasses).toEqual([
      { playerClass: 'warrior', deckLockMet: true },
    ])
    {
      const { combatUpdates, ...snapshot } = response.body
      expect(combatUpdates).toEqual([])
      expect(await get(party.id)).toEqual(snapshot)
    }
  })

  it('REQ-65: trocar a Força pela Destreza da pasta desliga a trava; o resto vai para a pasta', async () => {
    const party = await startedParty()
    await mount(party.id, (player) => {
      player.tcgFolder = [{ cardId: D, copies: 30 }]
      player.discard = player.deck.splice(0, 2)
    })

    const response = await act(party.id, {
      type: 'adjustDeck',
      build: [
        { cardId: E, copies: 30 },
        { cardId: D, copies: 30 },
      ],
    })
    expect(response.status).toBe(200)
    const player = response.body.members[0].player as TPlayer
    expect(player.build).toEqual([
      { cardId: D, copies: 30 },
      { cardId: E, copies: 30 },
    ])
    expect(player.buildSize).toBe(60)
    expect(player.tcgFolder).toEqual([{ cardId: S, copies: 30 }])
    expect(player.hand).toHaveLength(7)
    expect(player.hand.every((card) => card !== S)).toBe(true)
    expect(player.attributeDeckCount).toBe(53)
    expect(player.attributeDiscardPileCount).toBe(0)
    expect(player.playerClasses).toEqual([
      { playerClass: 'warrior', deckLockMet: false },
    ])
    {
      const { combatUpdates, ...snapshot } = response.body
      expect(combatUpdates).toEqual([])
      expect(await get(party.id)).toEqual(snapshot)
    }
  })

  it('REQ-66: forma inválida → 400 ACTION_INVALID com todos os campos, em ordem de índice', async () => {
    const party = await startedParty()
    for (const [body, fields] of [
      [
        {
          type: 'adjustDeck',
          build: [
            { cardId: S, copies: 0 },
            { cardId: S, copies: 1 },
          ],
        },
        [
          { field: 'build.0.copies', reason: 'notPositiveInteger' },
          { field: 'build.1.cardId', reason: 'duplicateCard' },
        ],
      ],
      [{ type: 'adjustDeck' }, [{ field: 'build', reason: 'required' }]],
      [
        { type: 'adjustDeck', build: 'all' },
        [{ field: 'build', reason: 'notArray' }],
      ],
      [
        { type: 'adjustDeck', build: [3, { copies: 1, x: 1 }] },
        [
          { field: 'build.0', reason: 'invalidItem' },
          { field: 'build.1.cardId', reason: 'required' },
          { field: 'build.1.x', reason: 'unknownKey' },
        ],
      ],
    ] as const) {
      const response = await act(party.id, body)
      expect(response.status, JSON.stringify(body)).toBe(400)
      expect(response.body).toEqual(invalid([...fields]))
    }
    expect((await get(party.id)).savedAt).toBe(party.savedAt)
  })

  it('REQ-66: notOwned, buildBelowMinimum e copyLimitExceeded → 409, nada gravado', async () => {
    const party = await startedParty()
    const cases: [TCopies, object][] = [
      [
        [
          { cardId: E, copies: 30 },
          { cardId: S, copies: 31 },
        ],
        { reason: 'notOwned', cardId: S },
      ],
      [
        [...WARRIOR_BUILD, { cardId: D, copies: 1 }],
        { reason: 'notOwned', cardId: D },
      ],
      [
        [
          { cardId: E, copies: 30 },
          { cardId: S, copies: 29 },
        ],
        { reason: 'buildBelowMinimum' },
      ],
    ]
    for (const [build, details] of cases) {
      const response = await act(party.id, { type: 'adjustDeck', build })
      expect(response.status).toBe(409)
      expect(response.body).toEqual(notAllowed(details))
    }
    expect((await get(party.id)).savedAt).toBe(party.savedAt)

    // A pasta não tem limite de cópias; a build tem (4.3).
    await mount(party.id, (player) => {
      player.tcgFolder = [{ cardId: SYN, copies: 6 }]
    })
    const mounted = await get(party.id)
    expect(mounted.members[0].player.tcgFolder).toEqual([
      { cardId: SYN, copies: 6 },
    ])
    const limited = await act(party.id, {
      type: 'adjustDeck',
      build: [
        { cardId: E, copies: 30 },
        { cardId: S, copies: 25 },
        { cardId: SYN, copies: 5 },
      ],
    })
    expect(limited.status).toBe(409)
    expect(limited.body).toEqual(
      notAllowed({ reason: 'copyLimitExceeded', cardId: SYN })
    )
    expect(await get(party.id)).toEqual(mounted)
  })

  it('REQ-66: o que sai da build não cabe na pasta → 409 tcgFolderFull', async () => {
    await request(server())
      .patch('/lab/config')
      .send({ tcgFolderCapacity: 0 })
      .expect(200)
    const party = await startedParty()
    expect(party.members[0].player.tcgFolderCapacity).toBe(0)
    await mount(party.id, (player) => {
      player.build = [
        { cardId: E, copies: 30 },
        { cardId: S, copies: 31 },
      ]
      player.deck.push(S)
    })

    const response = await act(party.id, {
      type: 'adjustDeck',
      build: WARRIOR_BUILD,
    })
    expect(response.status).toBe(409)
    expect(response.body).toEqual(notAllowed({ reason: 'tcgFolderFull' }))
  })

  it('REQ-68/D-70/D-79: save v3 inserido à mão é lido (pasta vazia, chaves novas nos padrões) e regravado como v9', async () => {
    await request(server())
      .patch('/lab/config')
      .send({ recoverHandSize: 10, tcgFolderCapacity: 50 })
      .expect(200)
    const party = await startedParty()
    const db = ctx.app.get<Database>(DRIZZLE)
    const [row] = await db
      .select()
      .from(parties)
      .where(eq(parties.id, party.id))
    const state = row.state as {
      config: Record<string, number>
      members: { player: Record<string, unknown> }[]
    }
    const config: Record<string, number> = { ...state.config }
    removePostV6Config(config)
    for (const key of Object.keys(NEW_KEYS)) delete config[key]
    delete config.inventoryCapacity
    delete config.purseCapacity
    delete config.escapeVigorPercent
    delete config.reserveDeck
    delete config.vaultCapacity
    delete config.vaultDeckSlots
    delete config.vaultGoldCapacity
    const members = state.members.map((m) => {
      const player = { ...m.player }
      delete player.tcgFolder
      delete player.inventory
      delete player.equipment
      delete player.statuses
      delete player.vault
      delete player.lastScavenge
      return { ...m, player }
    })
    await db
      .update(parties)
      .set({
        state: withoutMarkets({
          ...state,
          rewardDecks: undefined,
          schemaVersion: 3,
          config,
          members,
        }),
      })
      .where(eq(parties.id, party.id))

    const read = await get(party.id)
    expect(read.members[0].player.tcgFolder).toEqual([])
    expect(read.members[0].player.tcgFolderCapacity).toBe(
      GAME_CONFIG_DEFAULTS.tcgFolderCapacity
    )

    await act(party.id, { type: 'recover', option: 'shuffleHand' }).expect(200)
    const drawn = await act(party.id, {
      type: 'recover',
      option: 'drawToHand',
    })
    expect(drawn.body.members[0].player.hand).toHaveLength(
      GAME_CONFIG_DEFAULTS.recoverHandSize
    )

    const [saved] = await db
      .select()
      .from(parties)
      .where(eq(parties.id, party.id))
    expect(saved.state).toMatchObject({
      schemaVersion: 9,
      config: NEW_KEYS,
      members: [{ player: { tcgFolder: [] } }],
    })
  })
})
