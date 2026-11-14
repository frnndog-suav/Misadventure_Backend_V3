/** Estado serializável do sfc32: quatro inteiros de 32 bits sem sinal (a, b, c, contador). */
export type RngState = readonly [number, number, number, number]

const UINT32_RANGE = 4294967296 // 2^32
const SEED_DISCARD = 12

const isUint32 = (value: unknown): value is number =>
  Number.isInteger(value) &&
  (value as number) >= 0 &&
  (value as number) < UINT32_RANGE

/**
 * Gerador pseudoaleatório com semente, algoritmo sfc32 (D-26, D-32). Puro e
 * determinístico: o mesmo estado produz sempre a mesma sequência (README 28.1).
 * Argumentos inválidos são erro de programação e lançam `RangeError`.
 */
export class SeededRng {
  private a: number
  private b: number
  private c: number
  private d: number

  private constructor([a, b, c, d]: RngState) {
    this.a = a
    this.b = b
    this.c = c
    this.d = d
  }

  /** Semeadura do PractRand: a=0, b=seed, c=0, contador=1, descarta 12 saídas. */
  static fromSeed(seed: number): SeededRng {
    if (!isUint32(seed))
      throw new RangeError(`Semente inválida: ${seed} (inteiro em [0, 2^32-1])`)

    const rng = new SeededRng([0, seed, 0, 1])
    for (let i = 0; i < SEED_DISCARD; i++) rng.nextUint32()
    return rng
  }

  static fromState(state: RngState): SeededRng {
    if (!Array.isArray(state) || state.length !== 4 || !state.every(isUint32))
      throw new RangeError(
        'Estado do RNG inválido (quatro inteiros de 32 bits)'
      )

    return new SeededRng(state)
  }

  /** Próximo inteiro em [0, 2^32 - 1]. */
  nextUint32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0
    this.d = (this.d + 1) | 0
    this.a = this.b ^ (this.b >>> 9)
    this.b = (this.c + (this.c << 3)) | 0
    this.c = (this.c << 21) | (this.c >>> 11)
    this.c = (this.c + t) | 0
    return t >>> 0
  }

  /** Inteiro uniforme em [min, max] (inclusivo), sem viés (rejeição). Faixa de até 2^32 valores. */
  nextInt(min: number, max: number): number {
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min > max)
      throw new RangeError(`Faixa inválida: [${min}, ${max}]`)

    const range = max - min + 1
    if (range > UINT32_RANGE)
      throw new RangeError(`Faixa maior que 2^32 valores: [${min}, ${max}]`)

    const limit = UINT32_RANGE - (UINT32_RANGE % range)
    let value = this.nextUint32()
    while (value >= limit) value = this.nextUint32()
    return min + (value % range)
  }

  /** Cópia do estado atual, para gravar no save. */
  state(): RngState {
    return [this.a >>> 0, this.b >>> 0, this.c >>> 0, this.d >>> 0]
  }
}
