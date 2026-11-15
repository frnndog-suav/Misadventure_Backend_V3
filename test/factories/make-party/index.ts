import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { SeededRng } from '@/core/rng/seeded-rng'
import { PartyMember } from '@/domain/campaign/enterprise/entities/party-member'
import {
  Party,
  type TPartyProps,
} from '@/domain/campaign/enterprise/entities/party'
import { GAME_CONFIG_DEFAULTS } from '@/domain/lab/enterprise/value-objects/game-config/defaults'

import { fixedClock } from '../../fakes/fixed-clock'

/** Save válido por padrão (grupo de 1, idle); cada teste muda só o que exercita. */
export function makeParty(
  override: Partial<TPartyProps> = {},
  id = new UniqueEntityID('party-1')
): Party {
  const host = PartyMember.create(
    { characterName: 'Lia', kind: 'human' },
    new UniqueEntityID('member-1')
  )
  const now = fixedClock().now()

  return Party.restore(
    {
      name: 'Os Teimosos',
      members: [host],
      hostMemberId: host.id,
      status: 'idle',
      config: { ...GAME_CONFIG_DEFAULTS },
      rngState: SeededRng.fromSeed(42).state(),
      createdAt: now,
      savedAt: now,
      ...override,
    },
    id
  )
}
