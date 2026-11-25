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

// CONTRATO FEAT-18 (v0.90): ativação `loseMount` ("loseMount com conteúdo", só nos e2e do backend).
// T-75: REQ-163 (D-150 a). Arquivo separado: o conteúdo com `loseMount` só carrega depois da T-75.

const PONY = 'fixture.war-pony'
const SCROLL = 'fixture.lose-mount-scroll'
const POTION = 'fixture.healing-potion'
const STRENGTH = 'fixture.strength-basic'

type TPlayer = TPartyHttp['members'][number]['player'] & {
  mount: { cardId: string } | null
}
const player = (party: TPartyHttp) => party.members[0].player as TPlayer

describe('FEAT-18 — perder a montaria (e2e, T-75)', () => {
  let ctx: Awaited<ReturnType<typeof createContentApp>>

  beforeAll(async () => {
    ctx = await createContentApp(async (root) => {
      const path = join(root, 'fixture', 'item.json')
      const items = JSON.parse(await readFile(path, 'utf8'))
      items.push({
        id: SCROLL,
        name: 'Pergaminho da Perda',
        flavorText: null,
        rarity: 'common',
        itemCategory: 'consumable',
        tags: [],
        effects: [
          {
            text: 'Perca a montaria.',
            trigger: null,
            cost: [{ kind: 'consumeSelf' }],
            activation: [{ kind: 'loseMount' }],
            duration: { kind: 'immediate' },
            mark: null,
          },
        ],
        toolKind: null,
        scavengeZoneTypes: [],
        scavengeTool: null,
      })
      await writeFile(path, JSON.stringify(items))
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
  const grant = (party: TPartyHttp, cardId: string, quantity = 1) =>
    request(server())
      .post(`/lab/parties/${party.id}/members/${party.members[0].id}/grants`)
      .send({ type: 'card', cardId, quantity })
      .expect(200)
  const activateScroll = {
    type: 'prepare',
    operation: 'activate',
    cardId: SCROLL,
    effectIndex: 0,
  }

  async function startedParty(): Promise<TPartyHttp> {
    const { id } = (
      await request(server()).post('/parties').send(WARRIOR_BODY).expect(201)
    ).body
    return (await request(server()).post(`/parties/${id}/session`).expect(200))
      .body
  }

  it('REQ-163: com montaria e conteúdo, a ativação loseMount deixa mount: null (montaria, inventário extra e pasta extra ao limbo)', async () => {
    const party = await startedParty()
    await grant(party, PONY)
    await grant(party, SCROLL)
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
      inventory: [{ cardId: POTION, quantity: 2 }],
      tcgFolder: [{ cardId: STRENGTH, copies: 3 }],
    }
    await db
      .update(parties)
      .set({ state: state as typeof row.state })
      .where(eq(parties.id, party.id))

    const response = await act(party, activateScroll).expect(200)

    expect(player(response.body).mount).toBeNull()
    expect(player(response.body).inventory).toEqual([])
    const reread = (
      await request(server()).get(`/parties/${party.id}`).expect(200)
    ).body
    expect(player(reread).mount).toBeNull()
  })

  it('REQ-163: docs/EFEITOS-CATALOGO.md tem a linha de loseMount, executada pela FEAT-18', async () => {
    const catalog = await readFile('docs/EFEITOS-CATALOGO.md', 'utf8')
    const row = catalog
      .split('\n')
      .find((line) => line.startsWith('| `loseMount` |'))

    expect(row).toMatch(/FEAT-18/)
  })

  it('REQ-163: sem montaria, a ativação loseMount é aceita e não acontece nada além do custo', async () => {
    const party = await startedParty()
    await grant(party, SCROLL)

    const response = await act(party, activateScroll).expect(200)

    expect(player(response.body).mount).toBeNull()
    expect(player(response.body).inventory).toEqual([])
  })
})
