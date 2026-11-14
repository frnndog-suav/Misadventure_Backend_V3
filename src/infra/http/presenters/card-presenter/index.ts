import type { TCard } from '@/domain/catalog/enterprise/value-objects/card'

/**
 * CONTRATO FEAT-04, tipo `Card`. Os tipos do domínio espelham o contrato
 * campo a campo (D-23), então a carta sai como está.
 */
export type TCardHttp = TCard

export class CardPresenter {
  static toHTTP(card: TCard): TCardHttp {
    return card
  }
}
