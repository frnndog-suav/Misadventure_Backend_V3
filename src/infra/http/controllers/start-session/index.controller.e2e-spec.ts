import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { TPartyHttp } from '../../presenters/party-presenter'
import { createApp } from '../../../../../test/lab-app'
import {
  ISO_UTC,
  PARTY_NOT_FOUND,
  postParty,
  resetCampaign,
} from '../../../../../test/parties-e2e'

describe('POST /parties/:partyId/session (e2e)', () => {
  let app: INestApplication

  beforeAll(async () => {
    app = await createApp(false)
  })

  beforeEach(async () => {
    await resetCampaign(app)
  })

  afterAll(async () => {
    await app.close()
  })

  it('REQ-20: idle → inSession, gravado; repetir devolve o grupo inalterado', async () => {
    const created = await postParty(app)
    const [member] = created.members as TPartyHttp['members']

    const started = await request(app.getHttpServer()).post(
      `/parties/${created.id}/session`
    )

    expect(started.status).toBe(200)
    expect(started.body).toEqual({
      ...created,
      status: 'inSession',
      revision: 2,
      domainEvents: [],
      savedAt: expect.stringMatching(ISO_UTC),
      members: [
        {
          ...member,
          player: {
            ...member.player,
            availableActions: [
              'move',
              'recover',
              'adjustDeck',
              'useVault',
              'visitBlacksmith',
              'visitMarket',
              'saveRespawnPoint',
              'startEvent',
              'endTurn',
            ],
          },
        },
      ],
    })
    expect(Date.parse(started.body.savedAt)).toBeGreaterThanOrEqual(
      Date.parse(created.savedAt)
    )

    const read = await request(app.getHttpServer()).get(
      `/parties/${created.id}`
    )
    const { domainEvents, ...snapshot } = started.body
    expect(domainEvents).toEqual([])
    expect(snapshot.revision).toBe(2)
    expect(read.body).toEqual(snapshot)

    const again = await request(app.getHttpServer()).post(
      `/parties/${created.id}/session`
    )
    expect(again.status).toBe(200)
    expect(again.body).toEqual(started.body)
  })

  it('REQ-20: inexistente → 404 PARTY_NOT_FOUND', async () => {
    const response = await request(app.getHttpServer()).post(
      '/parties/00000000-0000-4000-8000-000000000000/session'
    )

    expect(response.status).toBe(404)
    expect(response.body).toEqual(PARTY_NOT_FOUND)
  })
})
