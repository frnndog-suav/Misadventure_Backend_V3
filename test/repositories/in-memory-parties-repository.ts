import { PartiesRepository } from '@/domain/campaign/application/repositories/parties-repository'
import { Party } from '@/domain/campaign/enterprise/entities/party'

/** Guarda cópias (não referências), para que ler devolva outro objeto, como no banco (REQ-22). */
export class InMemoryPartiesRepository implements PartiesRepository {
  public items: Party[] = []

  async create(party: Party): Promise<void> {
    if (this.items.some((item) => item.id.equals(party.id)))
      throw new Error(`Grupo duplicado: ${party.id.toString()}`)
    this.items.push(snapshot(party))
  }

  async save(party: Party): Promise<void> {
    const index = this.items.findIndex((item) => item.id.equals(party.id))
    if (index < 0) throw new Error(`Grupo inexistente: ${party.id.toString()}`)
    this.items[index] = snapshot(party)
  }

  async findById(id: string): Promise<Party | null> {
    const found = this.items.find((item) => item.id.toString() === id)
    return found ? snapshot(found) : null
  }

  async findAll(): Promise<Party[]> {
    return this.items.map(snapshot)
  }

  async delete(party: Party): Promise<void> {
    this.items = this.items.filter((item) => !item.id.equals(party.id))
  }
}

function snapshot(party: Party): Party {
  return Party.restore(
    {
      name: party.name,
      members: [...party.members],
      hostMemberId: party.hostMemberId,
      status: party.status,
      config: party.config,
      rngState: [...party.rngState] as unknown as Party['rngState'],
      dimension: structuredClone(party.dimension),
      turnOrder: [...party.turnOrder],
      createdAt: party.createdAt,
      savedAt: party.savedAt,
    },
    party.id
  )
}
