import {
  checkEffects,
  checkEnemyAbilityExecution,
  checkEventCost,
  checkEventOutcomeEffect,
  type TEffectIssueReason,
} from '@/domain/catalog/enterprise/effect-rules'
import {
  type TBuildEntry,
  isClassActive,
} from '@/domain/catalog/enterprise/class-lock'
import {
  MODIFIERS,
  type TAbility,
  type TAttributeCard,
  type TCard,
  type TClassDefinition,
  type TCollection,
  type TCombatEventCard,
  type TDimensionCard,
  type TEquipmentCard,
  type TItemCard,
  type TRandomEventCard,
  type TRandomEventOutcomeStep,
  type TQuestCombat,
  type TZoneCard,
  type TZoneQuestCard,
} from '@/domain/catalog/enterprise/value-objects/card'
import { GAME_CONFIG_DEFAULTS } from '@/domain/lab/enterprise/value-objects/game-config/defaults'

/**
 * Motivos de um problema de integridade (REQ-15). Não trafega para o
 * frontend: vira o relatório de REQ-11 no infra (que acrescenta o arquivo).
 */
export type TCatalogIssueReason =
  | 'duplicateId'
  | 'unknownCollection'
  | 'invalidIdFormat'
  | 'duplicateTitle'
  | 'outOfRange'
  | 'urbanZoneRequiresFourArrows'
  | 'missingRequiredAction'
  | 'actionOnlyInUrbanZone'
  | 'basicAttributeCount'
  | 'enhancedAttributeCount'
  | 'synergyAttributeCount'
  | 'duplicateValue'
  | 'effectsNotAllowed'
  | 'effectsRequired'
  | 'onlyForWeapons'
  | 'empty'
  // REQ-26
  | 'arrowLayoutRequired'
  | 'arrowLayoutNotAllowed'
  | 'tooManyDimensions'
  | 'duplicateName'
  | 'essentialAttributeCount'
  | 'duplicateEssentials'
  | 'unknownCard'
  | 'notAnAttributeCard'
  | 'starterDeckSize'
  | 'starterDeckLockNotMet'
  // REQ-61
  | 'starterDeckCopyLimit'
  // REQ-81
  | 'toolKindOnlyForTools'
  | 'scavengeZoneTypesRequired'
  | 'scavengeZoneTypesNotAllowed'
  | 'notKebabCase'
  // REQ-82
  | 'notARewardCard'
  | 'notAnEventCard'
  | 'randomEventNotExecutable'
  | 'combatEventNotExecutable'
  | 'questZoneTitleMissing'
  | 'questZoneTypeMissing'
  | 'questEventInvalid'
  | 'questCardInvalid'
  | 'questRewardEffectInvalid'
  | 'specializationCount'
  | 'specializationReinforcementInvalid'
  | 'invalidAbility'
  | 'unknownAbility'
  // REQ-99
  | TEffectIssueReason

export type TCatalogIssue = {
  collectionId: string
  /** `null` para problema da coleção ou de uma classe. */
  cardId: string | null
  /** Só em problema de classe (REQ-26): a classe que o tem. */
  playerClass?: string
  /** Caminho do campo na carta ou na classe, ex.: `enemies[0].health`. */
  field: string
  reason: TCatalogIssueReason
}

/** Classe com a situação (ausente = `published`, D-47); rascunho só confere o formato (D-57b). */
export type TClassEntry = TClassDefinition & {
  readonly status?: 'draft' | 'published'
}

export type TCatalogContent = {
  collections: readonly TCollection[]
  cards: readonly TCard[]
  /** Classes (D-40); ausente = nenhuma. */
  classes?: readonly TClassEntry[]
  /**
   * Cartas de fora do conjunto conferido, só para achar as citadas em
   * `rewardDecks` (REQ-82, D-91); elas mesmas não são conferidas.
   */
  referenceCards?: readonly TCard[]
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

type TReport = (field: string, reason: TCatalogIssueReason) => void

/**
 * Regras de integridade que o tipo não expressa (REQ-15, D-23): unicidade,
 * faixas e regras entre campos. A pertinência aos enums é garantida pelo
 * tipo e conferida pelo schema no infra. Devolve os problemas na ordem das
 * coleções e das cartas recebidas; lista vazia = conteúdo íntegro.
 */
export function checkCatalogIntegrity({
  collections,
  cards,
  classes = [],
  referenceCards = [],
}: TCatalogContent): TCatalogIssue[] {
  const issues: TCatalogIssue[] = []

  const collectionIds = new Set<string>()
  for (const collection of collections) {
    if (collectionIds.has(collection.id)) {
      issues.push({
        collectionId: collection.id,
        cardId: null,
        field: 'id',
        reason: 'duplicateId',
      })
    }
    // D-22: kebab-case, sem `.`, para o prefixo das cartas não ser ambíguo.
    if (!SLUG.test(collection.id)) {
      issues.push({
        collectionId: collection.id,
        cardId: null,
        field: 'id',
        reason: 'invalidIdFormat',
      })
    }
    collectionIds.add(collection.id)
  }

  const cardIds = new Set<string>()
  const zoneTitles = new Set<string>()
  const dimensionCollections = new Set<string>()
  const releaseOrders = new Set<number>()
  const cardsById = new Map(
    [...referenceCards, ...cards].map((card) => [card.id, card])
  )

  for (const card of cards) {
    const report: TReport = (field, reason) =>
      issues.push({
        collectionId: card.collectionId,
        cardId: card.id,
        field,
        reason,
      })

    if (cardIds.has(card.id)) report('id', 'duplicateId')
    cardIds.add(card.id)

    if (!collectionIds.has(card.collectionId)) {
      report('collectionId', 'unknownCollection')
    }

    const prefix = `${card.collectionId}.`
    if (
      !card.id.startsWith(prefix) ||
      !SLUG.test(card.id.slice(prefix.length))
    ) {
      report('id', 'invalidIdFormat')
    }

    switch (card.type) {
      case 'zone': {
        const titleKey = JSON.stringify([card.collectionId, card.title])
        if (zoneTitles.has(titleKey)) report('title', 'duplicateTitle')
        zoneTitles.add(titleKey)
        checkZone(card, report)
        checkQuestDeck(card, cardsById, report)
        checkEffects(card, report)
        break
      }
      case 'attribute':
        checkAttribute(card, report)
        checkEffects(card, report)
        break
      case 'equipment':
        checkEquipment(card, report)
        checkEffects(card, report)
        break
      case 'item':
        checkNoDuplicates(card.tags, 'tags', report)
        checkTool(card, report)
        checkKebab(card.scavengeTool, 'scavengeTool', report)
        checkEffects(card, report)
        break
      case 'randomEvent':
        checkRandomEvent(card, cardsById, report)
        break
      case 'combatEvent':
        checkCombatEvent(card, report)
        break
      case 'zoneQuest':
        checkZoneQuest(card, cardsById, report)
        break
      case 'dimension':
        // REQ-26: a composição é conferida fora daqui (REQ-36).
        if (dimensionCollections.has(card.collectionId)) {
          report('type', 'tooManyDimensions')
        }
        dimensionCollections.add(card.collectionId)
        if (!isIntegerBetween(card.releaseOrder, 1, Infinity)) {
          report('releaseOrder', 'outOfRange')
        } else if (releaseOrders.has(card.releaseOrder)) {
          report('releaseOrder', 'duplicateValue')
        }
        releaseOrders.add(card.releaseOrder)
        checkZoneDecks(card.rewardDecks, 'rewardDecks', cardsById, report)
        checkZoneDecks(card.eventDecks ?? [], 'eventDecks', cardsById, report)
        checkEffects(card, report)
        break
      default: {
        const _exhaustive: never = card
        void _exhaustive
      }
    }
  }

  checkClasses(classes, cards, issues)

  return issues
}

/** README 8.5 a 8.7, 4.4 (REQ-26), com os padrões da `GameConfig` (D-40). */
function checkClasses(
  classes: readonly TClassEntry[],
  cards: readonly TCard[],
  issues: TCatalogIssue[]
): void {
  const cardsById = new Map(cards.map((card) => [card.id, card]))
  const playerClasses = new Set<string>()
  const names = new Set<string>()
  const essentialSets = new Set<string>()

  for (const definition of classes) {
    const report: TReport = (field, reason) =>
      issues.push({
        collectionId: definition.collectionId,
        cardId: null,
        playerClass: definition.playerClass,
        field,
        reason,
      })

    if (playerClasses.has(definition.playerClass)) {
      report('playerClass', 'duplicateId')
    }
    playerClasses.add(definition.playerClass)

    if (names.has(definition.name)) report('name', 'duplicateName')
    names.add(definition.name)

    const essentials = definition.essentialAttributes
    const essentialsValid =
      essentials.length >= 1 &&
      essentials.length <= 2 &&
      new Set(essentials).size === essentials.length
    if (essentials.length < 1 || essentials.length > 2) {
      report('essentialAttributes', 'essentialAttributeCount')
    }
    checkNoDuplicates(essentials, 'essentialAttributes', report)
    // Só as publicadas disputam o conjunto de essenciais (README 8.5, D-57b).
    const published = definition.status !== 'draft'
    const essentialKey = JSON.stringify([...new Set(essentials)].sort())
    if (published) {
      if (essentialsValid && essentialSets.has(essentialKey)) {
        report('essentialAttributes', 'duplicateEssentials')
      }
      essentialSets.add(essentialKey)
    }

    for (const modifier of MODIFIERS) {
      if (!isIntegerBetween(definition.baseModifiers[modifier], 0, Infinity)) {
        report(`baseModifiers.${modifier}`, 'outOfRange')
      }
    }

    checkStarterDeck(definition, cardsById, essentialsValid, published, report)
    checkSpecializations(definition, report)
  }
}

function checkSpecializations(
  definition: TClassDefinition,
  report: TReport
): void {
  const options = definition.specializations ?? []
  if (options.length !== 0 && options.length !== 4) {
    report('specializations', 'specializationCount')
  }
  const ids = new Set<string>()
  options.forEach((option, index) => {
    const path = `specializations.${index}`
    if (!option.id.trim()) report(`${path}.id`, 'empty')
    if (ids.has(option.id)) report(`${path}.id`, 'duplicateValue')
    ids.add(option.id)
    if (!option.name.trim()) report(`${path}.name`, 'empty')
    if (option.additionalAttributes.length > 2) {
      report(`${path}.additionalAttributes`, 'outOfRange')
    }
    checkNoDuplicates(
      option.additionalAttributes,
      `${path}.additionalAttributes`,
      report
    )
    checkNoDuplicates(
      option.reinforcedAttributes,
      `${path}.reinforcedAttributes`,
      report
    )
    if (
      option.reinforcedAttributes.some(
        (attribute) => !definition.essentialAttributes.includes(attribute)
      )
    ) {
      report(
        `${path}.reinforcedAttributes`,
        'specializationReinforcementInvalid'
      )
    }
    checkEffects(
      { type: 'specialization', effects: option.effects },
      (field, reason) => report(`${path}.${field}`, reason)
    )
  })
}

function checkStarterDeck(
  definition: TClassDefinition,
  cardsById: ReadonlyMap<string, TCard>,
  essentialsValid: boolean,
  published: boolean,
  report: TReport
): void {
  const deck = definition.starterDeck
  checkNoDuplicates(
    deck.map((entry) => entry.cardId),
    'starterDeck',
    report
  )

  const build: TBuildEntry[] = []
  const overLimit: string[] = []
  let valid = true
  deck.forEach((entry, index) => {
    const path = `starterDeck[${index}]`
    const card = cardsById.get(entry.cardId)
    if (!card) {
      report(`${path}.cardId`, 'unknownCard')
      valid = false
    } else if (card.type !== 'attribute') {
      report(`${path}.cardId`, 'notAnAttributeCard')
      valid = false
    } else {
      build.push({ card, copies: entry.copies })
      if (
        card.attributeKind !== 'basic' &&
        entry.copies > GAME_CONFIG_DEFAULTS.maxCopiesPerCard
      ) {
        overLimit.push(path)
      }
    }
    if (!isIntegerBetween(entry.copies, 1, Infinity)) {
      report(`${path}.copies`, 'outOfRange')
      valid = false
    }
  })

  // Tamanho e trava só fazem sentido com todas as entradas válidas e só valem
  // para a classe publicada (D-57b).
  if (!valid || !published) return

  // README 4.3 (REQ-61): o limite de cópias de sinérgica e aprimorada.
  for (const path of overLimit) report(path + '.copies', 'starterDeckCopyLimit')

  const total = deck.reduce((sum, entry) => sum + entry.copies, 0)
  if (total !== GAME_CONFIG_DEFAULTS.minDeckSize) {
    report('starterDeck', 'starterDeckSize')
  }
  // A trava depende das essenciais: com elas inválidas, o problema já está lá.
  if (
    essentialsValid &&
    !isClassActive({
      build,
      essentialAttributes: definition.essentialAttributes,
      lockOneEssential: GAME_CONFIG_DEFAULTS.lockOneEssential,
      lockTwoEssentials: GAME_CONFIG_DEFAULTS.lockTwoEssentials,
    })
  ) {
    report('starterDeck', 'starterDeckLockNotMet')
  }
}

/** README 3.4 */
function checkZone(card: TZoneCard, report: TReport): void {
  const isUrban = card.zoneType === 'urban'

  if (!isIntegerBetween(card.connectionArrows, 1, 4)) {
    report('connectionArrows', 'outOfRange')
  } else {
    if (isUrban && card.connectionArrows !== 4) {
      report('connectionArrows', 'urbanZoneRequiresFourArrows')
    }
    // D-37: só conferida com as setas na faixa (`outOfRange` tem precedência).
    if (card.connectionArrows === 2 && card.arrowLayout === null) {
      report('arrowLayout', 'arrowLayoutRequired')
    } else if (card.connectionArrows !== 2 && card.arrowLayout !== null) {
      report('arrowLayout', 'arrowLayoutNotAllowed')
    }
  }

  const required = isUrban
    ? (['startEvent', 'useVault', 'saveRespawnPoint'] as const)
    : (['startEvent'] as const)
  for (const action of required) {
    if (!card.zoneActions.includes(action)) {
      report(`zoneActions.${action}`, 'missingRequiredAction')
    }
  }

  if (!isUrban && card.zoneActions.includes('saveRespawnPoint')) {
    report('zoneActions.saveRespawnPoint', 'actionOnlyInUrbanZone')
  }
}

/** README 4.3 */
function checkAttribute(card: TAttributeCard, report: TReport): void {
  // Um motivo por tipo, para o texto pt-BR dizer a regra certa (D-49).
  const count = card.attributes.length
  switch (card.attributeKind) {
    case 'basic':
      if (count !== 1) report('attributes', 'basicAttributeCount')
      break
    case 'enhanced':
      if (count !== 1) report('attributes', 'enhancedAttributeCount')
      break
    case 'synergy':
      if (count < 2 || count > 4) report('attributes', 'synergyAttributeCount')
      break
    default: {
      const _exhaustive: never = card.attributeKind
      void _exhaustive
    }
  }

  checkNoDuplicates(card.attributes, 'attributes', report)

  if (card.attributeKind === 'enhanced') {
    if (card.effects.length === 0) report('effects', 'effectsRequired')
  } else if (card.effects.length > 0) {
    report('effects', 'effectsNotAllowed')
  }
}

/** README 5.1 */
function checkEquipment(card: TEquipmentCard, report: TReport): void {
  checkAbilities(card.abilities, 'abilities', report)
  if (card.blocksShield && card.slot !== 'weapon') {
    report('blocksShield', 'onlyForWeapons')
  }

  if (!(card.priceMultiplier >= 0.8 && card.priceMultiplier <= 1.5)) {
    report('priceMultiplier', 'outOfRange')
  }

  if (card.refinement) {
    if (!isIntegerBetween(card.refinement.maxLevel, 1, 10)) {
      report('refinement.maxLevel', 'outOfRange')
    }
    if (card.refinement.materials.text.trim() === '') {
      report('refinement.materials', 'empty')
    }
  }

  checkNoDuplicates(card.tags, 'tags', report)
  checkKebab(card.scavengeTool, 'scavengeTool', report)
}

/** README 12.6, D-86: ferramenta = item `tool` com `toolKind` e zonas. */
function checkTool(card: TItemCard, report: TReport): void {
  if (card.toolKind !== null && card.itemCategory !== 'tool') {
    report('toolKind', 'toolKindOnlyForTools')
  }
  checkKebab(card.toolKind, 'toolKind', report)
  if (card.toolKind === null && card.scavengeZoneTypes.length > 0) {
    report('scavengeZoneTypes', 'scavengeZoneTypesNotAllowed')
  } else if (card.toolKind !== null && card.scavengeZoneTypes.length === 0) {
    report('scavengeZoneTypes', 'scavengeZoneTypesRequired')
  }
  checkNoDuplicates(card.scavengeZoneTypes, 'scavengeZoneTypes', report)
}

function checkKebab(value: string | null, field: string, report: TReport) {
  if (value !== null && !SLUG.test(value)) report(field, 'notKebabCase')
}

/** README 3.4, D-74 (REQ-82). As cartas citadas são procuradas em `cardsById`. */
function checkZoneDecks(
  decks: TDimensionCard['rewardDecks'],
  field: 'rewardDecks' | 'eventDecks',
  cardsById: ReadonlyMap<string, TCard>,
  report: TReport
): void {
  const zoneTypes = new Set<string>()
  decks.forEach((deck, index) => {
    const path = `${field}[${index}]`
    if (zoneTypes.has(deck.zoneType))
      report(`${path}.zoneType`, 'duplicateValue')
    zoneTypes.add(deck.zoneType)
    if (deck.cards.length === 0) report(`${path}.cards`, 'empty')
    checkNoDuplicates(
      deck.cards.map((entry) => entry.cardId),
      `${path}.cards`,
      report
    )
    deck.cards.forEach((entry, cardIndex) => {
      const entryPath = `${path}.cards[${cardIndex}]`
      const cited = cardsById.get(entry.cardId)
      if (!cited) {
        report(`${entryPath}.cardId`, 'unknownCard')
      } else if (field === 'rewardDecks' && !isRewardCard(cited)) {
        report(`${entryPath}.cardId`, 'notARewardCard')
      } else if (
        field === 'eventDecks' &&
        cited.type !== 'randomEvent' &&
        cited.type !== 'combatEvent'
      ) {
        report(`${entryPath}.cardId`, 'notAnEventCard')
      } else if (
        field === 'eventDecks' &&
        cited.type === 'randomEvent' &&
        cited.escapeThreshold === undefined
      ) {
        report(`${entryPath}.cardId`, 'randomEventNotExecutable')
      }
      if (!isIntegerBetween(entry.copies, 1, Infinity)) {
        report(`${entryPath}.copies`, 'outOfRange')
      }
    })
  })
}

export function isEventDeckCard(card: TCard): boolean {
  return (
    card.type === 'combatEvent' ||
    (card.type === 'randomEvent' && card.escapeThreshold !== undefined)
  )
}

export function isExecutableCombatEvent(
  card: TCard | undefined
): card is TCombatEventCard {
  return (
    card?.type === 'combatEvent' && combatExecutionFields(card).length === 0
  )
}

export function combatExecutionFields(
  card: TCombatEventCard | TQuestCombat
): string[] {
  const fields = new Set<string>()
  checkCombatEvent(card, (field) =>
    fields.add(field.replace(/\[(\d+)\]/g, '.$1'))
  )
  for (const field of ['goodOutcome', 'badOutcome'] as const) {
    const outcome = card[field]
    if (outcome.steps === undefined) {
      fields.add(field)
      continue
    }
    outcome.steps.forEach((step, index) => {
      if (step.type === 'effect') {
        checkEventOutcomeEffect(
          step.effect,
          `${field}.steps.${index}.effect`,
          (path) => fields.add(path.replace(/\[(\d+)\]/g, '.$1'))
        )
      }
    })
  }
  card.enemies.forEach(({ abilities }, index) => {
    abilities.forEach((ability, abilityIndex) => {
      const path = `enemies.${index}.abilities.${abilityIndex}`
      if (!ability.id) fields.add(`${path}.id`)
      else {
        if (ability.timing === 'outsideCombat') fields.add(`${path}.timing`)
        checkEnemyAbilityExecution(ability, path, (field) => fields.add(field))
      }
    })
  })
  return [...fields]
}

function checkRandomEvent(
  card: TRandomEventCard,
  cardsById: ReadonlyMap<string, TCard>,
  report: TReport
): void {
  if (card.requirements.length === 0) report('requirements', 'empty')
  const executable = card.escapeThreshold !== undefined
  const ids = new Set<string>()
  card.requirements.forEach((requirement, index) => {
    const path = `requirements[${index}]`
    if (!('kind' in requirement)) {
      if (executable) report(path, 'randomEventNotExecutable')
      return
    }
    if (!executable) report('escapeThreshold', 'randomEventNotExecutable')
    if (requirement.id.trim() === '') report(`${path}.id`, 'empty')
    if (requirement.text.trim() === '') report(`${path}.text`, 'empty')
    if (ids.has(requirement.id)) report(`${path}.id`, 'duplicateValue')
    ids.add(requirement.id)
    if (
      requirement.kind === 'attributes' &&
      requirement.any +
        Object.values(requirement.specific).reduce(
          (sum, count) => sum + count,
          0
        ) ===
        0
    ) {
      report(path, 'empty')
    }
    if (requirement.kind !== 'attributes' && requirement.kind !== 'minimum') {
      checkEventCost(requirement, path, report)
    }
  })
  for (const field of ['goodOutcome', 'badOutcome'] as const) {
    const outcome = card[field]
    if (!('steps' in outcome)) {
      if (executable) report(field, 'randomEventNotExecutable')
      continue
    }
    if (!executable) report('escapeThreshold', 'randomEventNotExecutable')
    outcome.steps.forEach((step, index) => {
      if (step.type === 'effect') {
        checkEventOutcomeEffect(
          step.effect,
          `${field}.steps[${index}].effect`,
          report
        )
      }
      if (step.type !== 'grantReward' && step.type !== 'searchReward') return
      const cited = cardsById.get(step.cardId)
      const path = `${field}.steps[${index}].cardId`
      if (!cited) report(path, 'unknownCard')
      else if (!isRewardCard(cited)) report(path, 'notARewardCard')
    })
  }
}

export function checkQuestReferences(
  card: TZoneCard | TZoneQuestCard,
  cardsById: ReadonlyMap<string, TCard>,
  report: TReport
): void {
  if (card.type === 'zone') {
    const deck = card.questDeck ?? []
    deck.forEach((id, index) => {
      const quest = cardsById.get(id)
      if (
        quest?.type !== 'zoneQuest' ||
        quest.collectionId !== card.collectionId
      ) {
        report(`questDeck.${index}`, 'questCardInvalid')
      }
    })
    return
  }

  const zones = [...cardsById.values()].filter(
    (entry): entry is TZoneCard =>
      entry.type === 'zone' && entry.collectionId === card.collectionId
  )
  card.stages.forEach((stage, index) => {
    const path = `stages.${index}`
    const location = stage.location
    if (
      location.type === 'zoneTitle' &&
      !zones.some((zone) => zone.title === location.title)
    ) {
      report(`${path}.location.title`, 'questZoneTitleMissing')
    }
    if (
      location.type === 'zoneType' &&
      !zones.some((zone) => zone.zoneType === location.zoneType)
    ) {
      report(`${path}.location.zoneType`, 'questZoneTypeMissing')
    }
    if (stage.type === 'randomEvent') {
      const event = cardsById.get(stage.eventCardId)
      if (!isQuestRandomEvent(event, card.collectionId, cardsById)) {
        report(`${path}.eventCardId`, 'questEventInvalid')
      }
    }
    if (stage.type === 'combatEvent') {
      checkQuestRewardReferences(
        stage.combat.goodOutcome.steps,
        `${path}.combat.goodOutcome.steps`,
        card.collectionId,
        cardsById,
        report
      )
      checkQuestRewardReferences(
        stage.combat.badOutcome.steps,
        `${path}.combat.badOutcome.steps`,
        card.collectionId,
        cardsById,
        report
      )
    }
  })
  checkQuestRewardReferences(
    card.rewards,
    'rewards',
    card.collectionId,
    cardsById,
    report
  )
}

function isQuestRandomEvent(
  card: TCard | undefined,
  collectionId: string,
  cardsById: ReadonlyMap<string, TCard>
): boolean {
  if (
    card?.type !== 'randomEvent' ||
    card.collectionId !== collectionId ||
    card.escapeThreshold === undefined
  ) {
    return false
  }
  let valid = true
  checkRandomEvent(card, cardsById, () => {
    valid = false
  })
  return valid
}

function checkQuestRewardReferences(
  steps: readonly TRandomEventOutcomeStep[],
  path: string,
  collectionId: string,
  cardsById: ReadonlyMap<string, TCard>,
  report: TReport
): void {
  steps.forEach((step, index) => {
    if (step.type !== 'searchReward' && step.type !== 'grantReward') return
    const reward = cardsById.get(step.cardId)
    if (!reward || reward.collectionId !== collectionId)
      report(`${path}.${index}.cardId`, 'unknownCard')
    else if (!isRewardCard(reward))
      report(`${path}.${index}.cardId`, 'notARewardCard')
  })
}

export function questReferenceIds(card: TZoneQuestCard): string[] {
  const rewards = [...card.rewards]
  const references = new Set<string>()
  for (const stage of card.stages) {
    if (stage.type === 'randomEvent') references.add(stage.eventCardId)
    if (stage.type === 'combatEvent') {
      rewards.push(
        ...stage.combat.goodOutcome.steps,
        ...stage.combat.badOutcome.steps
      )
    }
  }
  for (const step of rewards) {
    if (step.type === 'searchReward' || step.type === 'grantReward')
      references.add(step.cardId)
  }
  return [...references]
}

function checkQuestDeck(
  card: TZoneCard,
  cardsById: ReadonlyMap<string, TCard>,
  report: TReport
): void {
  const seen = new Set<string>()
  const deck = card.questDeck ?? []
  deck.forEach((id, index) => {
    if (seen.has(id)) report(`questDeck.${index}`, 'duplicateValue')
    seen.add(id)
  })
  checkQuestReferences(card, cardsById, report)
}

function checkZoneQuest(
  card: TZoneQuestCard,
  cardsById: ReadonlyMap<string, TCard>,
  report: TReport
): void {
  checkQuestReferences(card, cardsById, report)
  if (!card.stages.length) report('stages', 'empty')
  card.stages.forEach((stage, index) => {
    if (stage.type !== 'combatEvent') return
    for (const field of combatExecutionFields(stage.combat)) {
      report(`stages.${index}.combat.${field}`, 'combatEventNotExecutable')
    }
  })
  card.rewards.forEach((step, index) => {
    if (step.type !== 'effect') return
    const path = `rewards.${index}.effect`
    checkEventOutcomeEffect(step.effect, path, report)
    if (
      step.effect.duration.kind !== 'immediate' ||
      step.effect.activation.some(
        ({ kind }) => kind !== 'gainGold' && kind !== 'gainPeak'
      )
    ) {
      report(path, 'questRewardEffectInvalid')
    }
  })
}

/** Tipos que entram em deck de recompensas (REQ-82). */
export function isRewardCard(card: TCard): boolean {
  return (
    card.type === 'attribute' ||
    card.type === 'equipment' ||
    card.type === 'item'
  )
}

/** README 14.1, 18.1 */
function checkCombatEvent(
  card: TCombatEventCard | TQuestCombat,
  report: TReport
): void {
  if (card.enemies.length === 0) report('enemies', 'empty')

  card.enemies.forEach((enemy, index) => {
    const path = `enemies[${index}]`
    checkAbilities(enemy.abilities, `${path}.abilities`, report)
    enemy.abilities.forEach((ability, abilityIndex) => {
      if (ability.id !== undefined && ability.classRestriction.length > 0) {
        report(
          `${path}.abilities[${abilityIndex}].classRestriction`,
          'invalidAbility'
        )
      }
    })
    enemy.combatRules?.preferredAbilityIds?.forEach((id, preferredIndex) => {
      if (!enemy.abilities.some((ability) => ability.id === id)) {
        report(
          `${path}.combatRules.preferredAbilityIds[${preferredIndex}]`,
          'unknownAbility'
        )
      }
    })

    if (!isIntegerBetween(enemy.count, 1, Infinity)) {
      report(`${path}.count`, 'outOfRange')
    }
    if (enemy.enemyTypes.length === 0) {
      report(`${path}.enemyTypes`, 'empty')
    }
    checkNoDuplicates(enemy.enemyTypes, `${path}.enemyTypes`, report)
    if (!isIntegerBetween(enemy.health, 1, Infinity)) {
      report(`${path}.health`, 'outOfRange')
    }
    for (const modifier of MODIFIERS) {
      if (!isIntegerBetween(enemy.modifiers[modifier], 0, Infinity)) {
        report(`${path}.modifiers.${modifier}`, 'outOfRange')
      }
    }
    if (enemy.vigor !== null && !isIntegerBetween(enemy.vigor, 0, Infinity)) {
      report(`${path}.vigor`, 'outOfRange')
    }
  })
}

function checkAbilities(
  abilities: readonly TAbility[],
  path: string,
  report: TReport
): void {
  const ids = new Set<string>()
  abilities.forEach((ability, index) => {
    if (ability.id === undefined) return
    const field = `${path}[${index}]`
    if (ids.has(ability.id)) report(`${field}.id`, 'duplicateValue')
    ids.add(ability.id)
    if ((ability.form === 'channeled') !== (ability.channel !== null)) {
      report(`${field}.channel`, 'invalidAbility')
    }
    if (ability.form === 'continuous' && ability.duration === null) {
      report(`${field}.duration`, 'invalidAbility')
    }
    if (ability.form === 'passive' && ability.cost.length > 0) {
      report(`${field}.cost`, 'invalidAbility')
    }
    if (
      (ability.form === 'area' || ability.channel?.releaseForm === 'area') &&
      ability.power !== null &&
      ability.target !== 'allOpponents'
    ) {
      report(`${field}.target`, 'invalidAbility')
    }
  })
}

function checkNoDuplicates(
  values: readonly string[],
  field: string,
  report: TReport
): void {
  if (new Set(values).size !== values.length) report(field, 'duplicateValue')
}

function isIntegerBetween(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max
}
