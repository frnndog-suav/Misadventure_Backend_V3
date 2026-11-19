import { describe, expect, it } from 'vitest'

import { checkCatalogIntegrity } from '@/domain/catalog/enterprise/catalog-integrity'
import { effectCitationPublicationIssues } from '@/domain/catalog/enterprise/card-validation'
import type { TCard } from '@/domain/catalog/enterprise/value-objects/card'
import type {
  TActivation,
  TCost,
  TDuration,
  TEffect,
  TTrigger,
} from '@/domain/catalog/enterprise/value-objects/effect'
import {
  makeAttributeCard,
  makeCollection,
  makeDimensionCard,
  makeEffect,
  makeEquipmentCard,
  makeItemCard,
  makeZoneCard,
  makeZoneEffect,
} from '../../../../../test/factories/make-card'

import { EFFECT_KINDS } from '.'

/** Problemas de uma carta sozinha, como `[campo, motivo]`. */
function problems(card: TCard): [string, string][] {
  return checkCatalogIntegrity({
    collections: [makeCollection()],
    cards: [card],
  }).map((issue) => [issue.field, issue.reason])
}

const potion = (effect: Partial<TEffect>) =>
  makeItemCard({ effects: [makeEffect(effect)] })
const gear = (effect: Partial<TEffect>) =>
  makeEquipmentCard({ effects: [makeEffect({ cost: [], ...effect })] })
const unknown = <T>(value: unknown) => value as T

describe('REQ-98: catálogo de variações (D-96, D-97)', () => {
  it('REQ-98: as quatro uniões cobrem as 172 variações do catálogo validado', () => {
    expect(Object.values(EFFECT_KINDS).map((kinds) => kinds.length)).toEqual([
      46, 11, 56, 59,
    ])
  })

  it('REQ-98: nenhum kind se repete dentro de uma união', () => {
    for (const kinds of Object.values(EFFECT_KINDS)) {
      expect(new Set(kinds).size).toBe(kinds.length)
    }
  })
})

describe('REQ-99: regras do efeito', () => {
  it('REQ-99: efeito válido de cada tipo de carta não gera problema', () => {
    expect(problems(potion({}))).toEqual([])
    expect(problems(gear({}))).toEqual([])
    expect(problems(makeZoneCard({ effects: [makeZoneEffect()] }))).toEqual([])
    expect(
      problems(
        makeAttributeCard({
          attributeKind: 'enhanced',
          effects: [makeEffect({ cost: [] })],
        })
      )
    ).toEqual([])
    expect(
      problems(makeDimensionCard({ effects: [makeZoneEffect()] }))
    ).toEqual([])
  })

  it('REQ-99: texto vazio', () => {
    expect(problems(potion({ text: '  ' }))).toEqual([
      ['effects[0].text', 'empty'],
    ])
  })

  it('REQ-99: activation vazia', () => {
    expect(problems(potion({ activation: [] }))).toEqual([
      ['effects[0].activation', 'empty'],
    ])
  })

  describe('kind desconhecido', () => {
    it('REQ-99: no gatilho, no custo, na ativação e na duração', () => {
      expect(
        problems(potion({ trigger: unknown<TTrigger>({ kind: 'onFullMoon' }) }))
      ).toEqual([['effects[0].trigger.kind', 'unknownEffectKind']])
      expect(
        problems(
          potion({
            cost: [{ kind: 'consumeSelf' }, unknown<TCost>({ kind: 'x' })],
          })
        )
      ).toEqual([['effects[0].cost[1].kind', 'unknownEffectKind']])
      expect(
        problems(
          potion({
            activation: [
              { kind: 'heal', amount: 1 },
              unknown<TActivation>({ kind: 'x' }),
            ],
          })
        )
      ).toEqual([['effects[0].activation[1].kind', 'unknownEffectKind']])
      for (const kind of ['constructor', 'toString', '__proto__']) {
        expect(
          problems(potion({ trigger: unknown<TTrigger>({ kind }) }))
        ).toEqual([['effects[0].trigger.kind', 'unknownEffectKind']])
      }
      expect(
        problems(potion({ duration: unknown<TDuration>({ kind: 'x' }) }))
      ).toEqual([['effects[0].duration.kind', 'unknownEffectKind']])
    })
  })

  describe('parâmetro fora da faixa do catálogo', () => {
    it('REQ-99: o exemplo do contrato (activation.1.amount)', () => {
      expect(
        problems(
          potion({
            activation: [
              { kind: 'heal', amount: 5 },
              { kind: 'gainGold', amount: 0 },
            ],
          })
        )
      ).toEqual([['effects[0].activation[1].amount', 'outOfRange']])
    })

    it('REQ-99: número não inteiro', () => {
      expect(
        problems(potion({ activation: [{ kind: 'heal', amount: 1.5 }] }))
      ).toEqual([['effects[0].activation[0].amount', 'outOfRange']])
    })

    it.each<[string, Partial<TEffect>, string]>([
      [
        'gatilho: times ≥ 1',
        {
          trigger: {
            kind: 'onZoneActionUsed',
            action: 'recover',
            times: 0,
            consecutive: false,
          },
        },
        'effects[0].trigger.times',
      ],
      [
        'gatilho: percent 0..100',
        { trigger: { kind: 'whileVigorRatio', percent: 101, op: 'gte' } },
        'effects[0].trigger.percent',
      ],
      [
        'gatilho: value ≥ 0',
        { trigger: { kind: 'whileGold', value: -1, op: 'gte' } },
        'effects[0].trigger.value',
      ],
      [
        'gatilho: lista de 1 a 4 fases',
        { trigger: { kind: 'onEventPhase', phases: [], exclude: false } },
        'effects[0].trigger.phases',
      ],
      [
        'gatilho: max de classe primária ≥ 1 ou null',
        { trigger: { kind: 'whilePrimaryClassCount', min: 1, max: 0 } },
        'effects[0].trigger.max',
      ],
      [
        'custo: leave ≥ 0',
        { cost: [{ kind: 'discardHandDownTo', leave: -1, minimum: 1 }] },
        'effects[0].cost[0].leave',
      ],
      [
        'custo: count de abdicar 1..8',
        {
          cost: [
            {
              kind: 'abandonEquipment',
              slots: [],
              excludeSlots: [],
              count: 9,
              random: false,
            },
          ],
        },
        'effects[0].cost[0].count',
      ],
      [
        'custo: percent do Pico 1..100',
        { cost: [{ kind: 'reducePeak', amount: null, percent: 0 }] },
        'effects[0].cost[0].percent',
      ],
      [
        'custo: exigência de mão com 0 cartas',
        {
          cost: [
            {
              kind: 'discardFromHand',
              requirements: [{ attribute: 'strength', count: 0 }],
              excludeAttributes: [],
              constraint: 'none',
              random: false,
            },
          ],
        },
        'effects[0].cost[0].requirements[0].count',
      ],
      [
        'custo: exigência de mão com mais de 9 itens',
        {
          cost: [
            {
              kind: 'discardFromHand',
              requirements: Array.from({ length: 10 }, () => ({
                attribute: 'any' as const,
                count: 1,
              })),
              excludeAttributes: [],
              constraint: 'none',
              random: false,
            },
          ],
        },
        'effects[0].cost[0].requirements',
      ],
      [
        'ativação: modifierFlat com 8 mudanças',
        {
          activation: [
            {
              kind: 'modifierFlat',
              changes: Array.from({ length: 8 }, () => ({
                modifier: 'attack' as const,
                amount: 1,
              })),
            },
          ],
        },
        'effects[0].activation[0].changes',
      ],
      [
        'ativação: factor ≥ 2',
        {
          activation: [
            { kind: 'attributeValueMultiplier', attribute: 'luck', factor: 1 },
          ],
        },
        'effects[0].activation[0].factor',
      ],
      [
        'ativação: percent 1..100',
        { activation: [{ kind: 'reviveAlly', healthPercent: 101 }] },
        'effects[0].activation[0].healthPercent',
      ],
      [
        'ativação: loseLife aceita número ≥ 1 ou halfHealth',
        { activation: [{ kind: 'loseLife', amount: 0 }] },
        'effects[0].activation[0].amount',
      ],
      [
        'duração: turns ≥ 1',
        { duration: { kind: 'forOwnTurns', turns: 0 }, mark: 'buff' },
        'effects[0].duration.turns',
      ],
      [
        'duração: effectIndex ≥ 0',
        {
          duration: {
            kind: 'whileEffectActive',
            cardId: 'fixture.x',
            effectIndex: -1,
          },
          mark: 'buff',
        },
        'effects[0].duration.effectIndex',
      ],
    ])('REQ-99: %s', (_name, effect, path) => {
      const card = path.includes('.cost')
        ? potion({
            ...effect,
            cost: [...(effect.cost ?? []), { kind: 'consumeSelf' }],
          })
        : potion(effect)
      expect(problems(card)).toContainEqual([path, 'outOfRange'])
    })

    it('REQ-99: Quantidade em fórmula com multiplicador 0 ou mínimo negativo', () => {
      const amount = (multiplier: number, minimum: number): TCost => ({
        kind: 'payGold',
        amount: { base: 'halfGold', multiplier, minimum },
      })
      expect(
        problems(potion({ cost: [{ kind: 'consumeSelf' }, amount(0, 0)] }))
      ).toEqual([['effects[0].cost[1].amount.multiplier', 'outOfRange']])
      expect(
        problems(potion({ cost: [{ kind: 'consumeSelf' }, amount(1, -1)] }))
      ).toEqual([['effects[0].cost[1].amount.minimum', 'outOfRange']])
      expect(
        problems(
          potion({
            cost: [{ kind: 'consumeSelf' }, { kind: 'payGold', amount: -1 }],
          })
        )
      ).toEqual([['effects[0].cost[1].amount', 'outOfRange']])
    })

    it('REQ-99: lista com faixa sem repetição', () => {
      expect(
        problems(
          potion({
            trigger: {
              kind: 'whileHighestModifier',
              modifiers: ['attack', 'attack'],
            },
          })
        )
      ).toEqual([['effects[0].trigger.modifiers', 'duplicateValue']])
    })
  })

  describe('escolha entre campos e filtros obrigatórios', () => {
    it('REQ-99: reducePeak com amount e percent, ou com nenhum', () => {
      const cost = (amount: number | null, percent: number | null): TCost => ({
        kind: 'reducePeak',
        amount,
        percent,
      })
      expect(
        problems(potion({ cost: [{ kind: 'consumeSelf' }, cost(1, 10)] }))
      ).toEqual([['effects[0].cost[1]', 'exactlyOneRequired']])
      expect(
        problems(potion({ cost: [{ kind: 'consumeSelf' }, cost(null, null)] }))
      ).toEqual([['effects[0].cost[1]', 'exactlyOneRequired']])
    })

    it('REQ-99: comparação de modificadores com right e value, ou com nenhum', () => {
      const comparison = (
        right: ('attack' | 'defense')[] | null,
        value: number | null
      ): TTrigger => ({
        kind: 'whileModifierComparison',
        left: ['accuracy'],
        op: 'gt',
        right,
        value,
      })
      expect(problems(potion({ trigger: comparison(['defense'], 3) }))).toEqual(
        [['effects[0].trigger', 'exactlyOneRequired']]
      )
      expect(problems(potion({ trigger: comparison(null, null) }))).toEqual([
        ['effects[0].trigger', 'exactlyOneRequired'],
      ])
      expect(
        problems(potion({ trigger: comparison(['defense'], null) }))
      ).toEqual([])
    })

    it('REQ-99: ao menos um filtro em onEnterZoneFilter, onAbilityUsed e nullifyAbilities', () => {
      expect(
        problems(
          potion({
            trigger: {
              kind: 'onEnterZoneFilter',
              zoneTypes: [],
              excludeZoneTypes: [],
              locations: [],
              excludeLocations: [],
            },
          })
        )
      ).toEqual([['effects[0].trigger', 'filterRequired']])
      expect(
        problems(
          potion({
            trigger: {
              kind: 'onAbilityUsed',
              slots: [],
              excludeSlots: [],
              tags: [],
              cardId: null,
            },
          })
        )
      ).toEqual([['effects[0].trigger', 'filterRequired']])
      expect(
        problems(
          potion({
            activation: [{ kind: 'nullifyAbilities', slots: [], tags: [] }],
          })
        )
      ).toEqual([['effects[0].activation[0]', 'filterRequired']])
    })
  })

  describe('marcação (README 13.6)', () => {
    it('REQ-99: duração immediate com mark', () => {
      expect(problems(potion({ mark: 'buff' }))).toEqual([
        ['effects[0].mark', 'markNotAllowed'],
      ])
    })

    it('REQ-99: outra duração sem mark em item, equipamento e atributo aprimorado', () => {
      const duration: TDuration = { kind: 'forOwnTurns', turns: 2 }
      expect(problems(potion({ duration }))).toEqual([
        ['effects[0].mark', 'markRequired'],
      ])
      expect(problems(gear({ duration }))).toEqual([
        ['effects[0].mark', 'markRequired'],
      ])
      expect(
        problems(
          makeAttributeCard({
            attributeKind: 'enhanced',
            effects: [makeEffect({ cost: [], duration })],
          })
        )
      ).toEqual([['effects[0].mark', 'markRequired']])
    })

    it('REQ-99: outra duração com mark é válida; zona e dimensão usam polarity', () => {
      expect(
        problems(
          potion({
            duration: { kind: 'forOwnTurns', turns: 2 },
            mark: 'debuff',
          })
        )
      ).toEqual([])
      expect(
        problems(
          makeZoneCard({
            effects: [makeZoneEffect({ duration: { kind: 'untilLeaveZone' } })],
          })
        )
      ).toEqual([])
    })
  })

  describe('Usar um recurso (README 13)', () => {
    it('REQ-99: o exemplo do contrato — poção com cost: []', () => {
      expect(problems(potion({ cost: [] }))).toEqual([
        ['effects[0].cost', 'consumableNeedsConsumeSelf'],
      ])
    })

    it('REQ-99: consumível passivo (sem gatilho e sem custo) cai na mesma regra (D-103)', () => {
      expect(problems(potion({ trigger: null, cost: [] }))).toEqual([
        ['effects[0].cost', 'consumableNeedsConsumeSelf'],
      ])
    })

    it('REQ-99: consumível com gatilho e custo sem consumeSelf', () => {
      expect(
        problems(
          potion({
            trigger: { kind: 'onEnterThisZone' },
            cost: [{ kind: 'payGold', amount: 1 }],
          })
        )
      ).toEqual([['effects[0].cost', 'consumableNeedsConsumeSelf']])
    })

    it('REQ-99: cada efeito do consumível é conferido, no seu índice', () => {
      expect(
        problems(
          makeItemCard({
            effects: [makeEffect(), makeEffect({ cost: [] })],
          })
        )
      ).toEqual([['effects[1].cost', 'consumableNeedsConsumeSelf']])
    })

    it('REQ-99: item que não é consumível não precisa de consumeSelf', () => {
      expect(
        problems(
          makeItemCard({
            itemCategory: 'relic',
            effects: [makeEffect({ cost: [] })],
          })
        )
      ).toEqual([])
    })

    it('REQ-99: consumeSelf fora de item (equipamento, atributo, zona, dimensão)', () => {
      const cost: TCost[] = [{ kind: 'consumeSelf' }]
      expect(problems(gear({ cost }))).toEqual([
        ['effects[0].cost[0]', 'consumeSelfOnlyInItem'],
      ])
      expect(
        problems(
          makeAttributeCard({
            attributeKind: 'enhanced',
            effects: [makeEffect({ cost })],
          })
        )
      ).toEqual([['effects[0].cost[0]', 'consumeSelfOnlyInItem']])
      expect(
        problems(makeZoneCard({ effects: [makeZoneEffect({ cost })] }))
      ).toEqual([['effects[0].cost[0]', 'consumeSelfOnlyInItem']])
      expect(
        problems(makeDimensionCard({ effects: [makeZoneEffect({ cost })] }))
      ).toEqual([['effects[0].cost[0]', 'consumeSelfOnlyInItem']])
    })
  })

  describe('citações (README 13, "O que um efeito pode citar")', () => {
    const offer = (resource: string, exclude: string[] = []): TCost => ({
      kind: 'offerResources',
      requirements: [{ resource, count: 1 }],
      constraint: 'none',
      exclude,
    })
    const withOffer = (cost: TCost) =>
      problems(potion({ cost: [{ kind: 'consumeSelf' }, cost] }))

    it.each(['item', 'equipment', 'any', 'relic', 'tag:Poção'])(
      'REQ-99: aceita a citação "%s"',
      (resource) => {
        expect(withOffer(offer(resource))).toEqual([])
      }
    )

    it('REQ-99: recurso citado fora do que o README permite', () => {
      expect(withOffer(offer('espada'))).toEqual([
        ['effects[0].cost[1].requirements[0].resource', 'citationNotAllowed'],
      ])
      expect(withOffer(offer('tag:'))).toEqual([
        ['effects[0].cost[1].requirements[0].resource', 'citationNotAllowed'],
      ])
    })

    it('REQ-99: exclusão aceita categoria, local de equipamento e etiqueta; recusa o resto', () => {
      expect(withOffer(offer('any', ['relic', 'head', 'tag:x']))).toEqual([])
      expect(withOffer(offer('any', ['relic', 'espada']))).toEqual([
        ['effects[0].cost[1].exclude[1]', 'citationNotAllowed'],
      ])
    })

    it('REQ-99: etiqueta de habilidade vazia', () => {
      expect(
        problems(
          potion({
            trigger: {
              kind: 'onAbilityUsed',
              slots: [],
              excludeSlots: [],
              tags: [' '],
              cardId: null,
            },
          })
        )
      ).toEqual([['effects[0].trigger.tags[0]', 'citationNotAllowed']])
    })
  })

  it('REQ-99: todos os efeitos da carta são conferidos', () => {
    expect(
      problems(
        makeItemCard({
          effects: [
            makeEffect({ text: '' }),
            makeEffect(),
            makeEffect({ activation: [] }),
          ],
        })
      )
    ).toEqual([
      ['effects[0].text', 'empty'],
      ['effects[2].activation', 'empty'],
    ])
  })

  it('REQ-99: zona e dimensão também têm as faixas conferidas', () => {
    const effects = [
      makeZoneEffect({ activation: [{ kind: 'loseLife', amount: 0 }] }),
    ]
    expect(problems(makeZoneCard({ effects }))).toEqual([
      ['effects[0].activation[0].amount', 'outOfRange'],
    ])
    expect(problems(makeDimensionCard({ effects }))).toEqual([
      ['effects[0].activation[0].amount', 'outOfRange'],
    ])
  })
})

describe('REQ-99: citação conferida ao publicar (D-91)', () => {
  const zone = makeZoneCard({ title: 'Forte Cinzento' })
  const sword = makeEquipmentCard({ id: 'other.sword', collectionId: 'other' })
  const catalog: TCard[] = [zone, sword]

  it('REQ-99: título de zona que existe em qualquer coleção passa', () => {
    const card = potion({
      trigger: { kind: 'onEnterZoneTitle', zoneTitle: 'Forte Cinzento' },
    })
    expect(effectCitationPublicationIssues(card, catalog)).toEqual([])
  })

  it('REQ-99: título de zona inexistente', () => {
    const card = potion({
      trigger: { kind: 'onEnterZoneTitle', zoneTitle: 'Forte Perdido' },
    })
    expect(effectCitationPublicationIssues(card, catalog)).toEqual([
      { path: 'effects.0.trigger.zoneTitle', reason: 'citedZoneNotFound' },
    ])
  })

  it('REQ-99: carta citada que existe (outra coleção) passa', () => {
    const card = gear({
      duration: { kind: 'whileResourceInInventory', cardId: 'other.sword' },
      mark: 'buff',
    })
    expect(effectCitationPublicationIssues(card, catalog)).toEqual([])
  })

  it('REQ-99: carta citada inexistente, no gatilho e na duração', () => {
    const card = makeEquipmentCard({
      effects: [
        makeEffect({
          cost: [],
          trigger: {
            kind: 'onAbilityUsed',
            slots: [],
            excludeSlots: [],
            tags: [],
            cardId: 'other.ghost',
          },
        }),
        makeEffect({
          cost: [],
          duration: { kind: 'untilCardDiscarded', cardId: 'other.ghost' },
          mark: 'buff',
        }),
      ],
    })
    expect(effectCitationPublicationIssues(card, catalog)).toEqual([
      { path: 'effects.0.trigger.cardId', reason: 'citedCardNotFound' },
      { path: 'effects.1.duration.cardId', reason: 'citedCardNotFound' },
    ])
  })

  it('REQ-99: carta que cita a si mesma existe (está no conjunto)', () => {
    const self = makeEquipmentCard({
      effects: [
        makeEffect({
          cost: [],
          duration: {
            kind: 'whileEffectActive',
            cardId: 'fixture.blade-of-dusk',
            effectIndex: 0,
          },
          mark: 'buff',
        }),
      ],
    })
    expect(effectCitationPublicationIssues(self, [self])).toEqual([])
  })

  it('REQ-99: carta sem citação e tipo sem efeitos não geram problema', () => {
    expect(effectCitationPublicationIssues(potion({}), [])).toEqual([])
    expect(
      effectCitationPublicationIssues(
        { ...makeDimensionCard(), effects: [] },
        []
      )
    ).toEqual([])
  })
})
