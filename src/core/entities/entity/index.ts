import { UniqueEntityID } from '../unique-entity-id'

/** Entidade: identificada pelo `id`, com props mutáveis só por métodos da subclasse. */
export abstract class Entity<Props> {
  private readonly _id: UniqueEntityID
  protected props: Props

  protected constructor(props: Props, id: UniqueEntityID) {
    this.props = props
    this._id = id
  }

  get id(): UniqueEntityID {
    return this._id
  }

  equals(other: Entity<unknown>): boolean {
    return other === this || other.id.equals(this._id)
  }
}
