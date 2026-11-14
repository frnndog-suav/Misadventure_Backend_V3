import {
  MODIFIERS,
  type TAttributeCard,
  type TCard,
  type TCollection,
  type TCombatEventCard,
  type TEquipmentCard,
  type TZoneCard,
} from '@/domain/catalog/enterprise/value-objects/card'

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
  | 'wrongAttributeCount'
  | 'duplicateValue'
  | 'effectsNotAllowed'
  | 'effectsRequired'
  | 'onlyForWeapons'
  | 'empty'

export type TCatalogIssue = {
  collectionId: string
  cardId: string | null
  /** Caminho do campo na carta, ex.: `enemies[0].health`. */
  field: string
  reason: TCatalogIssueReason
}

export type TCatalogContent = {
  collections: readonly TCollection[]
  cards: readonly TCard[]
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
        break
      }
      case 'attribute':
        checkAttribute(card, report)
        break
      case 'equipment':
        checkEquipment(card, report)
        break
      case 'item':
        checkNoDuplicates(card.tags, 'tags', report)
        break
      case 'randomEvent':
        if (card.requirements.length === 0) report('requirements', 'empty')
        break
      case 'combatEvent':
        checkCombatEvent(card, report)
        break
      default: {
        const _exhaustive: never = card
        void _exhaustive
      }
    }
  }

  return issues
}

/** README 3.4 */
function checkZone(card: TZoneCard, report: TReport): void {
  const isUrban = card.zoneType === 'urban'

  if (!isIntegerBetween(card.connectionArrows, 1, 4)) {
    report('connectionArrows', 'outOfRange')
  } else if (isUrban && card.connectionArrows !== 4) {
    report('connectionArrows', 'urbanZoneRequiresFourArrows')
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
  const count = card.attributes.length
  const countOk =
    card.attributeKind === 'synergy' ? count >= 2 && count <= 4 : count === 1
  if (!countOk) report('attributes', 'wrongAttributeCount')

  checkNoDuplicates(card.attributes, 'attributes', report)

  if (card.attributeKind === 'enhanced') {
    if (card.effects.length === 0) report('effects', 'effectsRequired')
  } else if (card.effects.length > 0) {
    report('effects', 'effectsNotAllowed')
  }
}

/** README 5.1 */
function checkEquipment(card: TEquipmentCard, report: TReport): void {
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
}

/** README 14.1, 18.1 */
function checkCombatEvent(card: TCombatEventCard, report: TReport): void {
  if (card.enemies.length === 0) report('enemies', 'empty')

  card.enemies.forEach((enemy, index) => {
    const path = `enemies[${index}]`

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
