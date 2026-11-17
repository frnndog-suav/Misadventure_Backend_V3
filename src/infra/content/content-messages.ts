import type { TCatalogIssueReason } from '@/domain/catalog/enterprise/catalog-integrity'
import type {
  TContentIssue,
  TContentIssueReason,
} from '@/domain/catalog/enterprise/value-objects/content'

/**
 * Textos pt-BR dos problemas de conteúdo (D-49): uma tabela só, usada pelo
 * relatório do boot e do `validate:content` (REQ-11) e pelo editor
 * (`details.fields[].message`, REQ-42 a REQ-48).
 */

const CATALOG_MESSAGES: Record<TCatalogIssueReason, string> = {
  duplicateId: 'Id repetido.',
  unknownCollection: 'Coleção inexistente.',
  invalidIdFormat:
    'Formato de id inválido (coleção em kebab-case sem ponto; carta em <coleção>.<slug-kebab>).',
  duplicateTitle: 'Título repetido na coleção.',
  outOfRange: 'Valor fora da faixa permitida.',
  urbanZoneRequiresFourArrows:
    'Zona urbana precisa de exatamente 4 setas de conexão.',
  missingRequiredAction: 'Ação de zona obrigatória ausente.',
  actionOnlyInUrbanZone: 'Ação permitida só em zona urbana.',
  basicAttributeCount: 'Carta básica tem exatamente 1 atributo.',
  enhancedAttributeCount: 'Carta aprimorada tem exatamente 1 atributo.',
  synergyAttributeCount: 'Carta de sinergia tem de 2 a 4 atributos.',
  duplicateValue: 'Valor repetido.',
  effectsNotAllowed: 'Este tipo de carta de atributo não tem efeitos.',
  effectsRequired: 'Carta aprimorada precisa de pelo menos 1 efeito.',
  onlyForWeapons: 'Só armas podem bloquear o escudo.',
  empty: 'Não pode ficar vazio.',
  arrowLayoutRequired:
    'Zona com 2 setas precisa da forma das setas (straight ou corner).',
  arrowLayoutNotAllowed: 'Forma das setas só existe em zona com 2 setas.',
  tooManyDimensions: 'A coleção tem no máximo 1 Carta de Dimensão.',
  duplicateName: 'Nome repetido no catálogo.',
  essentialAttributeCount: 'A classe tem 1 ou 2 atributos essenciais.',
  duplicateEssentials:
    'Outra classe já tem o mesmo conjunto de atributos essenciais.',
  unknownCard: 'Carta inexistente.',
  notAnAttributeCard: 'O deck pré-pronto só tem cartas de atributo.',
  starterDeckSize:
    'O deck pré-pronto precisa ter o tamanho mínimo do deck (padrão).',
  starterDeckLockNotMet:
    'O deck pré-pronto precisa cumprir a trava da classe (padrão).',
}

/** Relatório de REQ-11 (o arquivo e a carta já localizam o problema). */
export function catalogIssueMessage(reason: TCatalogIssueReason): string {
  return CATALOG_MESSAGES[reason]
}

/** Último trecho do caminho: `cards.0.card.id` → `id`. */
function lastSegment(path: string): string {
  return path.slice(path.lastIndexOf('.') + 1)
}

/** Caminho de um id de coleção (`id` no corpo da coleção, `collection.id` no import). */
function isCollectionIdPath(path: string): boolean {
  return path === 'id' || path === 'collection.id'
}

/** Texto do editor para um problema (`message` do Zod tem prioridade). */
export function contentIssueMessage(issue: TContentIssue): string {
  if (issue.message !== undefined) return issue.message
  const reason: TContentIssueReason = issue.reason
  switch (reason) {
    case 'invalidIdFormat':
      return 'Use só letras minúsculas, números e hífens.'
    case 'duplicateId':
      return 'Identificador repetido no arquivo.'
    case 'idTaken':
      return isCollectionIdPath(issue.path)
        ? 'Já existe uma coleção com este identificador.'
        : 'Já existe uma carta com este identificador.'
    case 'notAnObject':
      return issue.path === '' ? 'Envie um objeto JSON.' : 'Informe um objeto.'
    case 'required':
      switch (lastSegment(issue.path)) {
        case 'name':
          return 'Informe o nome.'
        case 'description':
          return 'Informe a descrição.'
        default:
          return 'Campo obrigatório.'
      }
    case 'unknownField':
      return 'Campo desconhecido.'
    case 'idImmutable':
      return 'O identificador não pode mudar.'
    case 'unknownCardType':
      return 'Tipo de carta desconhecido.'
    case 'unknownStatus':
      return 'Situação desconhecida.'
    case 'repeatedParam':
      return 'Informe a busca uma vez só.'
    case 'unsupportedFormatVersion':
      return 'Versão do arquivo não suportada.'
    case 'collectionMismatch':
      return 'A carta precisa ser da coleção do arquivo.'
    case 'starterDeckCardNotPublished':
      return 'Toda carta do deck pré-pronto precisa estar publicada.'
    case 'invalidReplace':
      return 'Use true ou false.'
    case 'invalidFormat':
      return issue.path === 'cards'
        ? 'Informe a lista de cartas.'
        : 'Formato inválido.'
    case 'unknownCollection':
    case 'duplicateTitle':
    case 'outOfRange':
    case 'urbanZoneRequiresFourArrows':
    case 'missingRequiredAction':
    case 'actionOnlyInUrbanZone':
    case 'basicAttributeCount':
    case 'enhancedAttributeCount':
    case 'synergyAttributeCount':
    case 'duplicateValue':
    case 'effectsNotAllowed':
    case 'effectsRequired':
    case 'onlyForWeapons':
    case 'empty':
    case 'arrowLayoutRequired':
    case 'arrowLayoutNotAllowed':
    case 'tooManyDimensions':
    case 'duplicateName':
    case 'essentialAttributeCount':
    case 'duplicateEssentials':
    case 'unknownCard':
    case 'notAnAttributeCard':
    case 'starterDeckSize':
    case 'starterDeckLockNotMet':
      return CATALOG_MESSAGES[reason]
    default: {
      const _exhaustive: never = reason
      return _exhaustive
    }
  }
}
