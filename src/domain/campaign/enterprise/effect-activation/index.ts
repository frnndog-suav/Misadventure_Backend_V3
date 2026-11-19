import type { TExecutableActivation } from '../activatable-effects'
import { maxHealthOf, type TPlayerState } from '../entities/party-member'

export type TActivationApplied = {
  activation: TExecutableActivation['kind']
  amount?: number
  cardIds?: readonly string[]
  statusIds?: readonly string[]
}

/** Aplica ativações em ordem sobre o estado resultante do pagamento. */
export function applyActivations(
  initial: TPlayerState,
  activations: readonly TExecutableActivation[],
  purseCapacity: number
): { player: TPlayerState; applied: TActivationApplied[] } {
  let player = initial
  const applied: TActivationApplied[] = []
  for (const activation of activations) {
    const record = (
      patch: Partial<TPlayerState>,
      details: Omit<TActivationApplied, 'activation'> = {}
    ) => {
      player = { ...player, ...patch }
      applied.push({ activation: activation.kind, ...details })
    }
    switch (activation.kind) {
      case 'gainGold': {
        const gold = Math.min(purseCapacity, player.gold + activation.amount)
        record({ gold }, { amount: gold - player.gold })
        break
      }
      case 'loseGold': {
        const gold = Math.max(0, player.gold - activation.amount)
        record({ gold }, { amount: player.gold - gold })
        break
      }
      case 'heal': {
        const health = Math.min(
          maxHealthOf(player),
          player.health + activation.amount
        )
        record({ health }, { amount: health - player.health })
        break
      }
      case 'loseLife': {
        const health =
          activation.amount === 'halfHealth'
            ? Math.ceil(player.health / 2)
            : Math.max(0, player.health - activation.amount)
        record({ health }, { amount: player.health - health })
        break
      }
      case 'restoreVigor': {
        const vigor = Math.min(player.peak, player.vigor + activation.amount)
        record({ vigor }, { amount: vigor - player.vigor })
        break
      }
      case 'gainPeak':
        record(
          { peak: player.peak + activation.amount },
          { amount: activation.amount }
        )
        break
      case 'drawCards': {
        const cardIds = player.deck.slice(0, activation.count)
        record(
          {
            hand: [...player.hand, ...cardIds],
            deck: player.deck.slice(cardIds.length),
          },
          { cardIds }
        )
        break
      }
      case 'removeBuffs':
      case 'removeDebuffs': {
        const mark = activation.kind === 'removeBuffs' ? 'buff' : 'debuff'
        const statuses = player.statuses.filter(
          (status) => status.mark !== mark
        )
        const statusIds = player.statuses
          .filter((status) => status.mark === mark)
          .map(({ statusId }) => statusId)
        record({ statuses }, { statusIds })
        break
      }
      case 'modifierFlat':
      case 'modifierPercent':
        record({})
        break
      default: {
        const exhaustive: never = activation
        return exhaustive
      }
    }
  }
  return { player, applied }
}
