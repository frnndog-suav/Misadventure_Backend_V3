import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { PartiesRepository } from '@/domain/campaign/application/repositories/parties-repository'
import { GameConfigRepository } from '@/domain/lab/application/repositories/game-config-repository'

/** ISO 8601 UTC como `Date.toISOString` (CONTRATO §1). */
export const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

/** Nenhum save e o laboratório nos padrões (cenários da FEAT-05). */
export async function resetCampaign(app: INestApplication): Promise<void> {
  const parties = app.get(PartiesRepository)
  for (const party of await parties.findAll()) {
    await parties.delete(party)
  }
  await app.get(GameConfigRepository).delete()
}

export async function postParty(
  app: INestApplication,
  body: object = {
    name: 'Os Teimosos',
    characterName: 'Lia',
    playerClass: 'warrior',
  }
): Promise<{ id: string; savedAt: string } & Record<string, unknown>> {
  const response = await request(app.getHttpServer())
    .post('/parties')
    .send(body)
  if (response.status !== 201) {
    throw new Error(`POST /parties respondeu ${response.status}`)
  }
  return response.body
}

export const WARRIOR_BODY = {
  name: 'Os Teimosos',
  characterName: 'Lia',
  playerClass: 'warrior',
}

export const DIMENSION_INVALID = {
  code: 'DIMENSION_INVALID',
  message: 'Não foi possível preparar a dimensão. Avise o designer da coleção.',
}

export const PARTY_NOT_FOUND = {
  error: { code: 'PARTY_NOT_FOUND', message: 'Grupo não encontrado.' },
}
