import { DomainError } from '@/core/error/domain-error'

/** Onde a carta é citada: deck pré-pronto de classe (REQ-40) ou deck de recompensas (REQ-82). */
export type TContentReference =
  'starterDeck' | 'rewardDeck' | 'quest' | 'specialization' | 'marketStock'

const MESSAGES: Record<TContentReference, string> = {
  quest: 'Esta carta é referenciada por uma missão ou por um deck de missões.',
  specialization: 'Esta carta é referenciada por um efeito de especialização.',
  starterDeck:
    'Esta carta está no deck pré-pronto de uma classe e não pode ser apagada nem renomeada.',
  rewardDeck:
    'Esta carta está no deck de recompensas de uma Carta de Dimensão.',
  marketStock: 'Esta carta está no estoque do mercado de uma zona.',
}

/** CONTRATO §4 `CONTENT_REFERENCED`. */
export class ContentReferencedError extends DomainError {
  readonly code = 'CONTENT_REFERENCED'
  readonly message: string

  constructor(reference: TContentReference = 'starterDeck') {
    super()
    this.message = MESSAGES[reference]
  }
}
