import type {
  TCard,
  TZoneQuestCard,
} from '@/domain/catalog/enterprise/value-objects/card'
import type { TMapZone } from '../map-assembly'

export type TZoneQuestAction =
  | { type: 'takeQuest'; questCardId: string }
  | { type: 'continueQuest' | 'finishQuest' | 'abandonQuest'; questId: string }

export type TZoneQuestChoice = TZoneQuestAction & {
  actionPoints: number
  gold: number
}

export type TOpenZoneQuest = Readonly<{
  questId: string
  questCardId: string
  originZoneId: string
  stageIndex: number
}>

export type TQuestRefusal = {
  reason:
    | 'questOfferUnavailable'
    | 'questNotOpen'
    | 'questWrongStage'
    | 'questWrongZone'
    | 'questObjectivesIncomplete'
    | 'questLimitReached'
    | 'noActionPoints'
  questId?: string
  questCardId?: string
}

export function questOffer(card: TZoneQuestCard) {
  return { questCardId: card.id, title: card.title, summary: card.summary }
}

export function questBoard(zone: TMapZone | undefined, size: number) {
  return zone?.questBoard ?? zone?.questDeck?.slice(0, size) ?? []
}

export function questDrawPile(zone: TMapZone, size: number) {
  return zone.questDrawPile ?? zone.questDeck?.slice(size) ?? []
}

export function zoneQuest(cards: ReadonlyMap<string, TCard>, id: string) {
  const card = cards.get(id)
  return card?.type === 'zoneQuest' ? card : undefined
}

export function describeZoneQuest(quest: TOpenZoneQuest, card: TZoneQuestCard) {
  const stage = card.stages[quest.stageIndex]
  return {
    questId: quest.questId,
    type: 'zoneQuest' as const,
    questCardId: quest.questCardId,
    originZoneId: quest.originZoneId,
    title: card.title,
    stage: {
      index: quest.stageIndex,
      text: stage.text,
      location: stage.location,
      status: 'ready' as const,
      objectives:
        stage.type === 'objectives'
          ? {
              randomEventSuccesses: {
                current: 0,
                target: stage.randomEventSuccesses,
              },
              combatVictories: { current: 0, target: stage.combatVictories },
            }
          : null,
    },
  }
}
