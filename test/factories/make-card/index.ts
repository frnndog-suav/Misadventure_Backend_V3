import type {
  TAttributeCard,
  TCard,
  TClassDefinition,
  TCollection,
  TCombatEventCard,
  TDimensionCard,
  TEnemy,
  TEquipmentCard,
  TItemCard,
  TMountCard,
  TRandomEventCard,
  TZoneCard,
} from '@/domain/catalog/enterprise/value-objects/card'
import type {
  TEffect,
  TZoneEffect,
} from '@/domain/catalog/enterprise/value-objects/effect'

// Cartas válidas por padrão (REQ-15); cada teste muda só o que exercita.

/** Efeito imediato de item consumível (Poção de Cura): válido por padrão (REQ-98). */
export function makeEffect(override: Partial<TEffect> = {}): TEffect {
  return {
    text: 'Recupere 10 de vida.',
    trigger: null,
    cost: [{ kind: 'consumeSelf' }],
    activation: [{ kind: 'heal', amount: 10 }],
    duration: { kind: 'immediate' },
    mark: null,
    ...override,
  }
}

/** Efeito de zona ou dimensão (README 13.6: `polarity` no lugar de `mark`). */
export function makeZoneEffect(
  override: Partial<TZoneEffect> = {}
): TZoneEffect {
  return {
    text: 'Perca 1 de vida.',
    trigger: { kind: 'onEnterThisZone' },
    cost: [],
    activation: [{ kind: 'loseLife', amount: 1 }],
    duration: { kind: 'immediate' },
    polarity: 'negative',
    ...override,
  }
}

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
    arrowLayout: 'straight',
    zoneActions: ['startEvent', 'scavenge'],
    effects: [],
    market: null,
    blacksmith: null,
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
    arrowLayout: null,
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
    priceMultiplier: 1,
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
    refinement: null,
    enchantment: null,
    priceMultiplier: 1.2,
    scavengeTool: null,
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
    effects: [makeEffect()],
    toolKind: null,
    scavengeZoneTypes: [],
    scavengeTool: null,
    priceMultiplier: 1,
    stockPrice: null,
    stockQuantity: 1,
    boosterCollectionId: null,
    recipe: null,
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

export function makeDimensionCard(
  override: Partial<TDimensionCard> = {}
): TDimensionCard {
  return {
    type: 'dimension',
    id: 'fixture.misty-realm',
    collectionId: 'fixture',
    name: 'Reino Enevoado',
    flavorText: null,
    releaseOrder: 1,
    arrivalZoneTitle: 'Porto Cinzento',
    effects: [],
    rewardDecks: [],
    ...override,
  }
}

/** Montaria sem efeitos (Cavalo de Arado da fixture, REQ-155). */
export function makeMountCard(override: Partial<TMountCard> = {}): TMountCard {
  return {
    type: 'mount',
    id: 'fixture.plow-horse',
    collectionId: 'fixture',
    name: 'Cavalo de Arado',
    flavorText: null,
    rarity: 'rare',
    mountTypes: ['beast'],
    creature: 'Cavalo',
    effects: [],
    abilities: [],
    ...override,
  }
}

/**
 * Classe válida pelos padrões (REQ-26): 1 essencial (força) e deck de 60 =
 * 18 de `fixture.strength-basic` + 42 de `fixture.dexterity-basic`.
 */
export function makeClassDefinition(
  override: Partial<TClassDefinition> = {}
): TClassDefinition {
  return {
    playerClass: 'warrior',
    collectionId: 'fixture',
    name: 'Guerreiro',
    essentialAttributes: ['strength'],
    baseModifiers: {
      attack: 6,
      defense: 4,
      accuracy: 50,
      evasion: 15,
      celerity: 8,
      piercing: 0,
      reflection: 0,
    },
    starterDeck: [
      { cardId: 'fixture.strength-basic', copies: 18 },
      { cardId: 'fixture.dexterity-basic', copies: 42 },
    ],
    ...override,
  }
}

/**
 * O conteúdo da `fixture` de CONTRATO FEAT-06, só publicado: 4 zonas
 * (Porto Cinzento em `urban` com 4 setas, `straight`, `corner`, 1 seta),
 * `fixture.test-dimension` e as classes `warrior` (30 + 30) e `rogue`.
 */
export function makeFixtureContent(): {
  collections: TCollection[]
  cards: TCard[]
  classes: TClassDefinition[]
} {
  return {
    collections: [makeCollection()],
    cards: [
      makeUrbanZoneCard(),
      makeZoneCard(),
      makeZoneCard({
        id: 'fixture.stone-bend',
        title: 'Curva de Pedra',
        arrowLayout: 'corner',
      }),
      makeZoneCard({
        id: 'fixture.old-mine',
        title: 'Mina Velha',
        connectionArrows: 1,
        arrowLayout: null,
      }),
      makeDimensionCard({
        id: 'fixture.test-dimension',
        name: 'Dimensão de Teste',
      }),
      makeAttributeCard(),
      makeAttributeCard({
        id: 'fixture.endurance-basic',
        name: 'Resistência',
        attributes: ['endurance'],
      }),
      makeAttributeCard({
        id: 'fixture.dexterity-basic',
        name: 'Destreza',
        attributes: ['dexterity'],
      }),
    ],
    classes: [
      makeClassDefinition({
        essentialAttributes: ['strength', 'endurance'],
        baseModifiers: {
          attack: 6,
          defense: 5,
          accuracy: 45,
          evasion: 15,
          celerity: 8,
          piercing: 0,
          reflection: 0,
        },
        starterDeck: [
          { cardId: 'fixture.endurance-basic', copies: 30 },
          { cardId: 'fixture.strength-basic', copies: 30 },
        ],
      }),
      makeClassDefinition({
        playerClass: 'rogue',
        name: 'Ladino',
        essentialAttributes: ['dexterity'],
        baseModifiers: {
          attack: 5,
          defense: 2,
          accuracy: 46,
          evasion: 22,
          celerity: 12,
          piercing: 0,
          reflection: 0,
        },
        starterDeck: [
          { cardId: 'fixture.dexterity-basic', copies: 40 },
          { cardId: 'fixture.strength-basic', copies: 20 },
        ],
      }),
    ],
  }
}

/** A classe como corpo de `ClassInput`: sem `collectionId`. */
export function toClassInput(
  definition: TClassDefinition
): Record<string, unknown> {
  const { collectionId, ...rest } = definition
  void collectionId
  return { ...rest }
}
