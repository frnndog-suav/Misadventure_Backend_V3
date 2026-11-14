/** Objeto de valor: imutável, identificado só pelas suas props. */
export abstract class ValueObject<Props> {
  protected readonly props: Readonly<Props>

  protected constructor(props: Props) {
    this.props = Object.freeze({ ...props })
  }
}
