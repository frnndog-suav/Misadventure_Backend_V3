import type { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { type Either, left, right } from '@/core/error/either'
import { AggregateRoot } from '@/core/pattern/aggregate-root'
import type { IdGenerator } from '@/core/ports/id-generator'
import { type RngState, SeededRng } from '@/core/rng/seeded-rng'
import { isClassActive } from '@/domain/catalog/enterprise/class-lock'
import { checkDimensionComposition } from '@/domain/catalog/enterprise/dimension-composition'
import type {
  TAttributeCard,
  TClassDefinition,
  TDimensionCard,
  TStarterDeckEntry,
  TZoneCard,
} from '@/domain/catalog/enterprise/value-objects/card'
import type { TGameConfigValues } from '@/domain/lab/enterprise/value-objects/game-config/defaults'

import { connectedZones } from '../../connected-zones'
import type { TPartyEvent } from '../../events/party-events'
import { assembleMap, type TPartyMap } from '../../map-assembly'
import type { TRecoverOption } from '../../party-action'
import type { TPartyTurn } from '../../party-turn'
import { shuffle } from '../../shuffle'
import {
  createStartingPlayer,
  defaultModifiers,
  sortedByCardId,
} from '../../starting-player'
import { rollTurnOrder } from '../../turn-order'
import { maxHealthOf, PartyMember, type TPlayerState } from '../party-member'

/** Limites de CONTRATO FEAT-05 (`CreatePartyRequest`, D-30). */
export const PARTY_NAME_MAX_LENGTH = 40
export const CHARACTER_NAME_MAX_LENGTH = 24

/** Máquina de estados do save (D-27); `frozen` entra na FEAT-19. */
export type TPartyStatus = 'idle' | 'inSession'

/** Motivos de CONTRATO FEAT-05/FEAT-06 (`PartyInvalidDetails`). */
export type TPartyIssue =
  | { field: null; reason: 'invalidBody' }
  | {
      field: 'name' | 'characterName'
      reason: 'required' | 'notString' | 'blank' | 'tooLong'
    }
  | { field: 'playerClass'; reason: 'required' | 'notString' | 'unknownClass' }
  | { field: 'members'; reason: 'belowMinPlayers' }

/** Por que a criação falhou: dados do pedido (REQ-17, REQ-35) ou conteúdo (REQ-36). */
export type TCreatePartyFailure =
  | { type: 'invalid'; issues: TPartyIssue[] }
  | {
      type: 'dimensionInvalid'
      dimensionCardId: string | null
      problems: string[]
    }

/** Por que o Ajustar deck foi recusado (REQ-66; D-71). */
export type TAdjustDeckRefusal =
  | 'sessionNotActive'
  | 'noActionPoints'
  | { reason: 'notOwned' | 'copyLimitExceeded'; cardId: string }
  | 'buildBelowMinimum'
  | 'tcgFolderFull'

/** Dimensão do grupo (D-42; CONTRATO `PartyDimension`). */
export type TPartyDimension = Readonly<{
  dimensionCardId: string
  startingCityZoneId: string
  map: TPartyMap
}>

export interface TPartyProps {
  name: string
  members: PartyMember[]
  hostMemberId: UniqueEntityID
  status: TPartyStatus
  /** Cópia da `GameConfig` na criação (D-11, REQ-23). */
  config: TGameConfigValues
  rngState: RngState
  dimension: TPartyDimension
  /** Ids de membro, do 1º ao último (REQ-33). */
  turnOrder: UniqueEntityID[]
  /** De quem é a vez (D-63, REQ-55). */
  turn: TPartyTurn
  createdAt: Date
  savedAt: Date
}

export interface TCreatePartyInput {
  /** Ainda não validados (REQ-17, REQ-35). */
  name: unknown
  characterName: unknown
  playerClass: unknown
  /** A classe publicada de `playerClass` (ou `null` se não houver). */
  classDefinition: TClassDefinition | null
  /** Cartas de atributo do `starterDeck` da classe. */
  attributeCards: readonly TAttributeCard[]
  /** A Carta de Dimensão publicada de menor `releaseOrder` (ou `null`). */
  dimension: TDimensionCard | null
  /** Zonas publicadas da coleção da dimensão. */
  zones: readonly TZoneCard[]
  config: TGameConfigValues
  rngState: RngState
  now: Date
}

/** Texto do limite de tentativas do gerador (D-44). */
export const mapAttemptsProblem = (attempts: number): string =>
  `O gerador não montou o mapa dentro do limite de tentativas (mapMaxAttempts = ${attempts}).`

/** O grupo é o save (README 28.1, D-27). */
export class Party extends AggregateRoot<TPartyProps, TPartyEvent> {
  get name(): string {
    return this.props.name
  }

  get members(): readonly PartyMember[] {
    return [...this.props.members]
  }

  get hostMemberId(): UniqueEntityID {
    return this.props.hostMemberId
  }

  get status(): TPartyStatus {
    return this.props.status
  }

  get config(): TGameConfigValues {
    return { ...this.props.config }
  }

  get rngState(): RngState {
    return this.props.rngState
  }

  get dimension(): TPartyDimension {
    return this.props.dimension
  }

  get turnOrder(): readonly UniqueEntityID[] {
    return [...this.props.turnOrder]
  }

  get turn(): TPartyTurn {
    return { ...this.props.turn }
  }

  get createdAt(): Date {
    return this.props.createdAt
  }

  get savedAt(): Date {
    return this.props.savedAt
  }

  /**
   * Conteúdo que este save usa (REQ-39): a Carta de Dimensão, as zonas do
   * mapa, as cartas da build de cada jogador e as classes deles.
   */
  contentInUse(): { cardIds: string[]; playerClasses: string[] } {
    const cardIds = new Set<string>([
      this.props.dimension.dimensionCardId,
      ...this.props.dimension.map.zones.map((zone) => zone.zoneId),
    ])
    const playerClasses = new Set<string>()
    for (const member of this.props.members) {
      for (const entry of member.player.build) cardIds.add(entry.cardId)
      for (const { playerClass } of member.player.playerClasses) {
        playerClasses.add(playerClass)
      }
    }
    return { cardIds: [...cardIds], playerClasses: [...playerClasses] }
  }

  isHost(member: PartyMember): boolean {
    return member.id.equals(this.props.hostMemberId)
  }

  /**
   * Grupo de 1 com o host, já preparado (README 10.1; REQ-16, REQ-17, REQ-31
   * a REQ-36). Primeiro os dados do pedido (problemas na ordem `name`,
   * `characterName`, `playerClass`, `members`), depois a dimensão. Os ids só
   * são gerados quando tudo é válido. Sorteios na ordem: mapa, deck de cada
   * membro, ordem dos jogadores.
   */
  static create(
    input: TCreatePartyInput,
    ids: IdGenerator
  ): Either<TCreatePartyFailure, Party> {
    const issues: TPartyIssue[] = []
    const name = checkName('name', input.name, PARTY_NAME_MAX_LENGTH, issues)
    const characterName = checkName(
      'characterName',
      input.characterName,
      CHARACTER_NAME_MAX_LENGTH,
      issues
    )
    const classDefinition = checkPlayerClass(input, issues)
    const memberCount = 1
    if (memberCount < input.config.minPlayers) {
      issues.push({ field: 'members', reason: 'belowMinPlayers' })
    }

    if (
      issues.length > 0 ||
      name === null ||
      characterName === null ||
      classDefinition === null
    ) {
      return left({ type: 'invalid', issues })
    }

    const { dimension, zones } = input
    const problems = checkDimensionComposition({ dimension, zones })
    if (dimension === null || problems.length > 0) {
      return left({
        type: 'dimensionInvalid',
        dimensionCardId: dimension?.id ?? null,
        problems,
      })
    }

    const rng = SeededRng.fromState(input.rngState)
    const assembled = assembleMap({
      zones,
      arrivalZoneTitle: dimension.arrivalZoneTitle,
      rng,
      maxAttempts: input.config.mapMaxAttempts,
    })
    if (assembled.isLeft()) {
      return left({
        type: 'dimensionInvalid',
        dimensionCardId: dimension.id,
        problems: [mapAttemptsProblem(input.config.mapMaxAttempts)],
      })
    }
    const { startingCityZoneId, map } = assembled.value

    const partyId = ids.next()
    const host = PartyMember.create(
      {
        characterName,
        kind: 'human',
        player: createStartingPlayer({
          config: input.config,
          classDefinition,
          attributeCards: input.attributeCards,
          startingCityZoneId,
          rng,
        }),
      },
      ids.next()
    )
    const members = [host]
    const turnOrder = rollTurnOrder(
      members.map((member) => member.id),
      rng
    )

    const party = new Party(
      {
        name,
        members,
        hostMemberId: host.id,
        status: 'idle',
        config: { ...input.config },
        rngState: rng.state(),
        dimension: { dimensionCardId: dimension.id, startingCityZoneId, map },
        turnOrder,
        turn: {
          round: 1,
          memberId: turnOrder[0],
          actionPoints: input.config.actionPointsPerTurn,
        },
        createdAt: input.now,
        savedAt: input.now,
      },
      partyId
    )
    const at = { occurredAt: input.now, aggregateId: partyId }
    party.addDomainEvent({ type: 'PartyCreated', ...at })
    party.addDomainEvent({ type: 'MapAssembled', ...at })
    for (const member of members) {
      party.addDomainEvent({
        type: 'StarterDeckGiven',
        memberId: member.id,
        ...at,
      })
    }
    party.addDomainEvent({ type: 'TurnOrderDecided', ...at })
    party.addDomainEvent({ type: 'PlayersArrived', ...at })
    party.addDomainEvent({
      type: 'TurnStarted',
      memberId: turnOrder[0],
      round: 1,
      ...at,
    })
    return right(party)
  }

  /** Reconstrói um save gravado (repositórios, factories). Não registra eventos. */
  static restore(props: TPartyProps, id: UniqueEntityID): Party {
    return new Party(
      {
        ...props,
        members: [...props.members],
        config: { ...props.config },
        turnOrder: [...props.turnOrder],
      },
      id
    )
  }

  /**
   * Continuar (REQ-20). Já em sessão: nada muda (D-29). Devolve se mudou,
   * para o caso de uso só gravar quando há mudança.
   */
  startSession(at: Date): boolean {
    switch (this.props.status) {
      case 'inSession':
        return false
      case 'idle':
        this.props.status = 'inSession'
        this.props.savedAt = at
        this.addDomainEvent({
          type: 'SessionStarted',
          occurredAt: at,
          aggregateId: this.id,
        })
        return true
      default: {
        const _exhaustive: never = this.props.status
        return _exhaustive
      }
    }
  }

  /** Encerrar sessão (REQ-21). Fora de sessão é rejeitado e nada muda. */
  endSession(at: Date): Either<'sessionNotActive', void> {
    switch (this.props.status) {
      case 'idle':
        return left('sessionNotActive')
      case 'inSession':
        this.props.status = 'idle'
        this.props.savedAt = at
        this.addDomainEvent({
          type: 'SessionEnded',
          occurredAt: at,
          aggregateId: this.id,
        })
        return right(undefined)
      default: {
        const _exhaustive: never = this.props.status
        return _exhaustive
      }
    }
  }

  /**
   * Movimentar (README 12.2; REQ-51 a REQ-53, REQ-56). Quem age é o membro da
   * vez (D-63) e o gasto é 1 ponto de ação. Ordem das recusas: fora de sessão,
   * zona fora do mapa, sem pontos, zona sem travessia (inclusive a própria).
   * Recusado, nada muda. O RNG não é usado.
   */
  move(
    zoneId: string,
    at: Date
  ): Either<
    'sessionNotActive' | 'zoneNotInMap' | 'noActionPoints' | 'notConnected',
    void
  > {
    switch (this.props.status) {
      case 'idle':
        return left('sessionNotActive')
      case 'inSession':
        break
      default: {
        const _exhaustive: never = this.props.status
        return _exhaustive
      }
    }

    const { map } = this.props.dimension
    if (!map.zones.some((zone) => zone.zoneId === zoneId)) {
      return left('zoneNotInMap')
    }

    if (this.props.turn.actionPoints < 1) {
      return left('noActionPoints')
    }

    const index = this.props.members.findIndex((member) =>
      member.id.equals(this.props.turn.memberId)
    )
    const actor = this.props.members[index]
    const fromZoneId = actor.player.zoneId
    if (!connectedZones(map, fromZoneId).includes(zoneId)) {
      return left('notConnected')
    }

    this.props.turn = {
      ...this.props.turn,
      actionPoints: this.props.turn.actionPoints - 1,
    }
    this.props.members = this.props.members.map((member, i) =>
      i === index
        ? PartyMember.create(
            {
              characterName: member.characterName,
              kind: member.kind,
              player: { ...member.player, zoneId },
            },
            member.id
          )
        : member
    )
    this.props.savedAt = at
    this.addDomainEvent({
      type: 'PlayerMoved',
      memberId: actor.id,
      fromZoneId,
      toZoneId: zoneId,
      occurredAt: at,
      aggregateId: this.id,
    })
    return right(undefined)
  }

  /**
   * Encerrar a vez (README 11.1, 2.1; REQ-57). Passa ao membro seguinte de
   * `turnOrder` com os pontos cheios; do último para o primeiro a rodada sobe.
   * Aceito com qualquer quantidade de pontos (K2). O RNG não é usado.
   */
  endTurn(at: Date): Either<'sessionNotActive', void> {
    switch (this.props.status) {
      case 'idle':
        return left('sessionNotActive')
      case 'inSession':
        break
      default: {
        const _exhaustive: never = this.props.status
        return _exhaustive
      }
    }

    const ended = this.props.turn
    const position = this.props.turnOrder.findIndex((id) =>
      id.equals(ended.memberId)
    )
    const nextPosition = (position + 1) % this.props.turnOrder.length
    const round = nextPosition === 0 ? ended.round + 1 : ended.round
    const memberId = this.props.turnOrder[nextPosition]

    this.props.turn = {
      round,
      memberId,
      actionPoints: this.props.config.actionPointsPerTurn,
    }
    this.props.savedAt = at
    const base = { occurredAt: at, aggregateId: this.id }
    this.addDomainEvent({
      type: 'TurnEnded',
      memberId: ended.memberId,
      round: ended.round,
      ...base,
    })
    this.addDomainEvent({ type: 'TurnStarted', memberId, round, ...base })
    return right(undefined)
  }

  /**
   * Recuperar (README 12.2, 12.5, 7.3 item 6; REQ-63). Quem age é o membro da
   * vez (D-63); gasta 1 ponto. Vida e Vigor sobem a porcentagem da config (no
   * mínimo 1) sem passar de `maxHealth` e do Pico. `shuffleHand` e
   * `shuffleDiscard` juntam as cartas ao deck (o deck primeiro) e o embaralham
   * com o RNG; `drawToHand` não usa o RNG. Aceito mesmo sem efeito.
   */
  recover(
    option: TRecoverOption,
    at: Date
  ): Either<'sessionNotActive' | 'noActionPoints', void> {
    switch (this.props.status) {
      case 'idle':
        return left('sessionNotActive')
      case 'inSession':
        break
      default: {
        const _exhaustive: never = this.props.status
        return _exhaustive
      }
    }

    if (this.props.turn.actionPoints < 1) {
      return left('noActionPoints')
    }

    const { config } = this.props
    const index = this.actorIndex()
    const actor = this.props.members[index]
    const { player } = actor

    const maxHealth = maxHealthOf(player)
    const health = Math.min(
      maxHealth,
      player.health +
        Math.max(1, Math.floor((maxHealth * config.recoverHealthPercent) / 100))
    )
    const vigor = Math.min(
      player.peak,
      player.vigor +
        Math.max(
          1,
          Math.floor((player.peak * config.recoverVigorPercent) / 100)
        )
    )

    let { deck, hand, discard } = player
    let cardsDrawn = 0
    switch (option) {
      case 'drawToHand': {
        cardsDrawn = Math.min(
          Math.max(0, config.recoverHandSize - hand.length),
          deck.length
        )
        hand = [...hand, ...deck.slice(0, cardsDrawn)]
        deck = deck.slice(cardsDrawn)
        break
      }
      case 'shuffleHand': {
        const rng = SeededRng.fromState(this.props.rngState)
        deck = shuffle([...deck, ...hand], rng)
        hand = []
        this.props.rngState = rng.state()
        break
      }
      case 'shuffleDiscard': {
        const rng = SeededRng.fromState(this.props.rngState)
        deck = shuffle([...deck, ...discard], rng)
        discard = []
        this.props.rngState = rng.state()
        break
      }
      default: {
        const _exhaustive: never = option
        return _exhaustive
      }
    }

    this.spendActionPoint()
    this.replaceActor(index, { ...player, health, vigor, deck, hand, discard })
    this.props.savedAt = at
    this.addDomainEvent({
      type: 'PlayerRecovered',
      memberId: actor.id,
      option,
      healthRestored: health - player.health,
      vigorRestored: vigor - player.vigor,
      cardsDrawn,
      occurredAt: at,
      aggregateId: this.id,
    })
    return right(undefined)
  }

  /**
   * Ajustar deck (README 4.4 passos 1 a 4, 6.3, 8.2, 12.2; REQ-65, REQ-66).
   * `build` é a build nova inteira (D-68). Ordem das recusas: fora de sessão,
   * sem pontos, `notOwned`, `copyLimitExceeded`, `buildBelowMinimum`,
   * `tcgFolderFull`. `catalog` traz as cartas de atributo e as classes do
   * jogador (D-71). O deck novo é embaralhado com o RNG e o jogador compra de
   * volta a mesma quantidade de cartas que tinha na mão. Recusado, nada muda.
   */
  adjustDeck(
    build: readonly TStarterDeckEntry[],
    catalog: {
      cards: readonly TAttributeCard[]
      classes: readonly TClassDefinition[]
    },
    at: Date
  ): Either<TAdjustDeckRefusal, void> {
    switch (this.props.status) {
      case 'idle':
        return left('sessionNotActive')
      case 'inSession':
        break
      default: {
        const _exhaustive: never = this.props.status
        return _exhaustive
      }
    }

    if (this.props.turn.actionPoints < 1) {
      return left('noActionPoints')
    }

    const { config } = this.props
    const index = this.actorIndex()
    const actor = this.props.members[index]
    const { player } = actor

    const pool = new Map<string, number>()
    for (const { cardId, copies } of [...player.build, ...player.tcgFolder]) {
      pool.set(cardId, (pool.get(cardId) ?? 0) + copies)
    }

    for (const { cardId, copies } of build) {
      if (copies > (pool.get(cardId) ?? 0)) {
        return left({ reason: 'notOwned', cardId })
      }
    }
    for (const { cardId, copies } of build) {
      const card = catalog.cards.find((c) => c.id === cardId)
      if (
        card &&
        card.attributeKind !== 'basic' &&
        copies > config.maxCopiesPerCard
      ) {
        return left({ reason: 'copyLimitExceeded', cardId })
      }
    }

    const buildSize = build.reduce((sum, { copies }) => sum + copies, 0)
    if (buildSize < config.minDeckSize) {
      return left('buildBelowMinimum')
    }

    const inBuild = new Map(build.map(({ cardId, copies }) => [cardId, copies]))
    const tcgFolder = sortedByCardId(
      [...pool].map(([cardId, owned]) => ({
        cardId,
        copies: owned - (inBuild.get(cardId) ?? 0),
      }))
    ).filter(({ copies }) => copies > 0)
    const folderSize = tcgFolder.reduce((sum, { copies }) => sum + copies, 0)
    if (folderSize > config.tcgFolderCapacity) {
      return left('tcgFolderFull')
    }

    const newBuild = sortedByCardId(
      build.map(({ cardId, copies }) => ({ cardId, copies }))
    )
    const rng = SeededRng.fromState(this.props.rngState)
    const shuffled = shuffle(
      newBuild.flatMap(({ cardId, copies }) =>
        Array.from({ length: copies }, () => cardId)
      ),
      rng
    )
    const hand = shuffled.slice(0, player.hand.length)
    const deck = shuffled.slice(hand.length)

    const lockEntries = newBuild.flatMap(({ cardId, copies }) => {
      const card = catalog.cards.find((c) => c.id === cardId)
      return card ? [{ card, copies }] : []
    })
    const playerClasses = player.playerClasses.map((entry) => {
      const definition = catalog.classes.find(
        (c) => c.playerClass === entry.playerClass
      )
      if (!definition) return entry
      return {
        playerClass: entry.playerClass,
        deckLockMet: isClassActive({
          build: lockEntries,
          essentialAttributes: definition.essentialAttributes,
          lockOneEssential: config.lockOneEssential,
          lockTwoEssentials: config.lockTwoEssentials,
        }),
      }
    })
    // Os modificadores seguem a 1ª classe, como na preparação (REQ-34).
    const firstDefinition = catalog.classes.find(
      (c) => c.playerClass === player.playerClasses[0]?.playerClass
    )
    const modifiers = firstDefinition
      ? playerClasses[0].deckLockMet
        ? { ...firstDefinition.baseModifiers }
        : defaultModifiers(config)
      : player.modifiers

    this.props.rngState = rng.state()
    this.spendActionPoint()
    this.replaceActor(index, {
      ...player,
      playerClasses,
      build: newBuild,
      tcgFolder,
      deck,
      hand,
      discard: [],
      modifiers,
    })
    this.props.savedAt = at
    const base = { occurredAt: at, aggregateId: this.id }
    this.addDomainEvent({
      type: 'DeckAdjusted',
      memberId: actor.id,
      buildSize,
      handSize: hand.length,
      ...base,
    })
    playerClasses.forEach((entry, i) => {
      if (entry.deckLockMet !== player.playerClasses[i].deckLockMet) {
        this.addDomainEvent({
          type: 'DeckLockChanged',
          memberId: actor.id,
          playerClass: entry.playerClass,
          deckLockMet: entry.deckLockMet,
          ...base,
        })
      }
    })
    return right(undefined)
  }

  /** Posição do membro da vez (D-63). */
  private actorIndex(): number {
    return this.props.members.findIndex((member) =>
      member.id.equals(this.props.turn.memberId)
    )
  }

  private spendActionPoint(): void {
    this.props.turn = {
      ...this.props.turn,
      actionPoints: this.props.turn.actionPoints - 1,
    }
  }

  private replaceActor(index: number, player: TPlayerState): void {
    this.props.members = this.props.members.map((member, i) =>
      i === index
        ? PartyMember.create(
            {
              characterName: member.characterName,
              kind: member.kind,
              player,
            },
            member.id
          )
        : member
    )
  }

  /** Abandonar (REQ-24): vale em qualquer status; o save é apagado pelo repositório. */
  abandon(at: Date): void {
    this.addDomainEvent({
      type: 'PartyAbandoned',
      occurredAt: at,
      aggregateId: this.id,
    })
  }
}

/** REQ-35: `unknownClass` quando o texto não tem classe publicada. */
function checkPlayerClass(
  { playerClass, classDefinition }: TCreatePartyInput,
  issues: TPartyIssue[]
): TClassDefinition | null {
  if (playerClass === undefined) {
    issues.push({ field: 'playerClass', reason: 'required' })
    return null
  }
  if (typeof playerClass !== 'string') {
    issues.push({ field: 'playerClass', reason: 'notString' })
    return null
  }
  if (classDefinition === null || classDefinition.playerClass !== playerClass) {
    issues.push({ field: 'playerClass', reason: 'unknownClass' })
    return null
  }
  return classDefinition
}

function checkName(
  field: 'name' | 'characterName',
  value: unknown,
  maxLength: number,
  issues: TPartyIssue[]
): string | null {
  if (value === undefined) {
    issues.push({ field, reason: 'required' })
    return null
  }
  if (typeof value !== 'string') {
    issues.push({ field, reason: 'notString' })
    return null
  }
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    issues.push({ field, reason: 'blank' })
    return null
  }
  if (trimmed.length > maxLength) {
    issues.push({ field, reason: 'tooLong' })
    return null
  }
  return trimmed
}
