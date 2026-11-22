import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PartiesRepository } from '@/domain/campaign/application/repositories/parties-repository'
import { createApp } from '../../../../../test/lab-app'
import {
  ISO_UTC,
  postParty,
  resetCampaign,
  WARRIOR_BODY,
} from '../../../../../test/parties-e2e'

function invalid(fields: { field: string | null; reason: string }[]) {
  return {
    error: {
      code: 'PARTY_INVALID',
      message: 'Dados do grupo inválidos.',
      details: { fields },
    },
  }
}

const WARRIOR = WARRIOR_BODY

describe('POST /parties (e2e)', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await createApp(true)
  })

  beforeEach(async () => {
    await resetCampaign(app)
  })

  afterAll(async () => {
    await app.close()
  })

  it('REQ-31: cria um grupo de 1 já preparado (mapa, ordem, jogador) e o grava', async () => {
    const response = await request(app.getHttpServer())
      .post('/parties')
      .send({ ...WARRIOR, name: '  Os Teimosos ' })

    expect(response.status).toBe(201)
    const memberId: string = response.body.members[0].id
    expect(response.body).toEqual({
      id: expect.any(String),
      name: 'Os Teimosos',
      status: 'idle',
      members: [
        {
          id: expect.any(String),
          characterName: 'Lia',
          kind: 'human',
          isHost: true,
          player: {
            down: false,
            usableAbilities: [],
            playerClasses: [{ playerClass: 'warrior', deckLockMet: true }],
            questBoard: [],
            openQuests: [],
            questChoices: [],
            specializations: [],
            gold: 10,
            baseHealth: 20,
            maxHealth: 22,
            health: 22,
            peak: 10,
            vigor: 10,
            modifiers: {
              attack: 6,
              defense: 5,
              accuracy: 45,
              evasion: 15,
              celerity: 8,
              piercing: 0,
              reflection: 0,
            },
            hand: expect.any(Array),
            handCopies: expect.any(Array),
            nextTurnActionPointDebt: 0,
            skipNextTurn: false,
            lastKnockout: null,
            lastRandomEvent: null,
            lastRewardSearch: null,
            lastRewardDelivery: null,
            attributeDeckCount: 53,
            attributeDiscardPileCount: 0,
            zoneId: 'fixture.gray-harbor',
            respawnZoneId: 'fixture.gray-harbor',
            moveTargets: expect.any(Array),
            availableActions: [
              'move',
              'recover',
              'adjustDeck',
              'useVault',
              'startEvent',
              'endTurn',
            ],
            build: [
              { cardId: 'fixture.endurance-basic', copies: 30 },
              { cardId: 'fixture.strength-basic', copies: 30 },
            ],
            buildSize: 60,
            tcgFolder: [],
            tcgFolderCapacity: 30,
            inventory: [],
            inventoryCapacity: 10,
            equipment: {
              head: null,
              torso: null,
              legs: null,
              feet: null,
              cape: null,
              weapon: null,
              shield: null,
              accessory: null,
            },
            purseCapacity: 300,
            effectiveModifiers: {
              attack: 6,
              defense: 5,
              accuracy: 49,
              evasion: 16,
              celerity: 8,
              piercing: 0,
              reflection: 0,
            },
            vault: { slots: [], decks: [], gold: 0 },
            vaultCapacity: 30,
            vaultDeckSlots: 10,
            vaultGoldCapacity: 2000,
            scavengeTargets: [],
            lastScavenge: null,
            statuses: [],
            activatableEffects: [],
          },
        },
      ],
      dimension: {
        dimensionCardId: 'fixture.test-dimension',
        startingCityZoneId: 'fixture.gray-harbor',
        map: { zones: expect.any(Array), crossings: expect.any(Array) },
      },
      turnOrder: [memberId],
      turn: { round: 1, memberId, actionPoints: 3 },
      randomEventEncounter: null,
      pendingRewards: [],
      triggeredEffectChoice: null,
      combat: null,
      lastCombatResult: null,
      createdAt: expect.stringMatching(ISO_UTC),
      savedAt: expect.stringMatching(ISO_UTC),
    })
    expect(response.body.id).not.toBe('')
    expect(response.body.createdAt).toBe(response.body.savedAt)

    const player = response.body.members[0].player
    expect(player.hand).toHaveLength(7)
    expect(
      player.hand.every((card: string) =>
        ['fixture.strength-basic', 'fixture.endurance-basic'].includes(card)
      )
    ).toBe(true)
    // A ordem do deck não trafega (D-42); a build trafega agrupada (D-69).
    expect(player).not.toHaveProperty('deck')

    const read = await request(app.getHttpServer()).get(
      `/parties/${response.body.id}`
    )
    expect(read.status).toBe(200)
    expect(read.body).toEqual(response.body)
  })

  it('REQ-32: o mapa tem as 4 zonas da coleção, a cidade em (0, 0) e travessias coerentes', async () => {
    const response = await request(app.getHttpServer())
      .post('/parties')
      .send(WARRIOR)
    expect(response.status).toBe(201)

    const { zones, crossings } = response.body.dimension.map as {
      zones: { zoneId: string; x: number; y: number; arrows: string[] }[]
      crossings: { zoneIds: [string, string] }[]
    }
    expect(zones[0]).toEqual({
      zoneId: 'fixture.gray-harbor',
      x: 0,
      y: 0,
      arrows: ['north', 'east', 'south', 'west'],
    })
    expect(
      Object.fromEntries(zones.map((zone) => [zone.zoneId, zone.arrows.length]))
    ).toEqual({
      'fixture.gray-harbor': 4,
      'fixture.whispering-grove': 2,
      'fixture.stone-bend': 2,
      'fixture.old-mine': 1,
    })
    const byId = new Map(zones.map((zone) => [zone.zoneId, zone]))
    // Uma zona por célula.
    expect(new Set(zones.map(({ x, y }) => `${x},${y}`)).size).toBe(4)
    // Forma das 2 setas (D-37): opostas em `straight`, vizinhas em `corner`.
    const opposite = (a: string, b: string) =>
      ['north,south', 'south,north', 'east,west', 'west,east'].includes(
        `${a},${b}`
      )
    const [g1, g2] = byId.get('fixture.whispering-grove')?.arrows ?? []
    const [s1, s2] = byId.get('fixture.stone-bend')?.arrows ?? []
    expect(opposite(g1 ?? '', g2 ?? '')).toBe(true)
    expect(opposite(s1 ?? '', s2 ?? '')).toBe(false)
    // Travessias só entre vizinhas, em ordem de id, e todas as zonas ligadas.
    const linked = new Set(['fixture.gray-harbor'])
    for (const { zoneIds } of crossings) {
      expect(zoneIds).toEqual([...zoneIds].sort())
      const [a, b] = zoneIds.map((id) => byId.get(id))
      expect(Math.abs(a!.x - b!.x) + Math.abs(a!.y - b!.y)).toBe(1)
    }
    for (let grew = true; grew;) {
      grew = false
      for (const {
        zoneIds: [a, b],
      } of crossings) {
        if (linked.has(a) !== linked.has(b)) {
          linked.add(a).add(b)
          grew = true
        }
      }
    }
    expect(linked.size).toBe(4)
  })

  it('REQ-34: a classe escolhida define o deck e os modificadores do jogador', async () => {
    const response = await request(app.getHttpServer())
      .post('/parties')
      .send({ ...WARRIOR, playerClass: 'rogue' })

    expect(response.status).toBe(201)
    const player = response.body.members[0].player
    expect(player.playerClasses).toEqual([
      { playerClass: 'rogue', deckLockMet: true },
    ])
    expect(player.modifiers).toEqual({
      attack: 5,
      defense: 2,
      accuracy: 46,
      evasion: 22,
      celerity: 12,
      piercing: 0,
      reflection: 0,
    })
    expect(player.attributeDeckCount).toBe(53)
  })

  it('REQ-34: trava do laboratório acima do deck → deckLockMet false e modificadores padrão', async () => {
    await request(app.getHttpServer())
      .patch('/lab/config')
      .send({ lockTwoEssentials: 31 })
      .expect(200)

    const response = await request(app.getHttpServer())
      .post('/parties')
      .send(WARRIOR)

    expect(response.status).toBe(201)
    const player = response.body.members[0].player
    expect(player.playerClasses).toEqual([
      { playerClass: 'warrior', deckLockMet: false },
    ])
    expect(player.modifiers).toEqual({
      attack: 5,
      defense: 3,
      accuracy: 50,
      evasion: 20,
      celerity: 10,
      piercing: 0,
      reflection: 0,
    })
  })

  it('REQ-17: nome em branco e personagem longo → 400 e nada é gravado', async () => {
    const response = await request(app.getHttpServer()).post('/parties').send({
      name: '   ',
      characterName: 'Um nome com mais de vinte e quatro letras',
      playerClass: 'warrior',
    })

    expect(response.status).toBe(400)
    expect(response.body).toEqual(
      invalid([
        { field: 'name', reason: 'blank' },
        { field: 'characterName', reason: 'tooLong' },
      ])
    )
    const list = await request(app.getHttpServer()).get('/parties')
    expect(list.body).toEqual([])
  })

  it('REQ-17: campos ausentes e não texto → required e notString', async () => {
    const response = await request(app.getHttpServer())
      .post('/parties')
      .send({ characterName: 7, playerClass: 'warrior' })

    expect(response.status).toBe(400)
    expect(response.body).toEqual(
      invalid([
        { field: 'name', reason: 'required' },
        { field: 'characterName', reason: 'notString' },
      ])
    )
  })

  it('REQ-17: corpo que não é objeto JSON ou está malformado → 400 invalidBody', async () => {
    const asArray = await request(app.getHttpServer())
      .post('/parties')
      .send([1])
    const malformed = await request(app.getHttpServer())
      .post('/parties')
      .set('Content-Type', 'application/json')
      .send('{"name":')

    for (const response of [asArray, malformed]) {
      expect(response.status).toBe(400)
      expect(response.body).toEqual(
        invalid([{ field: null, reason: 'invalidBody' }])
      )
    }
    const list = await request(app.getHttpServer()).get('/parties')
    expect(list.body).toEqual([])
  })

  it('REQ-17: minPlayers = 2 no laboratório → 400 belowMinPlayers', async () => {
    await request(app.getHttpServer())
      .patch('/lab/config')
      .send({ minPlayers: 2 })
      .expect(200)

    const response = await request(app.getHttpServer())
      .post('/parties')
      .send({ ...WARRIOR, name: 'Solo' })

    expect(response.status).toBe(400)
    expect(response.body).toEqual(
      invalid([{ field: 'members', reason: 'belowMinPlayers' }])
    )
  })

  it('REQ-35: playerClass ausente, não texto ou sem classe no catálogo → 400 e nada é gravado', async () => {
    const send = (body: object) =>
      request(app.getHttpServer()).post('/parties').send(body)
    const base = { name: 'Os Teimosos', characterName: 'Lia' }

    const missing = await send(base)
    const notString = await send({ ...base, playerClass: 7 })
    const notAClass = await send({ ...base, playerClass: 'banana' })
    // Está no enum de classes, mas não tem classe publicada no catálogo.
    const notInCatalog = await send({ ...base, playerClass: 'mage' })

    expect(missing.status).toBe(400)
    expect(missing.body).toEqual(
      invalid([{ field: 'playerClass', reason: 'required' }])
    )
    expect(notString.status).toBe(400)
    expect(notString.body).toEqual(
      invalid([{ field: 'playerClass', reason: 'notString' }])
    )
    for (const response of [notAClass, notInCatalog]) {
      expect(response.status).toBe(400)
      expect(response.body).toEqual(
        invalid([{ field: 'playerClass', reason: 'unknownClass' }])
      )
    }
    const list = await request(app.getHttpServer()).get('/parties')
    expect(list.body).toEqual([])
  })

  it('REQ-35: os problemas vêm na ordem name, characterName, playerClass, members', async () => {
    await request(app.getHttpServer())
      .patch('/lab/config')
      .send({ minPlayers: 2 })
      .expect(200)

    const response = await request(app.getHttpServer())
      .post('/parties')
      .send({ name: '', characterName: '', playerClass: 'banana' })

    expect(response.status).toBe(400)
    expect(response.body).toEqual(
      invalid([
        { field: 'name', reason: 'blank' },
        { field: 'characterName', reason: 'blank' },
        { field: 'playerClass', reason: 'unknownClass' },
        { field: 'members', reason: 'belowMinPlayers' },
      ])
    )
  })

  it('REQ-37: o save gravado guarda a preparação e devolve o mesmo grupo (RNG: e2e do Drizzle)', async () => {
    const created = await postParty(app)

    const parties = app.get(PartiesRepository)
    const saved = await parties.findById(created.id)

    expect(saved?.dimension.dimensionCardId).toBe('fixture.test-dimension')
    expect(saved?.turnOrder.map((id) => id.toString())).toEqual([
      (created.members as { id: string }[])[0]?.id,
    ])
    expect(saved?.members[0]?.player.deck).toHaveLength(53)
    expect(saved?.members[0]?.player.hand).toHaveLength(7)
    // O que o save guarda é o que a resposta mostrou.
    const read = await request(app.getHttpServer()).get(
      `/parties/${created.id}`
    )
    expect(read.body).toEqual(created)
  })

  it('REQ-23: o grupo guarda a configuração da criação; os novos usam a atual', async () => {
    const before = await postParty(app)

    await request(app.getHttpServer())
      .patch('/lab/config')
      .send({ actionPointsPerTurn: 4 })
      .expect(200)
    const after = await postParty(app, {
      name: 'Depois',
      characterName: 'Bo',
      playerClass: 'rogue',
    })

    const parties = app.get(PartiesRepository)
    expect(
      (await parties.findById(before.id))?.config.actionPointsPerTurn
    ).toBe(3)
    expect((await parties.findById(after.id))?.config.actionPointsPerTurn).toBe(
      4
    )

    await request(app.getHttpServer()).post('/lab/config/reset').expect(200)
    expect(
      (await parties.findById(before.id))?.config.actionPointsPerTurn
    ).toBe(3)
  })
})
