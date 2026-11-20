import type { UniqueEntityID } from '@/core/entities/unique-entity-id'
import type { TZoneAction } from '@/domain/catalog/enterprise/value-objects/card'

import type { TActivatableEffect } from '../activatable-effects'
import { connectedZones } from '../connected-zones'
import type { Party } from '../entities/party'
import type { TPartyActionType } from '../party-action'

/**
 * Ações que o membro pode mandar agora (README 12.1, 11.4; REQ-58; D-65).
 * Ordem fixa: `move`, `recover`, `prepare`, `adjustDeck`, `scavenge`,
 * `useVault`, `endTurn` (12.2; REQ-75, REQ-93). Só a vez de quem age; os
 * demais não têm nada.
 * `equipmentCardIds`: quais ids do inventário são cartas `equipment` (o
 * inventário guarda só o id, D-75; quem chama lê no catálogo).
 * `zoneActions`: as ações da zona atual do membro (também lidas no catálogo).
 * Só entram ações já implementadas (cada FEAT acrescenta as suas).
 */
export function availableActions(
  party: Party,
  memberId: UniqueEntityID,
  equipmentCardIds: ReadonlySet<string>,
  zoneActions: readonly TZoneAction[] = [],
  /** Os alvos do Vasculhar do membro (REQ-90; `scavengeTargets`). */
  scavengeTargets: readonly string[] = [],
  activatableEffects: readonly TActivatableEffect[] = [],
  canStartEvent = false
): TPartyActionType[] {
  const { turn } = party
  if (!turn.memberId.equals(memberId)) return []
  if (party.pendingRewards.length) return ['resolveReward']
  const encounter = party.randomEventEncounter
  if (encounter) {
    if (encounter.phase === 'success' || encounter.phase === 'setback')
      return []
    const actions: TPartyActionType[] = []
    if (encounter.phase === 'anticipation') actions.push('revealEvent')
    else {
      actions.push('giveUpEvent')
      if (encounter.requirements.some(({ payable }) => payable))
        actions.push('payEventRequirement')
      if (encounter.requirements.every(({ status }) => status === 'check'))
        actions.push('resolveEvent')
      if (encounter.escape?.unavailableReason === null)
        actions.push('escapeEvent')
    }
    if (encounter.payments.length === 0 && activatableEffects.length > 0)
      actions.push('prepare')
    return actions
  }

  const member = party.members.find((m) => m.id.equals(memberId))
  const actions: TPartyActionType[] = []
  if (
    member &&
    turn.actionPoints >= 1 &&
    connectedZones(party.dimension.map, member.player.zoneId).length > 0
  ) {
    actions.push('move')
  }
  if (turn.actionPoints >= 1) actions.push('recover')
  // Gratuita (K2, D-77): entra com qualquer quantidade de pontos.
  if (
    member &&
    (activatableEffects.length > 0 ||
      member.player.inventory.some((slot) =>
        equipmentCardIds.has(slot.cardId)
      ) ||
      Object.values(member.player.equipment).some((cardId) => cardId !== null))
  ) {
    actions.push('prepare')
  }
  if (turn.actionPoints >= 1) actions.push('adjustDeck')
  if (turn.actionPoints >= 1 && scavengeTargets.length > 0) {
    actions.push('scavenge')
  }
  if (turn.actionPoints >= 1 && zoneActions.includes('useVault')) {
    actions.push('useVault')
  }
  if (turn.actionPoints >= 1 && canStartEvent) actions.push('startEvent')
  actions.push('endTurn')
  return actions
}
