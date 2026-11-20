import { readFile } from 'node:fs/promises'
import { eq } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PartiesRepository } from '@/domain/campaign/application/repositories/parties-repository'
import type { TEffect } from '@/domain/catalog/enterprise/value-objects/effect'
import { DRIZZLE, type Database } from '@/infra/database/database.tokens'
import { parties } from '@/infra/database/drizzle/schema'
import type { TPartyHttp } from '@/infra/http/presenters/party-presenter'
import {
  BOSQUE_INPUT,
  CONTENT_INVALID,
  createContentApp,
} from '../../../../../test/content-app'
import { resetCampaign, WARRIOR_BODY } from '../../../../../test/parties-e2e'

const POTION = 'fixture.healing-potion'
const TONIC = 'fixture.strength-tonic'
const ARMOR = 'fixture.guardian-armor'
const AMULET = 'fixture.focus-amulet'
const COIN = 'fixture.lucky-coin'
const STRENGTH = 'fixture.strength-basic'
const ENDURANCE = 'fixture.endurance-basic'

const healingEffect: TEffect = {
  text: 'Recupera 5 de vida.',
  trigger: null,
  cost: [{ kind: 'consumeSelf' }],
  activation: [{ kind: 'heal', amount: 5 }],
  duration: { kind: 'immediate' },
  mark: null,
}

const tonicStatus = {
  sourceCardId: TONIC,
  effectIndex: 0,
  text: '+3 de Ataque durante 2 vezes suas.',
  mark: 'buff',
  activation: [
    { kind: 'modifierFlat', changes: [{ modifier: 'attack', amount: 3 }] },
  ],
  duration: { kind: 'forOwnTurns', turns: 2 },
  remaining: 2,
}

const activate = (cardId: string, effectIndex = 0) => ({
  type: 'prepare',
  operation: 'activate',
  cardId,
  effectIndex,
})

const player = (party: TPartyHttp) => party.members[0].player

describe('FEAT-11 — efeitos e status (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createContentApp>>

  beforeAll(async () => {
    ctx = await createContentApp()
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

  async function createParty(): Promise<TPartyHttp> {
    return (
      await request(server()).post('/parties').send(WARRIOR_BODY).expect(201)
    ).body
  }

  async function startedParty(withBothAttributes = false): Promise<TPartyHttp> {
    if (withBothAttributes) {
      // Uma mão de 32 garante duas cartas de cada atributo (30 de cada no deck).
      // O cenário do contrato começa com 0 de ouro. O padrão do lab é 10.
      await request(server())
        .patch('/lab/config')
        .send({ initialHandSize: 32, initialGold: 0 })
        .expect(200)
    }
    const { id } = await createParty()
    return (await request(server()).post(`/parties/${id}/session`).expect(200))
      .body
  }

  async function give(
    party: TPartyHttp,
    cardId: string,
    quantity = 1
  ): Promise<TPartyHttp> {
    return (
      await request(server())
        .post(`/lab/parties/${party.id}/members/${party.members[0].id}/grants`)
        .send({ type: 'card', cardId, quantity })
        .expect(200)
    ).body
  }

  async function equip(party: TPartyHttp, cardId: string): Promise<TPartyHttp> {
    return (
      await act(party, { type: 'prepare', operation: 'equip', cardId }).expect(
        200
      )
    ).body
  }

  async function publishCard(slug: string, fields: object): Promise<string> {
    await request(server())
      .post('/lab/content/collections/fixture/cards')
      .send({
        slug,
        name: slug,
        flavorText: null,
        rarity: 'common',
        tags: [],
        ...fields,
      })
      .expect(201)
    const cardId = `fixture.${slug}`
    await request(server())
      .post(`/lab/content/cards/${cardId}/publish`)
      .expect(200)
    return cardId
  }

  const publishConsumable = (slug: string, effects: readonly TEffect[]) =>
    publishCard(slug, {
      type: 'item',
      itemCategory: 'consumable',
      effects,
      toolKind: null,
      scavengeZoneTypes: [],
      scavengeTool: null,
    })

  async function applied(
    party: TPartyHttp,
    cardId: string,
    effectIndex = 0
  ): Promise<TPartyHttp> {
    return (await act(party, activate(cardId, effectIndex)).expect(200)).body
  }

  async function expectRefusal(
    party: TPartyHttp,
    action: object,
    reason: string,
    cardId?: string
  ) {
    const before = await get(party)
    const response = await act(party, action).expect(409)
    expect(response.body).toEqual({
      error: {
        code: 'ACTION_NOT_ALLOWED',
        message: 'Esta ação não é permitida agora.',
        details: cardId === undefined ? { reason } : { reason, cardId },
      },
    })
    expect(await get(party)).toEqual(before)
  }

  it('REQ-97: a fixture expõe variações aprovadas no catálogo de efeitos', async () => {
    const variations = await readFile('docs/EFEITOS-CATALOGO.md', 'utf8')
    const response = await request(server())
      .get(`/catalog/cards/${TONIC}`)
      .expect(200)
    const { cost, activation, duration } = response.body.effects[0]
    for (const kind of [cost[0].kind, activation[0].kind, duration.kind]) {
      const row = variations
        .split('\n')
        .find((line) => line.startsWith(`| \`${kind}\` |`))
      expect(row).toMatch(/FEAT-11/)
      expect(row).toMatch(/\| entra \|/)
    }
  })

  it('REQ-98: catálogo devolve o efeito estruturado completo da poção', async () => {
    const response = await request(server())
      .get(`/catalog/cards/${POTION}`)
      .expect(200)
    expect(response.body.effects).toEqual([healingEffect])
  })

  it('REQ-99: editor rejeita efeito de consumível sem consumeSelf no path do custo', async () => {
    await request(server())
      .post('/lab/content/collections')
      .send(BOSQUE_INPUT)
      .expect(201)
    const response = await request(server())
      .post('/lab/content/collections/bosque/cards')
      .send({
        slug: 'frasco',
        type: 'item',
        name: 'Frasco Quebrado',
        flavorText: null,
        rarity: 'common',
        itemCategory: 'consumable',
        tags: [],
        effects: [{ ...healingEffect, cost: [] }],
        toolKind: null,
        scavengeZoneTypes: [],
        scavengeTool: null,
      })
      .expect(400)

    expect(response.body).toEqual({
      error: {
        ...CONTENT_INVALID,
        details: {
          fields: [
            {
              path: 'effects.0.cost',
              message:
                'Consumível precisa ter o custo de usar a própria carta.',
            },
          ],
        },
      },
    })
  })

  it('REQ-100: fixture inclui as quatro cartas de efeito e ferramentas sem texto redundante', async () => {
    const response = await request(server())
      .get('/catalog/collections/fixture/cards')
      .expect(200)
    expect(response.body).toHaveLength(24)
    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: TONIC, type: 'item' }),
        expect.objectContaining({ id: COIN, type: 'item' }),
        expect.objectContaining({ id: ARMOR, type: 'equipment' }),
        expect.objectContaining({ id: AMULET, type: 'equipment' }),
        expect.objectContaining({ id: 'fixture.pickaxe', effects: [] }),
        expect.objectContaining({ id: 'fixture.fishing-rod', effects: [] }),
      ])
    )
  })

  it('REQ-101: projeta efeitos ativáveis em ordem com instrução de pagamento pronta', async () => {
    const created = await createParty()
    expect(player(created).statuses).toEqual([])
    expect(player(created).activatableEffects).toEqual([])

    const party = await startedParty(true)
    const potionEffect = {
      cardId: POTION,
      effectIndex: 0,
      source: 'inventory',
      handPayment: null,
    }
    expect(player(await give(party, POTION, 2)).activatableEffects).toEqual([
      potionEffect,
    ])
    await give(party, AMULET)
    await give(party, COIN)
    const equipped = await equip(party, AMULET)
    expect(player(equipped).hand).toContain(STRENGTH)
    expect(player(equipped).activatableEffects).toEqual([
      potionEffect,
      {
        cardId: AMULET,
        effectIndex: 0,
        source: 'equipment',
        handPayment: null,
      },
      {
        cardId: AMULET,
        effectIndex: 1,
        source: 'equipment',
        handPayment: null,
      },
      {
        cardId: AMULET,
        effectIndex: 2,
        source: 'equipment',
        handPayment: { count: 1, text: 'Escolha 1 carta de Força.' },
      },
    ])
  })

  it('REQ-102: passivo entra no cálculo somente com a armadura equipada', async () => {
    const party = await startedParty()
    expect(player(await give(party, ARMOR)).effectiveModifiers.defense).toBe(5)
    const equipped = await equip(party, ARMOR)
    expect(player(equipped).effectiveModifiers.defense).toBe(19)
    expect(player(equipped).activatableEffects).toEqual([])
    await expectRefusal(party, activate(ARMOR), 'notActivatable')

    const requiredArmor = await publishCard('armadura-com-requisito', {
      type: 'equipment',
      slot: 'torso',
      modifiers: [{ modifier: 'defense', value: 10 }],
      peakRequirement: 10,
      classRestriction: [],
      blocksShield: false,
      abilities: [],
      effects: [
        {
          text: '+20% de Defesa enquanto estiver em uso.',
          trigger: null,
          cost: [],
          activation: [
            {
              kind: 'modifierPercent',
              changes: [{ modifier: 'defense', percent: 20 }],
            },
          ],
          duration: { kind: 'whileSourceActive' },
          mark: 'buff',
        },
      ],
      refinement: null,
      enchantment: null,
      priceMultiplier: 1,
      scavengeTool: null,
    })
    const lowersPeak = await publishConsumable('reduz-pico', [
      {
        ...healingEffect,
        text: 'Reduza o Pico em 1 e recupere 5 de vida.',
        cost: [
          ...healingEffect.cost,
          { kind: 'reducePeak', amount: 1, percent: null },
        ],
      },
    ])
    const secondParty = await startedParty()
    await give(secondParty, requiredArmor)
    expect(
      player(await equip(secondParty, requiredArmor)).effectiveModifiers.defense
    ).toBe(19)
    await give(secondParty, lowersPeak)
    const below = player(await applied(secondParty, lowersPeak))
    expect(below).toMatchObject({
      peak: 9,
      equipment: { torso: requiredArmor },
      effectiveModifiers: { defense: 5 },
    })
  })

  it('REQ-103: tônico projeta status, decrementa e expira nas duas primeiras vezes', async () => {
    const party = await startedParty()
    await give(party, TONIC)
    const activated = (await act(party, activate(TONIC)).expect(200))
      .body as TPartyHttp
    expect(player(activated).inventory).toEqual([])
    expect(player(activated).effectiveModifiers.attack).toBe(9)
    expect(player(activated).statuses).toEqual([
      { statusId: expect.any(String), ...tonicStatus },
    ])
    const [status] = player(activated).statuses
    const first = (await act(party, { type: 'endTurn' }).expect(200))
      .body as TPartyHttp
    expect(player(first).statuses).toEqual([{ ...status, remaining: 1 }])
    expect(player(first).effectiveModifiers.attack).toBe(9)
    const second = (await act(party, { type: 'endTurn' }).expect(200))
      .body as TPartyHttp
    expect(player(second).statuses).toEqual([])
    expect(player(second).effectiveModifiers.attack).toBe(6)

    const durations = [
      { kind: 'untilLeaveZone' },
      { kind: 'untilEndOfTurn' },
      { kind: 'untilStartOfNextTurn' },
      { kind: 'untilEndOfRound' },
      { kind: 'forRounds', rounds: 2 },
      { kind: 'infinite' },
      { kind: 'untilPartyEnd' },
    ] as const satisfies readonly TEffect['duration'][]
    const cardId = await publishConsumable(
      'duracoes-testadas',
      durations.map((duration) => ({
        ...healingEffect,
        text: 'Aumente a Defesa em 1.',
        activation: [
          {
            kind: 'modifierFlat',
            changes: [{ modifier: 'defense', amount: 1 }],
          },
        ],
        mark: 'buff',
        duration,
      }))
    )
    await give(party, cardId, durations.length)
    for (const index of durations.keys()) await applied(party, cardId, index)
    const active = player(await get(party))
    expect(active.statuses.map(({ duration }) => duration)).toEqual(durations)
    const moved = (
      await act(party, {
        type: 'move',
        zoneId: active.moveTargets[0],
      }).expect(200)
    ).body as TPartyHttp
    expect(player(moved).statuses.map(({ duration }) => duration)).toEqual(
      durations.slice(1)
    )
    const nextRound = (await act(party, { type: 'endTurn' }).expect(200))
      .body as TPartyHttp
    expect(
      player(nextRound).statuses.map(({ duration, remaining }) => [
        duration,
        remaining,
      ])
    ).toEqual(
      durations
        .slice(4)
        .map((duration) => [duration, duration.kind === 'forRounds' ? 1 : null])
    )
    const anotherRound = (await act(party, { type: 'endTurn' }).expect(200))
      .body as TPartyHttp
    expect(
      player(anotherRound).statuses.map(({ duration }) => duration)
    ).toEqual(durations.slice(5))
    await request(server()).post(`/parties/${party.id}/session/end`).expect(200)
    expect(player(await get(party)).statuses).toEqual(
      player(anotherRound).statuses
    )
  })

  it('REQ-104: paga Vigor, vida e carta escolhida, cura até o teto e consome a poção', async () => {
    const party = await startedParty(true)
    await give(party, POTION, 2)
    await give(party, AMULET)
    await equip(party, AMULET)

    for (const [vigor, gold] of [
      [5, 10],
      [0, 20],
    ]) {
      const response = (await act(party, activate(AMULET)).expect(200))
        .body as TPartyHttp
      expect(player(response)).toMatchObject({ vigor, gold })
      expect(response.turn.actionPoints).toBe(3)
    }
    expect(player(await get(party)).activatableEffects).not.toContainEqual(
      expect.objectContaining({ cardId: AMULET, effectIndex: 0 })
    )
    await expectRefusal(party, activate(AMULET), 'notEnoughVigor')

    const donated = (await act(party, activate(AMULET, 1)).expect(200))
      .body as TPartyHttp
    expect(player(donated)).toMatchObject({ health: 17, vigor: 5 })
    const healed = (await act(party, activate(POTION)).expect(200))
      .body as TPartyHttp
    expect(player(healed)).toMatchObject({
      health: 22,
      inventory: [{ cardId: POTION, quantity: 1 }],
    })
    const full = (await act(party, activate(POTION)).expect(200))
      .body as TPartyHttp
    expect(player(full)).toMatchObject({ health: 22, inventory: [] })

    const before = player(full)
    const paid = (
      await act(party, {
        ...activate(AMULET, 2),
        payment: { handCards: [STRENGTH] },
      }).expect(200)
    ).body as TPartyHttp
    const remainingHand = [...before.hand]
    remainingHand.splice(remainingHand.indexOf(STRENGTH), 1)
    expect(player(paid).hand.slice(0, -2)).toEqual(remainingHand)
    expect(player(paid).attributeDiscardPileCount).toBe(
      before.attributeDiscardPileCount + 1
    )
    expect(player(paid).attributeDeckCount).toBe(before.attributeDeckCount - 2)

    const mixedEffects = await publishConsumable('efeitos-combinados', [
      {
        ...healingEffect,
        text: 'Pague metade do ouro e da vida, reduza o Pico em 2, descarte uma Força aleatória e restaure 9 de Vigor.',
        cost: [
          ...healingEffect.cost,
          {
            kind: 'payGold',
            amount: { base: 'halfGold', multiplier: 1, minimum: 1 },
          },
          {
            kind: 'donateLife',
            amount: { base: 'halfHealth', multiplier: 1, minimum: 1 },
          },
          { kind: 'reducePeak', amount: 2, percent: null },
          {
            kind: 'discardFromHand',
            requirements: [{ attribute: 'strength', count: 1 }],
            excludeAttributes: [],
            constraint: 'none',
            random: true,
          },
        ],
        activation: [{ kind: 'restoreVigor', amount: 9 }],
      },
      {
        ...healingEffect,
        text: 'Perca 3 de Defesa até remover o debuff.',
        activation: [
          {
            kind: 'modifierFlat',
            changes: [{ modifier: 'defense', amount: -3 }],
          },
        ],
        duration: { kind: 'infinite' },
        mark: 'debuff',
      },
      {
        ...healingEffect,
        text: 'Remova os seus debuffs.',
        activation: [{ kind: 'removeDebuffs', target: 'self' }],
      },
      {
        ...healingEffect,
        text: 'Remova os seus buffs.',
        activation: [{ kind: 'removeBuffs', target: 'self' }],
      },
    ])
    await give(party, mixedEffects, 4)
    await give(party, TONIC)
    expect(player(await applied(party, TONIC)).statuses).toHaveLength(1)
    const withDebuff = await applied(party, mixedEffects, 1)
    expect(player(withDebuff).statuses.map(({ mark }) => mark)).toEqual([
      'buff',
      'debuff',
    ])
    expect(
      player(await applied(party, mixedEffects, 2)).statuses.map(
        ({ mark }) => mark
      )
    ).toEqual(['buff'])
    const cleared = player(await applied(party, mixedEffects, 3))
    expect(cleared.statuses).toEqual([])

    expect(cleared.activatableEffects).toContainEqual({
      cardId: mixedEffects,
      effectIndex: 0,
      source: 'inventory',
      handPayment: null,
    })
    const afterFormula = player(await applied(party, mixedEffects))
    expect(afterFormula).toMatchObject({
      gold: 10,
      health: 11,
      peak: 8,
      vigor: 8,
    })
    expect(
      afterFormula.hand.filter((cardId) => cardId === STRENGTH)
    ).toHaveLength(
      cleared.hand.filter((cardId) => cardId === STRENGTH).length - 1
    )
    expect(afterFormula.attributeDiscardPileCount).toBe(
      cleared.attributeDiscardPileCount + 1
    )
  })

  it('REQ-105: recusa fase, origem, índice, variação e pagamento, sem gravar', async () => {
    const idle = await createParty()
    const inactive = await act(idle, activate(POTION)).expect(409)
    expect(inactive.body).toEqual({
      error: {
        code: 'PARTY_SESSION_NOT_ACTIVE',
        message: 'Não há sessão em andamento neste grupo.',
      },
    })
    const party = await startedParty(true)
    await expectRefusal(party, activate(POTION), 'notOwned', POTION)
    await give(party, POTION)
    await give(party, AMULET)
    await give(party, COIN)
    await expectRefusal(party, activate(AMULET), 'equipmentNotInUse')
    await expectRefusal(party, activate(POTION, 5), 'effectNotFound')
    await expectRefusal(party, activate(COIN), 'notActivatableYet')
    await equip(party, AMULET)
    const minimum = await publishConsumable('minimo-de-ouro', [
      {
        ...healingEffect,
        text: 'Pague metade do ouro, no mínimo uma moeda. Recupere 5 de vida.',
        cost: [
          ...healingEffect.cost,
          {
            kind: 'payGold',
            amount: { base: 'halfGold', multiplier: 1, minimum: 1 },
          },
        ],
      },
    ])
    await give(party, minimum)
    await expectRefusal(party, activate(minimum), 'minimumNotMet')
    await expectRefusal(party, activate(AMULET, 2), 'paymentInvalid')
    await expectRefusal(
      party,
      {
        ...activate(AMULET, 2),
        payment: { handCards: [ENDURANCE] },
      },
      'paymentInvalid',
      ENDURANCE
    )

    const before = await get(party)
    for (const [body, field, reason] of [
      [activate(POTION, -1), 'effectIndex', 'notNonNegativeInteger'],
      [{ ...activate(POTION), payment: 3 }, 'payment', 'notObject'],
      [
        { ...activate(POTION), payment: { handCards: [1] } },
        'payment.handCards.0',
        'invalidItem',
      ],
      [{ ...activate(POTION), times: 2 }, 'times', 'unknownKey'],
    ] as const) {
      const response = await act(party, body).expect(400)
      expect(response.body).toEqual({
        error: {
          code: 'ACTION_INVALID',
          message: 'Ação inválida.',
          details: { fields: [{ field, reason }] },
        },
      })
    }
    expect(await get(party)).toEqual(before)
  })

  it('REQ-106: somente o consumível habilita prepare, inclusive com zero pontos', async () => {
    const party = await startedParty()
    let current = party
    for (let i = 0; i < party.turn.actionPoints; i++) {
      current = (
        await act(party, {
          type: 'recover',
          option: 'drawToHand',
        }).expect(200)
      ).body
    }
    expect(current.turn.actionPoints).toBe(0)
    expect(player(current).availableActions).toEqual(['endTurn'])

    const granted = await give(party, POTION)
    expect(granted.turn.actionPoints).toBe(0)
    expect(player(granted).availableActions).toEqual(['prepare', 'endTurn'])
    const activated = (await act(party, activate(POTION)).expect(200))
      .body as TPartyHttp
    expect(activated.turn.actionPoints).toBe(0)
    expect(player(activated).availableActions).toEqual(['endTurn'])
  })

  it('REQ-107: grava save v8 com status em ordem e lê save v6 com lista vazia', async () => {
    const party = await startedParty()
    await give(party, TONIC, 2)
    await act(party, activate(TONIC)).expect(200)
    await act(party, { type: 'endTurn' }).expect(200)
    const activated = (await act(party, activate(TONIC)).expect(200))
      .body as TPartyHttp
    const activeStatuses = player(activated).statuses
    expect(activeStatuses.map(({ remaining }) => remaining)).toEqual([1, 2])
    expect(new Set(activeStatuses.map(({ statusId }) => statusId)).size).toBe(2)
    expect(player(await get(party)).statuses).toEqual(activeStatuses)
    const repository = ctx.app.get(PartiesRepository)
    expect((await repository.findContentInUse()).cardIds.has(TONIC)).toBe(true)

    const db = ctx.app.get<Database>(DRIZZLE)
    const [row] = await db
      .select()
      .from(parties)
      .where(eq(parties.id, party.id))
    const state = row.state as {
      schemaVersion: number
      config: { escapeVigorPercent?: number; reserveDeck?: unknown }
      members: { player: { statuses?: unknown } }[]
    }
    expect(state.schemaVersion).toBe(8)
    expect(state.members[0].player.statuses).toEqual(activeStatuses)

    state.schemaVersion = 6
    delete state.config.escapeVigorPercent
    delete state.config.reserveDeck
    delete state.members[0].player.statuses
    await db.update(parties).set({ state }).where(eq(parties.id, party.id))
    expect(player(await get(party)).statuses).toEqual([])
    expect((await repository.findContentInUse()).cardIds.has(TONIC)).toBe(false)
    await act(party, { type: 'endTurn' }).expect(200)
    const [rewritten] = await db
      .select()
      .from(parties)
      .where(eq(parties.id, party.id))
    expect(rewritten.state).toMatchObject({
      schemaVersion: 8,
      members: [{ player: { statuses: [] } }],
    })
  })
})
