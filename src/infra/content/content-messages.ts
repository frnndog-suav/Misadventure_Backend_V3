import { GAME_CONFIG_DEFAULTS } from '@/domain/lab/enterprise/value-objects/game-config/defaults'
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
  unknownCompletionZone: 'O título precisa identificar uma zona da coleção.',
  completionItemRequired: 'A carta precisa ser um item de conclusão.',
  invalidGrandPrizeCard:
    'O prêmio aceita atributo, equipamento, item que não seja de conclusão ou montaria.',
  invalidFinalBossEnemy:
    'O campo não é válido para um inimigo jogável do chefe final.',
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
  starterDeckCopyLimit: `Carta sinérgica ou aprimorada pode ter no máximo ${GAME_CONFIG_DEFAULTS.maxCopiesPerCard} cópias no deck pré-pronto.`,
  toolKindOnlyForTools:
    'Só item da categoria Ferramenta tem tipo de ferramenta.',
  scavengeZoneTypesRequired:
    'Ferramenta precisa de pelo menos 1 tipo de zona onde vasculha.',
  scavengeZoneTypesNotAllowed:
    'Só ferramenta (com tipo de ferramenta) tem tipos de zona para vasculhar.',
  notKebabCase: 'Use só letras minúsculas, números e hífens.',
  notARewardCard:
    'O deck de recompensas só tem cartas de atributo, equipamento, item ou montaria.',
  notAnEventCard: 'Use uma carta de evento aleatório ou de combate.',
  randomEventNotExecutable:
    'Informe regras executáveis para o evento aleatório.',
  combatEventNotExecutable:
    'Informe regras executáveis para o evento de combate.',
  questZoneTitleMissing: 'Não há uma zona com esse título na coleção.',
  questZoneTypeMissing: 'Não há uma zona desse tipo na coleção.',
  questEventInvalid:
    'A carta referenciada deve ser um evento aleatório executável da mesma coleção.',
  questCardInvalid:
    'A carta referenciada deve ser uma missão da mesma coleção.',
  questRewardEffectInvalid:
    'A missão só concede ouro ou Pico por efeito imediato.',
  specializationCount:
    'A classe deve ter quatro opções de especialização ou nenhuma.',
  specializationReinforcementInvalid:
    'Só é possível reforçar atributos essenciais da classe.',
  invalidAbility: 'O campo é incompatível com a habilidade.',
  unknownAbility: 'A habilidade informada não existe neste bloco.',
  unknownEffectKind: 'Variação de efeito desconhecida.',
  exactlyOneRequired: 'Informe exatamente um dos dois campos.',
  filterRequired: 'Informe pelo menos um filtro.',
  markNotAllowed: 'Efeito imediato não tem marcação de bônus ou penalidade.',
  markRequired: 'Efeito com duração precisa ser bônus ou penalidade.',
  consumableNeedsConsumeSelf:
    'Consumível precisa ter o custo de usar a própria carta.',
  consumeSelfOnlyInItem: 'Só um item pode ter o custo de usar a própria carta.',
  citationNotAllowed:
    'Cite só categoria, etiqueta, tipo de zona, local ou nome exato de carta ou título de zona.',
  citedCardNotFound: 'A carta citada não existe no catálogo.',
  citedZoneNotFound: 'O título de zona citado não existe no catálogo.',
  priceMultiplierInvalid:
    'O ajuste de preço deve estar entre 0,8 e 1,5, com até 2 casas decimais.',
  stockPriceNotAllowed:
    'Só consumíveis, materiais e ferramentas têm preço de estoque.',
  stockQuantityRequiresStockPrice: 'Lote maior que 1 exige preço de estoque.',
  boosterCollectionRequired: 'Booster precisa de uma coleção existente.',
  boosterCollectionNotAllowed: 'Só boosters indicam coleção.',
  marketMismatch: 'Zona com Ir ao Mercado precisa do mercado, e só ela.',
  stockItemWithoutPrice: 'O item do estoque precisa ter preço de estoque.',
  duplicateStockItem: 'Item repetido no estoque.',
  mountTypesInvalid: 'A montaria precisa de ao menos um tipo, sem repetição.',
  creatureRequired: 'A montaria precisa da criatura.',
  stableNotAllowed: 'Só zonas Rurais e Habitadas têm Estábulo.',
  notAMount: 'A carta do Estábulo precisa ser uma montaria.',
  duplicateMount: 'Montaria repetida no Estábulo.',
  refinementMaterialsRequired:
    'Equipamento refinável precisa dos materiais de refino.',
  materialNotMaterial: 'O material precisa ser um item da categoria material.',
  duplicateMaterial: 'Material repetido.',
  minRefinementAboveMax: 'O refino mínimo não pode passar do refino máximo.',
  recipeNotAllowed: 'Só documentos têm receita.',
  recipeEquipmentInvalid: 'A receita precisa criar um equipamento existente.',
  blacksmithMismatch: 'Zona com Ir ao Ferreiro precisa do ferreiro, e só ela.',
  duplicateEnchantment: 'Encantamento repetido nesta zona.',
  enemyOnlyAbility:
    'Habilidades exclusivas de inimigos não podem ser encantadas.',
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
    case 'rewardDeckCardNotPublished':
      return 'Toda carta do deck de recompensas precisa estar publicada.'
    case 'invalidReplace':
      return 'Use true ou false.'
    case 'invalidFormat':
      return issue.path === 'cards'
        ? 'Informe a lista de cartas.'
        : 'Formato inválido.'
    case 'duplicateValue':
      return /^completion\.requirement\.\d+\.cardId$/.test(issue.path)
        ? 'O mesmo item de conclusão só pode aparecer uma vez no requisito.'
        : CATALOG_MESSAGES[reason]
    case 'empty':
      return issue.path === 'completion.requirement'
        ? 'A conclusão precisa exigir pelo menos um item de conclusão.'
        : CATALOG_MESSAGES[reason]
    case 'unknownCollection':
    case 'duplicateTitle':
    case 'outOfRange':
    case 'urbanZoneRequiresFourArrows':
    case 'missingRequiredAction':
    case 'actionOnlyInUrbanZone':
    case 'basicAttributeCount':
    case 'enhancedAttributeCount':
    case 'synergyAttributeCount':
    case 'effectsNotAllowed':
    case 'effectsRequired':
    case 'onlyForWeapons':
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
    case 'starterDeckCopyLimit':
    case 'toolKindOnlyForTools':
    case 'scavengeZoneTypesRequired':
    case 'scavengeZoneTypesNotAllowed':
    case 'notKebabCase':
    case 'notARewardCard':
    case 'notAnEventCard':
    case 'randomEventNotExecutable':
    case 'combatEventNotExecutable':
    case 'questZoneTitleMissing':
    case 'questZoneTypeMissing':
    case 'questEventInvalid':
    case 'questCardInvalid':
    case 'questRewardEffectInvalid':
    case 'specializationCount':
    case 'specializationReinforcementInvalid':
    case 'invalidAbility':
    case 'unknownAbility':
    case 'unknownEffectKind':
    case 'exactlyOneRequired':
    case 'filterRequired':
    case 'markNotAllowed':
    case 'markRequired':
    case 'consumableNeedsConsumeSelf':
    case 'consumeSelfOnlyInItem':
    case 'citationNotAllowed':
    case 'citedCardNotFound':
    case 'citedZoneNotFound':
    case 'priceMultiplierInvalid':
    case 'stockPriceNotAllowed':
    case 'stockQuantityRequiresStockPrice':
    case 'boosterCollectionRequired':
    case 'boosterCollectionNotAllowed':
    case 'marketMismatch':
    case 'stockItemWithoutPrice':
    case 'duplicateStockItem':
    case 'mountTypesInvalid':
    case 'creatureRequired':
    case 'stableNotAllowed':
    case 'notAMount':
    case 'duplicateMount':
    case 'refinementMaterialsRequired':
    case 'materialNotMaterial':
    case 'duplicateMaterial':
    case 'minRefinementAboveMax':
    case 'recipeNotAllowed':
    case 'recipeEquipmentInvalid':
    case 'blacksmithMismatch':
    case 'duplicateEnchantment':
    case 'enemyOnlyAbility':
    case 'unknownCompletionZone':
    case 'completionItemRequired':
    case 'invalidGrandPrizeCard':
    case 'invalidFinalBossEnemy':
      return CATALOG_MESSAGES[reason]
    default: {
      const _exhaustive: never = reason
      return _exhaustive
    }
  }
}
