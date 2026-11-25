import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { DRIZZLE, type Database } from '@/infra/database/database.tokens'
import { parties } from '@/infra/database/drizzle/schema'
import type { TPartyHttp } from '@/infra/http/presenters/party-presenter'
import { createContentApp } from '../../../../../test/content-app'
import { resetCampaign, WARRIOR_BODY } from '../../../../../test/parties-e2e'

// CONTRATO FEAT-18 (v0.90): estado da montaria e cenário "Habilidade da montaria (v0.89)".
// T-75: REQ-157 (D-146, D-148, D-150 b/c).

const PONY = 'fixture.war-pony'
const HORSE = 'fixture.plow-horse'
const STEED = 'fixture.test-steed'
const SWORD = 'fixture.short-sword'

type TMountHttp = {
  cardId: string
  inventory: { cardId: string; quantity: number; equipmentState?: unknown }[]
  inventoryCapacity: number
  tcgFolder: { cardId: string; copies: number }[]
  tcgFolderCapacity: number
}
type TPlayer = TPartyHttp['members'][number]['player'] & {
  mount: TMountHttp | null
}
const player = (party: TPartyHttp) => party.members[0].player as TPlayer

const swordState = {
  refinement: 3,
  enchantments: [],
  repairMarks: 1,
  broken: false,
}

describe('FEAT-18 — estado da montaria (e2e, T-75)', () => {
  let ctx: Awaited<ReturnType<typeof createContentApp>>

  beforeAll(async () => {
    // Só nesta cópia da fixture: montaria com passivo (+4 de Ataque), para conferir effectiveModifiers.
    ctx = await createContentApp(async (root) => {
      const path = join(root, 'fixture', 'mount.json')
      const mounts = JSON.parse(await readFile(path, 'utf8'))
      mounts.push({
        id: STEED,
        name: 'Corcel de Teste',
        flavorText: null,
        rarity: 'common',
        mountTypes: ['beast'],
        creature: 'Cavalo',
        effects: [
          {
            text: '+4 de Ataque.',
            trigger: null,
            cost: [],
            activation: [
              {
                kind: 'modifierFlat',
                changes: [{ modifier: 'attack', amount: 4 }],
              },
            ],
            duration: { kind: 'whileSourceActive' },
            mark: 'buff',
          },
        ],
        abilities: [],
      })
      await writeFile(path, JSON.stringify(mounts))
    })
  })

  beforeEach(async () => {
    await resetCampaign(ctx.app)
  })

  afterAll(async () => {
    await ctx?.close()
  })

  const server = () => ctx.app.getHttpServer()
  const act = (party: TPartyHttp, body: object) =>
    request(server()).post(`/parties/${party.id}/actions`).send(body)
  const get = async (party: TPartyHttp): Promise<TPartyHttp> =>
    (await request(server()).get(`/parties/${party.id}`).expect(200)).body
  const grant = (party: TPartyHttp, cardId: string, quantity = 1) =>
    request(server())
      .post(`/lab/parties/${party.id}/members/${party.members[0].id}/grants`)
      .send({ type: 'card', cardId, quantity })

  async function startedParty(): Promise<TPartyHttp> {
    const { id } = (
      await request(server()).post('/parties').send(WARRIOR_BODY).expect(201)
    ).body
    return (await request(server()).post(`/parties/${id}/session`).expect(200))
      .body
  }

  async function expectNotAllowed(
    party: TPartyHttp,
    action: object,
    reason: string
  ) {
    const before = await get(party)
    const response = await act(party, action).expect(409)
    expect(response.body).toEqual({
      error: {
        code: 'ACTION_NOT_ALLOWED',
        message: 'Esta ação não é permitida agora.',
        details: { reason },
      },
    })
    expect(await get(party)).toEqual(before)
  }

  const usePony = {
    type: 'prepare',
    operation: 'useAbility',
    abilityId: 'pony-rest',
    mountAbility: true,
  }

  it('REQ-157: o jogador começa sem montaria (mount: null)', async () => {
    const party = await startedParty()

    expect(player(party).mount).toBeNull()
  })

  it('REQ-157: doação de carta mount sem montaria → vira a montaria, vazia, com as capacidades do laboratório', async () => {
    await request(server())
      .patch('/lab/config')
      .send({ mountInventorySlots: 2, mountFolderCapacity: 7 })
      .expect(200)
    const party = await startedParty()

    const response = await grant(party, PONY).expect(200)

    expect(player(response.body).mount).toEqual({
      cardId: PONY,
      inventory: [],
      inventoryCapacity: 2,
      tcgFolder: [],
      tcgFolderCapacity: 7,
    })
    expect(player(response.body).inventory).toEqual([])
  })

  it('REQ-157: doação de carta mount com montaria → 409 LAB_GRANT_NO_SPACE mountAlreadyOwned; nada muda', async () => {
    const party = await startedParty()
    await grant(party, PONY).expect(200)
    const before = await get(party)

    const response = await grant(party, HORSE).expect(409)

    expect(response.body).toEqual({
      error: {
        code: 'LAB_GRANT_NO_SPACE',
        message: 'Não há espaço para essa doação.',
        details: { reason: 'mountAlreadyOwned' },
      },
    })
    expect(await get(party)).toEqual(before)
  })

  it('REQ-157/D-150: doação de fixture.war-pony com quantity 2 sem montaria → 409 LAB_GRANT_NO_SPACE mountAlreadyOwned; mount continua null', async () => {
    const party = await startedParty()
    const before = await get(party)

    const response = await grant(party, PONY, 2).expect(409)

    expect(response.body).toEqual({
      error: {
        code: 'LAB_GRANT_NO_SPACE',
        message: 'Não há espaço para essa doação.',
        details: { reason: 'mountAlreadyOwned' },
      },
    })
    const after = await get(party)
    expect(player(after).mount).toBeNull()
    expect(after).toEqual(before)
  })

  describe('Cenário "Habilidade da montaria (v0.89)"', () => {
    it("REQ-157: com fixture.war-pony doado, activatableEffects traz source 'mount' e usableAbilities traz mountAbility: true", async () => {
      const party = await startedParty()

      const donated = (await grant(party, PONY).expect(200)).body

      expect(player(donated).activatableEffects).toContainEqual({
        cardId: PONY,
        effectIndex: 0,
        source: 'mount',
        handPayment: null,
      })
      const ability = player(donated).usableAbilities.find(
        ({ abilityId }) => abilityId === 'pony-rest'
      )
      expect(ability).toMatchObject({
        abilityId: 'pony-rest',
        mountAbility: true,
      })
      expect(ability).not.toHaveProperty('equipmentSlot')
    })

    it('REQ-157: prepare activate com o cardId da montaria → 200 (paga 1 de ouro)', async () => {
      const party = await startedParty()
      const donated = (await grant(party, PONY).expect(200)).body
      const gold = player(donated).gold

      const response = await act(party, {
        type: 'prepare',
        operation: 'activate',
        cardId: PONY,
        effectIndex: 0,
      }).expect(200)

      expect(player(response.body).gold).toBe(gold - 1)
      expect(player(response.body).mount?.cardId).toBe(PONY)
    })

    it('REQ-157: prepare useAbility com mountAbility: true → 200 e a habilidade sai de usableAbilities (1 uso por vez)', async () => {
      const party = await startedParty()
      await grant(party, PONY).expect(200)

      const response = await act(party, usePony).expect(200)

      expect(
        player(response.body).usableAbilities.some(
          ({ abilityId }) => abilityId === 'pony-rest'
        )
      ).toBe(false)
    })

    it('REQ-157: useAbility com equipmentSlot e mountAbility juntos → 400 ACTION_INVALID', async () => {
      const party = await startedParty()
      await grant(party, PONY).expect(200)

      const response = await act(party, {
        ...usePony,
        equipmentSlot: 'weapon',
      }).expect(400)

      // AMBÍGUO: o contrato não fixa `details.fields` deste caso; confere só o código.
      expect(response.body.error.code).toBe('ACTION_INVALID')
    })

    it('REQ-157: useAbility sem equipmentSlot e sem mountAbility → 400 ACTION_INVALID', async () => {
      const party = await startedParty()

      const response = await act(party, {
        type: 'prepare',
        operation: 'useAbility',
        abilityId: 'pony-rest',
      }).expect(400)

      expect(response.body.error.code).toBe('ACTION_INVALID')
    })

    it('REQ-157: sem montaria, useAbility com mountAbility: true → 409 noMount', async () => {
      const party = await startedParty()

      await expectNotAllowed(party, usePony, 'noMount')
    })
  })

  it('REQ-157: passivo da montaria entra em effectiveModifiers', async () => {
    const party = await startedParty()
    const { modifiers, peak } = player(party)

    const donated = (await grant(party, STEED).expect(200)).body

    // O fixo da montaria soma à base antes do multiplicador do Pico, como o do equipamento.
    expect(player(donated).effectiveModifiers.attack).toBe(
      Math.floor(((modifiers.attack + 4) * (100 + peak)) / 100)
    )
  })

  it('REQ-157/D-146: reabertura (encerrar e retomar a sessão) preserva a montaria', async () => {
    const party = await startedParty()
    const donated = (await grant(party, PONY).expect(200)).body

    await request(server()).post(`/parties/${party.id}/session/end`).expect(200)
    const resumed = (
      await request(server()).post(`/parties/${party.id}/session`).expect(200)
    ).body

    expect(player(resumed).mount).toEqual(player(donated).mount)
  })

  it('REQ-157/D-150(c): equipamento com estado no inventário extra é preservado no save v11 e não funciona', async () => {
    const party = await startedParty()
    await grant(party, PONY).expect(200)
    const before = player(await get(party))
    const db = ctx.app.get<Database>(DRIZZLE)
    const [row] = await db
      .select()
      .from(parties)
      .where(eq(parties.id, party.id))
    const state = row.state as {
      members: { player: Record<string, unknown> }[]
    }
    state.members[0].player.mount = {
      cardId: PONY,
      inventory: [{ cardId: SWORD, quantity: 1, equipmentState: swordState }],
      tcgFolder: [],
    }
    await db
      .update(parties)
      .set({ state: state as typeof row.state })
      .where(eq(parties.id, party.id))

    const read = player(await get(party))

    expect(read.mount?.inventory).toEqual([
      expect.objectContaining({
        cardId: SWORD,
        quantity: 1,
        equipmentState: expect.objectContaining({
          refinement: 3,
          repairMarks: 1,
          broken: false,
        }),
      }),
    ])
    expect(read.effectiveModifiers).toEqual(before.effectiveModifiers)
    expect(read.activatableEffects).not.toContainEqual(
      expect.objectContaining({ cardId: SWORD })
    )

    await act(party, { type: 'endTurn' }).expect(200)
    const [rewritten] = await db
      .select()
      .from(parties)
      .where(eq(parties.id, party.id))
    expect(rewritten.state).toMatchObject({
      schemaVersion: 11,
      members: [
        {
          player: {
            mount: {
              cardId: PONY,
              inventory: [
                { cardId: SWORD, quantity: 1, equipmentState: swordState },
              ],
              tcgFolder: [],
            },
          },
        },
      ],
    })
  })
})
