import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { SeededRng } from '@/core/rng/seeded-rng'
import {
  emptyEquipment,
  PartyMember,
  type TPlayerState,
} from '@/domain/campaign/enterprise/entities/party-member'
import {
  Party,
  type TPartyProps,
} from '@/domain/campaign/enterprise/entities/party'
import { GAME_CONFIG_DEFAULTS } from '@/domain/lab/enterprise/value-objects/game-config/defaults'

import { fixedClock } from '../../fakes/fixed-clock'

/** Jogador recém-preparado com o `warrior` da fixture (REQ-34), mão e deck fixos. */
export function makePlayerState(
  override: Partial<TPlayerState> = {}
): TPlayerState {
  return {
    playerClasses: [{ playerClass: 'warrior', deckLockMet: true }],
    build: [
      { cardId: 'fixture.endurance-basic', copies: 30 },
      { cardId: 'fixture.strength-basic', copies: 30 },
    ],
    tcgFolder: [],
    inventory: [],
    equipment: emptyEquipment(),
    vault: { slots: [], decks: [], gold: 0 },
    lastScavenge: null,
    deck: [
      ...Array.from({ length: 27 }, () => 'fixture.endurance-basic'),
      ...Array.from({ length: 26 }, () => 'fixture.strength-basic'),
    ],
    hand: [
      'fixture.strength-basic',
      'fixture.endurance-basic',
      'fixture.strength-basic',
      'fixture.endurance-basic',
      'fixture.strength-basic',
      'fixture.endurance-basic',
      'fixture.strength-basic',
    ],
    discard: [],
    gold: 10,
    baseHealth: 20,
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
    zoneId: 'fixture.gray-harbor',
    respawnZoneId: 'fixture.gray-harbor',
    ...override,
  }
}

/** Save válido por padrão (grupo de 1, idle, preparado); cada teste muda só o que exercita. */
export function makeParty(
  override: Partial<TPartyProps> = {},
  id = new UniqueEntityID('party-1')
): Party {
  const host = PartyMember.create(
    { characterName: 'Lia', kind: 'human', player: makePlayerState() },
    new UniqueEntityID('member-1')
  )
  const now = fixedClock().now()
  const config = override.config ?? { ...GAME_CONFIG_DEFAULTS }
  const turnOrder = override.turnOrder ?? [host.id]

  return Party.restore(
    {
      name: 'Os Teimosos',
      members: [host],
      hostMemberId: host.id,
      status: 'idle',
      config,
      rngState: SeededRng.fromSeed(42).state(),
      rewardDecks: [],
      dimension: {
        dimensionCardId: 'fixture.test-dimension',
        startingCityZoneId: 'fixture.gray-harbor',
        map: {
          zones: [
            {
              zoneId: 'fixture.gray-harbor',
              x: 0,
              y: 0,
              arrows: ['north', 'east', 'south', 'west'],
            },
            { zoneId: 'fixture.old-mine', x: 1, y: 0, arrows: ['west'] },
          ],
          crossings: [{ zoneIds: ['fixture.gray-harbor', 'fixture.old-mine'] }],
        },
      },
      turnOrder,
      turn: {
        round: 1,
        memberId: turnOrder[0],
        actionPoints: config.actionPointsPerTurn,
      },
      createdAt: now,
      savedAt: now,
      ...override,
    },
    id
  )
}
