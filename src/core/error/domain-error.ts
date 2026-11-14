/**
 * Erro de regra devolvido como valor (Constituição 5), nunca lançado.
 * `code` vem de CONTRATO §4; `message` é para o jogador (pt-BR);
 * `details` segue o tipo que o contrato define para o código.
 */
export abstract class DomainError {
  abstract readonly code: string
  abstract readonly message: string
  readonly details?: Readonly<Record<string, unknown>>
}
