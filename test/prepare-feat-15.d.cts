// Tipos do preparador da T-60 (test/prepare-feat-15.cjs), usados pelo e2e de missões.
declare namespace PrepareFeat15 {
  type Scenario = Readonly<{ key: string } & Record<string, unknown>>
}

declare const prepareFeat15: {
  /** Acrescenta o conteúdo da T-60 a uma cópia das fixtures. */
  writeT60Content(root: string): Promise<void>
  /** Uma entrada por campanha, na ordem do roteiro. */
  scenarios: readonly PrepareFeat15.Scenario[]
  /** Grava o ponto de partida da campanha no estado do save (muta `state`). */
  seed(state: Record<string, unknown>, scenario: PrepareFeat15.Scenario): void
}

export = prepareFeat15
