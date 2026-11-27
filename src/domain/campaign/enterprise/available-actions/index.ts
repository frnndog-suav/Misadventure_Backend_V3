import type { UniqueEntityID } from '@/core/entities/unique-entity-id'
import type { TZoneAction } from '@/domain/catalog/enterprise/value-objects/card'

import type { TActivatableEffect } from '../activatable-effects'
import { artificerActive } from '../blacksmith'
import { connectedZones } from '../connected-zones'
import type { Party } from '../entities/party'
import type { TPartyActionType } from '../party-action'
import type { TZoneQuestChoice } from '../zone-quests'

/**
 * Ações que o membro pode mandar agora (README 12.1, 11.4; REQ-58; D-65).
 * Ordem fixa: `move`, `recover`, `prepare`, `adjustDeck`, `scavenge`,
 * `useVault`, as ações de missão (`artificerWorkshop` depois de `abandonQuest`), `visitBlacksmith`, `visitMarket`, `trainWithMentor`,
 * `saveRespawnPoint`, `endTurn` (12.2; REQ-75, REQ-93, REQ-140, REQ-149, REQ-153). Só a vez de quem age; os
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
  canStartEvent = false,
  encounter = party.randomEventEncounter,
  canUseAbility = party.adventureAbilityOptions().length > 0,
  combat = party.combat,
  inUrbanZone = false,
  questChoices: readonly TZoneQuestChoice[] = [],
  /** Os ids do inventário do membro que são boosters (REQ-144; `openBooster`). */
  boosterCardIds: ReadonlySet<string> = new Set(),
  canCompleteDimension = false
): TPartyActionType[] {
  const { turn } = party
  if (party.status === 'frozen') return []
  const choice = party.triggeredEffectChoice
  if (choice)
    return choice.memberId === memberId.toString()
      ? ['resolveTriggeredEffect']
      : []
  const decision = party.pendingCombatDecision
  if (decision) {
    if (decision.memberId !== memberId.toString()) return []
    switch (decision.type) {
      case 'roster':
        return ['confirmCombatRoster']
      case 'invite':
        return ['respondCombatInvite']
      case 'order':
        return ['confirmCombatOrder']
      case 'reward':
        return ['resolveReward']
      case 'turn':
        return party.combatActions(combat)
    }
  }
  if (party.pendingRewards.length)
    return party.pendingRewards.some(
      (reward) => reward.memberId === memberId.toString()
    )
      ? ['resolveReward']
      : []
  if (!turn.memberId.equals(memberId)) return []
  if (combat) return party.combatActions(combat)
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
    if (
      encounter.payments.length === 0 &&
      (activatableEffects.length > 0 || canUseAbility)
    )
      actions.push('prepare')
    return actions
  }

  const member = party.members.find((m) => m.id.equals(memberId))
  if (member?.player.down) return []
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
      canUseAbility ||
      member.player.inventory.some(
        (slot) =>
          equipmentCardIds.has(slot.cardId) || boosterCardIds.has(slot.cardId)
      ) ||
      Object.values(member.player.equipment).some((cardId) => cardId !== null))
  ) {
    actions.push('prepare')
  }
  if (turn.actionPoints >= 1) actions.push('adjustDeck')
  const questActionTypes = new Set(questChoices.map(({ type }) => type))
  if (questActionTypes.has('abandonQuest')) actions.push('abandonQuest')
  // Universal com Artífice ativo, em qualquer zona (REQ-153).
  if (member && turn.actionPoints >= 1 && artificerActive(member.player))
    actions.push('artificerWorkshop')
  const startEvent = turn.actionPoints >= 1 && canStartEvent
  if (startEvent && questChoices.length) actions.push('startEvent')
  if (turn.actionPoints >= 1 && scavengeTargets.length > 0) {
    actions.push('scavenge')
  }
  if (turn.actionPoints >= 1 && zoneActions.includes('useVault')) {
    actions.push('useVault')
  }
  for (const type of [
    'takeQuest',
    'continueQuest',
    'finishQuest',
    'takeTrialQuest',
  ] as const)
    if (questActionTypes.has(type)) actions.push(type)
  if (turn.actionPoints >= 1 && zoneActions.includes('visitBlacksmith')) {
    actions.push('visitBlacksmith')
  }
  if (turn.actionPoints >= 1 && zoneActions.includes('visitMarket')) {
    actions.push('visitMarket')
  }
  if (questActionTypes.has('trainWithMentor')) actions.push('trainWithMentor')
  if (
    member &&
    party.status === 'inSession' &&
    turn.actionPoints >= 1 &&
    inUrbanZone
  )
    actions.push('saveRespawnPoint')
  if (startEvent && !questChoices.length) actions.push('startEvent')
  if (canCompleteDimension) actions.push('completeDimension')
  actions.push('endTurn')
  return actions
}
