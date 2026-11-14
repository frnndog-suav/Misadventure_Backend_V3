/** Identidade de uma entidade. Recebe o valor pronto: quem gera é a porta `IdGenerator`. */
export class UniqueEntityID {
  private readonly value: string

  constructor(value: string) {
    this.value = value
  }

  toString(): string {
    return this.value
  }

  toValue(): string {
    return this.value
  }

  equals(other: UniqueEntityID): boolean {
    return other.toValue() === this.value
  }
}
