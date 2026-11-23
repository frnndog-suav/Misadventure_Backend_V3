import type {
  TCard,
  TPlayerClass,
  TZoneQuestCard,
} from '@/domain/catalog/enterprise/value-objects/card'
import type { TMapZone } from '../map-assembly'

export type TZoneQuestAction =
  | { type: 'takeQuest'; questCardId: string }
  | { type: 'continueQuest' | 'finishQuest' | 'abandonQuest'; questId: string }

/** Provação e mentor (README 8.3 e 8.4; REQ-133). */
export type TGenericQuestAction =
  | { type: 'takeTrialQuest'; classId: string; specializationId: string }
  | { type: 'trainWithMentor'; classId: string }

export type TQuestAction = TZoneQuestAction | TGenericQuestAction

export type TZoneQuestChoice = TQuestAction & {
  actionPoints: number
  gold: number
}

/** Missão genérica aberta; as metas vêm da configuração do grupo. */
export type TOpenGenericQuest = Readonly<
  {
    questId: string
    classId: TPlayerClass
    randomEventSuccesses?: number
    combatVictories?: number
  } & (
    { type: 'trialQuest'; specializationId: string } | { type: 'mentorQuest' }
  )
>

/** Especialização concedida; a trava fica falsa até salvar a build (REQ-134). */
export type TGrantedSpecialization = Readonly<{
  playerClass: TPlayerClass
  specializationId: string
  deckLockMet: boolean
}>

export const GENERIC_QUEST_TITLES = {
  trialQuest: 'Missão de provação',
  mentorQuest: 'Missão do mentor',
} as const

/** Zonas onde provação e mentor são aceitos e finalizados (README 8.3). */
export function acceptsGenericQuests(zone: TCard | undefined): boolean {
  return (
    zone?.type === 'zone' &&
    (zone.zoneType === 'urban' || zone.zoneType === 'inhabited')
  )
}

export function describeGenericQuest(
  quest: TOpenGenericQuest,
  targets: { randomEventSuccesses: number; combatVictories: number }
) {
  return {
    questId: quest.questId,
    type: quest.type,
    title: GENERIC_QUEST_TITLES[quest.type],
    classId: quest.classId,
    ...(quest.type === 'trialQuest' && {
      specializationId: quest.specializationId,
    }),
    objectives: {
      randomEventSuccesses: {
        current: quest.randomEventSuccesses ?? 0,
        target: targets.randomEventSuccesses,
      },
      combatVictories: {
        current: quest.combatVictories ?? 0,
        target: targets.combatVictories,
      },
    },
  }
}

/** Ids das abertas na ordem de aceitação entre os tipos (CONTRATO FEAT-15). */
export function orderedQuestIds(player: {
  openZoneQuests?: readonly { questId: string }[]
  openGenericQuests?: readonly { questId: string }[]
  questOrder?: readonly string[]
}): string[] {
  const order = player.questOrder ?? []
  return [...(player.openZoneQuests ?? []), ...(player.openGenericQuests ?? [])]
    .map(({ questId }) => questId)
    .sort((left, right) => order.indexOf(left) - order.indexOf(right))
}

export type TOpenZoneQuest = Readonly<{
  questId: string
  questCardId: string
  originZoneId: string
  stageIndex: number
  status?: 'ready' | 'inProgress' | 'completed'
  randomEventSuccesses?: number
  combatVictories?: number
}>

export type TZoneQuestAttempt = Readonly<{
  encounterId: string
  questId: string
  stageIndex: number
  reservedCardId?: string
}>

export type TQuestRefusal = {
  reason:
    | 'questOfferUnavailable'
    | 'questNotOpen'
    | 'questWrongStage'
    | 'questWrongZone'
    | 'questObjectivesIncomplete'
    | 'questLimitReached'
    | 'genericQuestAlreadyOpen'
    | 'questClassIneligible'
    | 'questSpecializationIneligible'
    | 'questPeakTooLow'
    | 'notEnoughGold'
    | 'noActionPoints'
  questId?: string
  questCardId?: string
  classId?: string
  specializationId?: string
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
      status: quest.status ?? 'ready',
      objectives:
        stage.type === 'objectives'
          ? {
              randomEventSuccesses: {
                current: quest.randomEventSuccesses ?? 0,
                target: stage.randomEventSuccesses,
              },
              combatVictories: {
                current: quest.combatVictories ?? 0,
                target: stage.combatVictories,
              },
            }
          : null,
    },
  }
}
