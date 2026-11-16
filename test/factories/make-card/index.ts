import type {
  TAttributeCard,
  TCard,
  TCollection,
  TCombatEventCard,
  TEnemy,
  TEquipmentCard,
  TItemCard,
  TRandomEventCard,
  TZoneCard,
} from '@/domain/catalog/enterprise/value-objects/card'

// Cartas válidas por padrão (REQ-15); cada teste muda só o que exercita.

export function makeCollection(
  override: Partial<TCollection> = {}
): TCollection {
  return { id: 'fixture', name: 'Coleção de Teste', ...override }
}

export function makeZoneCard(override: Partial<TZoneCard> = {}): TZoneCard {
  return {
    type: 'zone',
    id: 'fixture.whispering-grove',
    collectionId: 'fixture',
    title: 'Bosque dos Sussurros',
    zoneType: 'forest',
    location: 'Bosque',
    connectionArrows: 2,
    zoneActions: ['startEvent', 'scavenge'],
    effects: [],
    ...override,
  }
}

export function makeUrbanZoneCard(
  override: Partial<TZoneCard> = {}
): TZoneCard {
  return makeZoneCard({
    id: 'fixture.gray-harbor',
    title: 'Porto Cinzento',
    zoneType: 'urban',
    location: 'Cidade',
    connectionArrows: 4,
    zoneActions: [
      'startEvent',
      'useVault',
      'saveRespawnPoint',
      'trainWithMentor',
    ],
    ...override,
  })
}

export function makeAttributeCard(
  override: Partial<TAttributeCard> = {}
): TAttributeCard {
  return {
    type: 'attribute',
    id: 'fixture.strength-basic',
    collectionId: 'fixture',
    name: 'Força',
    flavorText: null,
    rarity: 'common',
    attributeKind: 'basic',
    attributes: ['strength'],
    effects: [],
    ...override,
  }
}

export function makeEquipmentCard(
  override: Partial<TEquipmentCard> = {}
): TEquipmentCard {
  return {
    type: 'equipment',
    id: 'fixture.blade-of-dusk',
    collectionId: 'fixture',
    name: 'Lâmina do Crepúsculo',
    flavorText: null,
    rarity: 'rare',
    slot: 'weapon',
    tags: ['Espada'],
    modifiers: [{ modifier: 'attack', value: 12 }],
    peakRequirement: null,
    classRestriction: [],
    blocksShield: false,
    abilities: [],
    effects: [],
    refinement: { maxLevel: 10, materials: { text: '1 minério de ferro' } },
    enchantment: null,
    priceMultiplier: 1.2,
    ...override,
  }
}

export function makeItemCard(override: Partial<TItemCard> = {}): TItemCard {
  return {
    type: 'item',
    id: 'fixture.healing-potion',
    collectionId: 'fixture',
    name: 'Poção de Cura',
    flavorText: null,
    rarity: 'common',
    itemCategory: 'consumable',
    tags: ['Poção'],
    effects: [{ text: 'Recupere 10 de vida.' }],
    ...override,
  }
}

export function makeRandomEventCard(
  override: Partial<TRandomEventCard> = {}
): TRandomEventCard {
  return {
    type: 'randomEvent',
    id: 'fixture.wounded-traveler',
    collectionId: 'fixture',
    title: 'Viajante Ferido',
    flavorText: null,
    requirements: [{ text: '2 Sabedoria' }],
    goodOutcome: { text: 'Ganhe 10 de ouro.' },
    badOutcome: { text: 'Perca 2 de vida.' },
    noEscape: false,
    ...override,
  }
}

export function makeEnemy(override: Partial<TEnemy> = {}): TEnemy {
  return {
    name: 'Lobo Cinzento',
    flavorText: null,
    count: 2,
    enemyTypes: ['beast'],
    creature: 'Lobo',
    enemyCategory: 'common',
    element: null,
    health: 8,
    modifiers: {
      attack: 4,
      defense: 2,
      accuracy: 3,
      evasion: 2,
      celerity: 5,
      piercing: 0,
      reflection: 0,
    },
    vigor: null,
    abilities: [],
    behavior: 'aggressive',
    ...override,
  }
}

export function makeCombatEventCard(
  override: Partial<TCombatEventCard> = {}
): TCombatEventCard {
  return {
    type: 'combatEvent',
    id: 'fixture.howling-wolves',
    collectionId: 'fixture',
    title: 'Lobos Uivantes',
    flavorText: null,
    enemies: [makeEnemy()],
    goodOutcome: { text: 'Compre 1 recompensa da zona.' },
    badOutcome: { text: 'Perca 5 de ouro.' },
    noEscape: false,
    ...override,
  }
}

/** O `Card` como corpo de `CardInput`: sem `id` e `collectionId`, com `slug`. */
export function toCardInput(
  card: TCard,
  slug?: string
): Record<string, unknown> {
  const { id, collectionId, ...rest } = card
  return { ...rest, slug: slug ?? id.slice(collectionId.length + 1) }
}
