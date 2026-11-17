import type { UniqueEntityID } from '@/core/entities/unique-entity-id'

import { connectedZones } from '../connected-zones'
import type { Party } from '../entities/party'
import type { TPartyActionType } from '../party-action'

/**
 * Ações que o membro pode mandar agora (README 12.1, 11.4; REQ-58; D-65).
 * Ordem fixa: `move`, `endTurn`. Só a vez de quem age; os demais não têm nada.
 * Só entram ações já implementadas (cada FEAT acrescenta as suas).
 */
export function availableActions(
  party: Party,
  memberId: UniqueEntityID
): TPartyActionType[] {
  const { turn } = party
  if (!turn.memberId.equals(memberId)) return []

  const member = party.members.find((m) => m.id.equals(memberId))
  const actions: TPartyActionType[] = []
  if (
    member &&
    turn.actionPoints >= 1 &&
    connectedZones(party.dimension.map, member.player.zoneId).length > 0
  ) {
    actions.push('move')
  }
  actions.push('endTurn')
  return actions
}
