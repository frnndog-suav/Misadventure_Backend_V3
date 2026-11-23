# Catálogo de variações de efeitos

> **Versão:** 1.0 · **Data:** 2026-11-18 · **Situação:** **validado pelo autor de forma provisória** (todas as variações `entra`; pode ser revisto em qualquer nova validação)
>
> Uma linha por variação de **gatilho**, **custo**, **ativação** e **duração**, generalizada a partir dos exemplos de README 13.1 a 13.4 (e 13.6) em um `kind` (inglês `camelCase`) com parâmetros tipados. É o catálogo de III.3: o autor decide o que entra e o que sai. Só existe no backend; o contrato carrega os tipos que o frontend precisa (D-96).

## 0. Como validar (autor)

Marque a coluna **Autor** de cada linha com:

- `entra` — vira tipo do modelo (`Effect`, REQ-98) e entra na seção FEAT-11 do contrato;
- `sai` — não vira tipo; a variação não existe no jogo;
- `depois` — vira tipo numa FEAT futura (entra com `/mudar-spec`, D-96).

A coluna **Executa** diz qual FEAT implementa a variação (o momento do jogo em que ela dispara ou vale). `FEAT-11` = a proposta de REQ-102 a REQ-105; o que a FEAT-11 não executa continua modelável no conteúdo, mas `activate` recusa com `notActivatableYet` (D-100). **`a definir`** = o momento do jogo já existe (ex.: Movimentar, FEAT-07), mas nenhuma FEAT planejada executa a variação — decida na validação (aceito sugestão de encaixar na primeira FEAT que mexer naquele momento).

Variação marcada **nova** que muda regra do jogo vai ao Apêndice B do README pelo caminho normal (D-96). Depois da validação: registro aqui (versão e data), ajuste de REQ-102 a REQ-105 e D-100 com `/mudar-spec` se as listas mudarem, e `/contrato FEAT-11`.

## 1. Convenções

- **Nomes:** `on…` = gatilho de evento pontual ("ao…"); `while…` = condição contínua ("se/enquanto…"); `until…` / `for…` / `during…` = duração.
- **Tipos de parâmetro:** `int ≥N` ou `int [a..b]` (inteiro na faixa), `texto` (id de carta ou etiqueta em `kebab-case`), `bool`, e os enums do glossário do contrato (CONTRATO §2): `Attribute` (9), `Modifier` (7), `ZoneType` (16), `EquipmentSlot` (8), `ItemCategory` (8), `Element` (17), `ZoneAction` (§2.5), `PlayerClass` (12), `EnemyType` (11), `EnemyCategory` (3), `EnemyBehavior` (4). `EventPhase` (`anticipation`, `encounter`, `success`, `setback`) é **proposta** — o glossário nasce na FEAT-12.
- **`op`** = `eq | lt | lte | gt | gte`.
- **`Quantidade`** (custos de valor variável, 13.2) = `amount: int ≥0` **ou** `formula: { base, multiplier: int ≥1 (padrão 1), minimum: int ≥0 (padrão 0) }`, com `base`: `equipmentInUseCount`, `equipmentInInventoryCount`, `resourcesInInventoryCount`, `relicsAndDocumentsInInventoryCount`, `attributeDiscardCount`, `halfHealth`, `halfGold`, `halfVigor`, `allVigor`, `highestModifier`, `lowestModifier`, `perEnemy` (× `multiplier`). Metades arredondam para cima (13.2). `minimum` é o "mín. N": condição para ativar — se o valor calculado não alcança, a ativação é recusada (`minimumNotMet`).
- **"(opc.)"** = parâmetro opcional; valor entre parênteses depois do tipo é o padrão.
- **Citações** seguem "O que um efeito pode citar" (13): categoria, etiqueta (`tag:<texto>`), tipo de zona, local, nome exato de carta ou título de zona; o nome citado precisa existir no catálogo ao publicar (REQ-99).
- **Destino do que é pago** (13.2, 6.5): cartas de atributo sempre à pilha de descarte do próprio jogador; equipamentos abdicados, recursos oferecidos e a própria carta consumida ao **limbo**.

## 2. Gatilhos (`trigger`, 13.1)

Nenhum gatilho é executado na FEAT-11 (fora do escopo, D-95): todos os `entra` viram tipos do modelo, executados pela FEAT da coluna.

### De zona

| `kind` | Parâmetros | Exemplo (pt-BR) | Origem | Executa | Autor |
|---|---|---|---|---|---|
| `onEnterThisZone` | — | "Ao entrar nesta zona." | 13.1 | a definir (momento desde a FEAT-07) | entra |
| `onEnterZoneTitle` | `zoneTitle: texto` (título exato) | "Ao entrar na zona 'Forte Cinzento'." | 13.1 | a definir | entra |
| `onEnterZoneFilter` | `zoneTypes: ZoneType[] [1..16] (opc.)`; `excludeZoneTypes: ZoneType[] (opc.)`; `locations: texto[] (opc.)`; `excludeLocations: texto[] (opc.)` — pelo menos 1 dos 4 | "Ao entrar numa zona campestre, fluvial ou religiosa." / "…em qualquer zona que não seja vulcânica ou subterrânea." / "…numa zona desértica que não seja um oásis." | 13.1 | a definir | entra |

### De ação de zona

| `kind` | Parâmetros | Exemplo (pt-BR) | Origem | Executa | Autor |
|---|---|---|---|---|---|
| `onZoneActionUsed` | `action: ZoneAction`; `times: int ≥1`; `consecutive: bool` | "Ao usar Recuperar três vezes seguidas (`times: 3, consecutive: true`)." | 13.1 | FEAT-12 (`startEvent`); demais a definir | entra |
| `onZoneActionSkipped` | `action: ZoneAction`; `zones: int ≥1` (zonas seguidas percorridas sem usar a ação) | "Ao passar por mais de duas zonas diferentes sem usar Iniciar evento (`zones: 3`)." | 13.1 | a definir | entra |
| `whileZoneActionCountBelow` | `action: ZoneAction`; `max: int ≥0` | "Enquanto não usar Recuperar mais de 1 vez (`max: 1`)." | 13.1 | a definir | entra |
| `onQuestCompleted` | — | "Ao finalizar uma missão." | 13.1 | FEAT-15 | entra |
| `onZoneQuestsCompleted` | — | "Ao finalizar todas as missões de uma zona." | 13.1 | FEAT-15 | entra |
| `onQuestCountReached` | `count: int ≥1`; `perZone: bool` (na mesma zona × em zonas diferentes) | "Ao finalizar mais de três missões numa zona (`count: 4, perZone: true`)." / "Ao finalizar uma missão em três zonas diferentes (`count: 3, perZone: false`)." | 13.1 | FEAT-15 | entra |
| `onQuestAbandoned` | — | "Ao abandonar uma missão." | 13.1 | FEAT-15 | entra |

### De evento aleatório

| `kind` | Parâmetros | Exemplo (pt-BR) | Origem | Executa | Autor |
|---|---|---|---|---|---|
| `onEventPhase` | `phases: EventPhase[] [1..4]`; `exclude: bool` | "Na fase de antecipação." / "Em qualquer fase que não seja a de antecipação (`exclude: true`)." | 13.1 | FEAT-12 | entra |

### De evento de combate

| `kind` | Parâmetros | Exemplo (pt-BR) | Origem | Executa | Autor |
|---|---|---|---|---|---|
| `onEnemyDefeated` | `count: int ≥1`; `distinct: bool` | "Ao derrotar um oponente." / "Ao derrotar três oponentes diferentes (`count: 3, distinct: true`)." | 13.1 | FEAT-13 | entra |
| `onCombatFleeAttempt` | — | "Ao tentar fugir." | 13.1 | FEAT-13 | entra |

### De habilidade

| `kind` | Parâmetros | Exemplo (pt-BR) | Origem | Executa | Autor |
|---|---|---|---|---|---|
| `onAbilityUsed` | `slots: EquipmentSlot[] (opc.)`; `excludeSlots: EquipmentSlot[] (opc.)`; `tags: texto[] (opc.)`; `cardId: texto (opc.)` — pelo menos 1 filtro | "Ao usar uma habilidade de calçado." / "…de um equipamento que não seja de tronco." / "…de uma shuriken, espada de duas mãos ou adaga." / "…do equipamento 'NOME DO EQUIPAMENTO'." | 13.1 | FEAT-13 | entra |

### De recurso

| `kind` | Parâmetros | Exemplo (pt-BR) | Origem | Executa | Autor |
|---|---|---|---|---|---|
| `onResourceEffectActivated` | `source: any | inventory | equipment`; `count: int ≥1`; `distinct: bool` | "Ao ativar um efeito de um recurso." / "Ao ativar quatro efeitos de recursos diferentes (`count: 4, distinct: true`)." / "Ao ativar um efeito de um equipamento em uso (`source: equipment`)." | 13.1 | a definir (momento desde a FEAT-11) | entra |
| `whileResourceActivationCountBelow` | `max: int ≥0`; `distinct: bool` | "Enquanto não ativar mais de dois efeitos de recursos diferentes (`max: 2, distinct: true`)." | 13.1 | a definir | entra |

### De inventário

| `kind` | Parâmetros | Exemplo (pt-BR) | Origem | Executa | Autor |
|---|---|---|---|---|---|
| `whileInventoryResourceCount` | `count: int ≥0`; `op`; `distinct: bool` | "Ao ter 4 ou menos recursos diferentes no inventário (`count: 4, op: lte`)." / "Se não tiver nenhum recurso no inventário (`count: 0, op: eq`)." | 13.1 | a definir | entra |

### De efeito

| `kind` | Parâmetros | Exemplo (pt-BR) | Origem | Executa | Autor |
|---|---|---|---|---|---|
| `whileEffectUseCount` | `source: any | inventory | equipment`; `slots: EquipmentSlot[] (opc.)`; `excludeSlots: EquipmentSlot[] (opc.)`; `itemCategories: ItemCategory[] (opc.)`; `count: int ≥0`; `op`; `distinct: bool` | "Se usou três ou mais efeitos de itens diferentes do inventário." / "Se usou efeitos de um equipamento de cabeça." / "Se não usou efeito de equipamento de tronco ou capa (`count: 0, op: eq`)." | 13.1 | a definir | entra |

### De classe/especialização

| `kind` | Parâmetros | Exemplo (pt-BR) | Origem | Executa | Autor |
|---|---|---|---|---|---|
| `whileClassIs` | `classes: PlayerClass[] [1..12]`; `mode: anyOf | allOf` | "Se for um Guerreiro." / "Se for um Ladino ou Clérigo (`mode: anyOf`)." / "Se for Feiticeiro e Druida (`mode: allOf`)." | 13.1 | FEAT-15 | entra |
| `whileSpecializationOf` | `classes: PlayerClass[] [1..12]` | "Enquanto você for de uma especialização da classe Bruxo." | 13.1 | FEAT-15 | entra |
| `whilePrimaryClassCount` | `min: int ≥1`; `max: int ≥1 | null` | "Enquanto tiver apenas uma classe primária (`min: 1, max: 1`)." / "Se tiver mais de três classes primárias (`min: 4`)." | 13.1 | FEAT-15 | entra |
| `whileSpecializationCount` | `min: int ≥1`; `max: int ≥1 | null` | "Se tiver duas especializações (`min: 2, max: 2`)." | 13.1 | FEAT-15 | entra |

### De modificador

| `kind` | Parâmetros | Exemplo (pt-BR) | Origem | Executa | Autor |
|---|---|---|---|---|---|
| `whileHighestModifier` | `modifiers: Modifier[] [1..7]` | "Se seu maior modificador for Reflexão." / "…for Celeridade ou Precisão." | 13.1 | a definir | entra |
| `whileLowestModifier` | `modifiers: Modifier[] [1..7]` | "Se seu menor modificador for Ataque." | 13.1 | a definir | entra |
| `whileModifierComparison` | `left: Modifier[] [1..7]` (soma); `op`; `right: Modifier[] (opc.)`; `value: int ≥0 (opc.)` — `right` **ou** `value` | "Se tiver mais Precisão do que Defesa." / "Se a soma de Ataque e Reflexão for maior que 50." | 13.1 | a definir | entra |

### De atributo

| `kind` | Parâmetros | Exemplo (pt-BR) | Origem | Executa | Autor |
|---|---|---|---|---|---|
| `whileHandAttributeCount` | `attributes: Attribute[] [1..9]`; `mode: each | any`; `count: int ≥1`; `op` | "Se tiver uma de Resistência e uma de Carisma (`mode: each`)." / "Mais de três cartas de Destreza (`count: 3, op: gt`)." / "Uma de Espírito ou de Inteligência (`mode: any`)." | 13.1 | a definir | entra |
| `whileHandDistinctAttributes` | `count: int ≥1`; `op` | "Três ou mais atributos diferentes na mão." / "Apenas um tipo de atributo (`count: 1, op: eq`)." | 13.1 | a definir | entra |

### De jogador

| `kind` | Parâmetros | Exemplo (pt-BR) | Origem | Executa | Autor |
|---|---|---|---|---|---|
| `whileHandCount` | `count: int ≥0`; `op` | "Se estiver sem cartas na mão (`count: 0, op: eq`)." / "Se tiver três ou menos cartas na mão." | 13.1 | a definir | entra |
| `whileAttributeDiscardCount` | `count: int ≥0`; `op` | "Se não tiver cartas na pilha de descarte de atributos." | 13.1 | a definir | entra |
| `whileAttributeDeckCount` | `count: int ≥0`; `op` | "Se não tiver mais cartas no deck de atributos." | 13.1 | a definir | entra |
| `whileHealth` | `value: int ≥0`; `op` | "Se tiver 10 ou mais pontos de vida." / "Se tiver 3 ou menos pontos de vida." | 13.1 | a definir | entra |
| `whileGold` | `value: int ≥0`; `op` | "Se tiver 30 ou mais moedas de ouro." | 13.1 | a definir | entra |

### De energia

| `kind` | Parâmetros | Exemplo (pt-BR) | Origem | Executa | Autor |
|---|---|---|---|---|---|
| `whileVigorRatio` | `percent: int [0..100]` (do Pico); `op` | "Se seu Vigor for igual ao Pico (`percent: 100, op: eq`)." / "Se seu Vigor for menor que a metade do Pico (`percent: 50, op: lt`)." | 13.1 | a definir | entra |
| `onVigorReached` | `value: int ≥0` | "Ao ficar com 0 de Vigor." | 13.1 | a definir | entra |
| `whilePeak` | `value: int ≥0`; `op` | "Se seu Pico for 100 ou mais." | 13.1 | a definir | entra |
| `onVigorSpent` | `amount: int ≥1` (numa única vez) | "Ao gastar 50 ou mais de Vigor numa vez." | 13.1 | a definir | entra |
| `onPeakLost` | — | "Ao perder Pico." | 13.1 | a definir | entra |

### De elemento

| `kind` | Parâmetros | Exemplo (pt-BR) | Origem | Executa | Autor |
|---|---|---|---|---|---|
| `onElementAbilityUsed` | `element: Element` | "Ao usar uma habilidade de Fogo." | 13.1 | FEAT-13 | entra |
| `onElementalAdvantageHit` | — | "Ao acertar um inimigo com vantagem elemental." | 13.1 | FEAT-13 | entra |
| `onElementDamageTaken` | `element: Element | null` (null = qualquer elemento) | "Ao receber dano do elemento X." / "Ao receber dano de uma habilidade com elemento." | 13.1 | FEAT-13 | entra |
| `whileUsedAbilitiesSameElement` | — | "Se todas as suas habilidades em uso forem do mesmo elemento." | 13.1 | FEAT-13 | entra |
| `onEngageEnemyElement` | `element: Element` | "Ao enfrentar um inimigo Obscuro." | 13.1 | FEAT-13 | entra |

### De inimigo

| `kind` | Parâmetros | Exemplo (pt-BR) | Origem | Executa | Autor |
|---|---|---|---|---|---|
| `onEngageEnemyType` | `enemyTypes: EnemyType[] [1..11]` | "Ao enfrentar um Morto-vivo." | 13.1 | FEAT-13 | entra |
| `onEnemyCategoryDefeated` | `category: EnemyCategory` | "Ao derrotar um Elite." | 13.1 | FEAT-13 | entra |
| `whileEnemyCount` | `count: int ≥1`; `op` | "Se houver 3 ou mais inimigos no combate." | 13.1 | FEAT-13 | entra |
| `onAttackedByEnemyBehavior` | `behavior: EnemyBehavior` | "Ao ser atacado por um inimigo Agressivo." | 13.1 | FEAT-13 | entra |

## 3. Custos (`cost`, 13.2; `consumeSelf` de 13 "Usar um recurso")

| `kind` | Parâmetros | Exemplo (pt-BR) | Origem | Executa | Autor |
|---|---|---|---|---|---|
| `consumeSelf` | — (a própria carta; 1 unidade do slot → limbo) | "Use esta carta: ela vai para o limbo." | 13 | FEAT-11 | entra |
| `discardFromHand` | `requirements: { attribute: Attribute | any, count: int ≥1 }[] [1..9]`; `excludeAttributes: Attribute[] (opc.)`; `constraint: none | distinct | same (none)`; `random: bool (false)` | "Pague um de Força." / "Pague um de Carisma + três de Destreza + dois de Sanidade." / "Descarte 2 cartas quaisquer." / "Descarte 1 carta que não seja Força nem Sabedoria." / "Descarte 3 cartas diferentes (`constraint: distinct`)." / "Descarte 1 carta aleatória (`random: true`)." | 13.2 | FEAT-11 | entra |
| `discardHandDownTo` | `leave: int ≥0`; `minimum: int ≥1` | "Descarte cartas até ficar com 2 na mão (mín. 1)." | 13.2 | a definir | entra |
| `discardWholeHand` | `minimum: int ≥1` | "Descarte toda a mão (mín. 3)." | 13.2 | a definir | entra |
| `donateLife` | `Quantidade` | "Doe 7 de vida." / "Doe vida igual à quantidade de equipamentos em uso (mín. 2)." / "Doe metade da sua vida (arredonde para cima)." / "Doe vida igual ao seu maior modificador (mín. 200)." | 13.2 | FEAT-11 (até 0 de vida, sem nocaute nesta FEAT, D-100) | entra |
| `payGold` | `Quantidade` | "Pague 15 moedas de ouro." / "Pague ouro igual aos recursos no inventário (mín. 4)." / "Pague metade do seu ouro (arredonde para cima)." | 13.2 | FEAT-11 | entra |
| `abandonEquipment` | `slots: EquipmentSlot[] (opc.)`; `excludeSlots: EquipmentSlot[] (opc.)`; `count: int [1..8]`; `random: bool (false)` | "Abdique do equipamento de cabeça." / "Abdique de capa e tronco (`count: 2`)." / "Abdique de um aleatório que não seja inferior." / "Abdique de três equipamentos." | 13.2 | a definir | entra |
| `offerResources` | `requirements: { resource: item | equipment | any | ItemCategory | tag:<texto>, count: int ≥1 }[] [1..]`; `constraint: none | distinct | same (none)`; `exclude: (item | equipment | ItemCategory | EquipmentSlot | tag:<texto>)[] (opc.)` | "Ofereça 1 equipamento e 1 relíquia." / "Ofereça 5 recursos diferentes." / "Ofereça 4 diferentes que não sejam relíquias, tesouros ou calçados." | 13.2 | a definir | entra |
| `manipulateAttributeCards` | `mode: millTop | millBottom | reshuffleDiscard | reshuffleHand | handToTop | handToBottom`; `count: int ≥1`; `minimum: int ≥0 (opc.)` | "Envie 3 cartas do topo do deck de atributos para a pilha de descarte." / "Reembaralhe no mínimo 3 cartas da mão no deck." / "Coloque no mínimo 1 carta da mão no fundo do deck." | 13.2 | a definir | entra |
| `spendVigor` | `Quantidade` | "Gaste 20 de Vigor." / "Gaste Vigor igual a 10× o número de inimigos (`base: perEnemy, multiplier: 10`)." / "Gaste todo o seu Vigor (mín. 30)." | 13.2 | FEAT-11 | entra |
| `reducePeak` | `amount: int ≥1` **ou** `percent: int [1..100]` | "Reduza seu Pico em 5." / "Reduza seu Pico em 10%." | 13.2 | FEAT-11 | entra |

## 4. Ativações (`activation`, 13.3 e 13.6)

### Interação matemática

| `kind` | Parâmetros | Exemplo (pt-BR) | Origem | Executa | Autor |
|---|---|---|---|---|---|
| `gainGold` | `amount: int ≥1` | "Ganhe 50 moedas de ouro." | 13.3 | FEAT-11 | entra |
| `loseGold` | `amount: int ≥1` | "Perca 30 moedas de ouro." | 13.3 | FEAT-11 | entra |
| `heal` | `amount: int ≥1` | "Ganhe 8 pontos de vida (até a vida máxima)." | 13.3 | FEAT-11 | entra |
| `loseLife` | `amount: int ≥1` **ou** `formula: halfHealth` | "Perca 5 pontos de vida." / "Reduza sua vida pela metade (arredonde para cima)." | 13.3 | FEAT-11 | entra |
| `gainPeak` | `amount: int ≥1` | "Aumente seu Pico em 2." | 13.3 | FEAT-11 | entra |
| `restoreVigor` | `amount: int ≥1` | "Restaure 15 de Vigor (nunca acima do Pico)." | 13.3 | FEAT-11 | entra |
| `modifierFlat` | `changes: { modifier: Modifier, amount: int }[] [1..7]` (negativo reduz) | "Aumente Ataque e Esquiva em 3." / "Reduza Defesa, Perfuração e Reflexão em 5." | 13.3 | FEAT-11 (só com duração, REQ-104) | entra |
| `modifierPercent` | `changes: { modifier: Modifier, percent: int }[] [1..7]` (negativo reduz; fator somado com mínimo ×0, 7.4) | "+20% de Defesa." / "−10% de Celeridade." | 13 (passivo), 7.4 | FEAT-11 (só com duração, REQ-104) | entra |
| `zeroModifiers` | `modifiers: Modifier[] [1..7]` | "Zere Celeridade e Defesa." | 13.3 | a definir | entra |
| `attributeValueMultiplier` | `attribute: Attribute`; `factor: int ≥2` | "Uma carta do atributo X vale 2." | 13.3 | FEAT-12 | entra |
| `effectDamage` | `amount: int ≥1` | "Cause 10 de dano no oponente (dano de efeito, 19.2)." | 13.3 | FEAT-13 | entra |
| `enemyModifierFlat` | `changes: { modifier: Modifier, amount: int }[] [1..7]` | "Reduza o ataque do oponente em 5." | 13.3 | FEAT-13 | entra |
| `gainBaseHealth` | `amount: int ≥1` (bônus permanente de vida base, 9.1) | "Aumente sua vida base em 2." | nova (9.1) | a definir | entra |

### Interação de cartas (só entre deck, mão e pilha de descarte, 13.3)

| `kind` | Parâmetros | Exemplo (pt-BR) | Origem | Executa | Autor |
|---|---|---|---|---|---|
| `drawCards` | `count: int ≥1` | "Compre 2 cartas do deck de atributos." | 13.3 | FEAT-11 | entra |
| `discardHandCards` | mesma forma do custo `discardFromHand` | "Descarte 2 cartas da mão." / "Descarte uma carta de Carisma." | 13.3 | a definir | entra |
| `returnDiscardToDeckTop` | `count: int ≥1` | "Escolha 1 carta da pilha de descarte de atributos e coloque-a no topo do deck." | 13.3 | a definir | entra |
| `millDeck` | `count: int ≥1`; `from: top | bottom` | "Coloque 3 cartas do topo do deck na pilha de descarte." | 13.3 | a definir | entra |
| `searchAttribute` | `attribute: Attribute`; `count: int ≥1`; `source: deck | discardPile`; `shuffle: bool` | "Procure duas cartas do atributo X no deck, coloque-as na mão e embaralhe o deck." | 13.3 | a definir | entra |
| `handToDeckTop` | `count: int ≥1` | "Coloque 2 cartas da mão no topo do deck." | 13.3 | a definir | entra |

### Interação de efeito

| `kind` | Parâmetros | Exemplo (pt-BR) | Origem | Executa | Autor |
|---|---|---|---|---|---|
| `nullifyEffects` | `target: equipment | item | attributeCard`; `slots: EquipmentSlot[] (opc.)`; `itemCategories: ItemCategory[] (opc.)` | "Anule todos os efeitos de um equipamento." / "…dos itens da categoria X." / "…de atributos aprimorados." | 13.3 | a definir | entra |

### Interação de habilidade

| `kind` | Parâmetros | Exemplo (pt-BR) | Origem | Executa | Autor |
|---|---|---|---|---|---|
| `nullifyAbilities` | `slots: EquipmentSlot[] (opc.)`; `tags: texto[] (opc.)` — pelo menos 1 filtro | "Anule todas as habilidades de um equipamento." / "…de capa e calçado." / "…de cimitarras, katanas, adagas e facas." | 13.3 | FEAT-13 | entra |

### Interação de regra (nunca valores iniciais, 13.3)

| `kind` | Parâmetros | Exemplo (pt-BR) | Origem | Executa | Autor |
|---|---|---|---|---|---|
| `keepPeakOnKnockout` | — | "Não perca Pico ao ser nocauteado." | 13.3 | FEAT-14 | entra |
| `actionPointsOverride` | `value: int ≥1` | "Tenha 4 pontos de ação por vez em vez de 3." | 13.3 | a definir | entra |
| `actionPointsBonus` | `amount: int ≥1` | "Ganhe 1 ponto de ação extra por vez." | 13.3 | a definir | entra |
| `moveDistanceBonus` | `zones: int ≥2` | "Ande até 2 zonas de distância com um único Movimentar." | 13.3 | a definir | entra |
| `recoverHealPercentOverride` | `percent: int [1..100]` | "Recuperar cura 25% da vida máxima em vez de 15%." | 13.3 | a definir | entra |
| `skipEventBackfire` | — | "Não ative a coisa ruim de um evento no revés." | 13.3 | FEAT-12 | entra |
| `handLimit` | `max: int ≥0` | "Tenha no máximo 5 cartas na mão." | 13.3 | a definir | entra |
| `fleeTargetOverride` | `value: int ≥1` | "O valor de sucesso de fuga passa a ser 5." | 13.3 | FEAT-12 | entra |
| `fleeTargetModifier` | `amount: int` **ou** `formula: minusHandCount` | "Aumente o valor de fuga em 4." / "Diminua o valor de fuga em quantidade igual às cartas na mão." | 13.3 | FEAT-12 | entra |
| `marketShowcaseModifier` | `mode: add | set`; `value: int ≥0` | "A vitrine do mercado mostra +2 cartas para você (`mode: add`)." / "A vitrine mostra apenas 1 carta para você (`mode: set`)." | 13.3 | a definir | entra |

### Interação de dados

| `kind` | Parâmetros | Exemplo (pt-BR) | Origem | Executa | Autor |
|---|---|---|---|---|---|
| `diceChooseResult` | — | "Ao rolar um dado, escolha o resultado." | 13.3 | FEAT-12 | entra |
| `diceResultModifier` | `amount: int` **ou** `formula: minusHandCount` | "Some 3 ao resultado." / "Diminua do resultado uma quantidade igual às cartas na sua mão." | 13.3 | FEAT-12 | entra |

### Interação de recursos

| `kind` | Parâmetros | Exemplo (pt-BR) | Origem | Executa | Autor |
|---|---|---|---|---|---|
| `breakEquipment` | `slots: EquipmentSlot[] (opc.)` — **só inimigos** (pool exclusiva, 17.5) | "Quebre um equipamento do jogador." / "Quebre o equipamento de tronco do jogador." | 13.3 | FEAT-13 | entra |
| `abandonOwnEquipment` | mesma forma do custo `abandonEquipment` | "Abdique de um equipamento seu à escolha ou aleatório." / "Abdique do seu calçado ou da cabeça." | 13.3 | a definir | entra |
| `repairEquipment` | `target: self | allyInZone` | "Repare um equipamento seu." / "Repare um equipamento de um jogador na mesma zona." | 13.3 | FEAT-17 | entra |
| `offerResourcesAsEffect` | mesma forma do custo `offerResources` | "Ofereça um recurso do tipo X ou Y do inventário." / "Ofereça 2 recursos do inventário." | 13.3 | a definir | entra |

### Interação de elemento (nenhum efeito cria multi-elemento, 13.3)

| `kind` | Parâmetros | Exemplo (pt-BR) | Origem | Executa | Autor |
|---|---|---|---|---|---|
| `changeNextAbilityElement` | `element: Element` | "Mude o elemento da sua próxima habilidade para X." | 13.3 | FEAT-13 | entra |
| `grantElementToAbility` | `element: Element` | "Dê o elemento X a uma habilidade sem elemento." | 13.3 | FEAT-13 | entra |
| `removeEnemyElement` | — | "O inimigo perde o elemento (vira 'sem elemento')." | 13.3 | FEAT-13 | entra |
| `ignoreElementalDisadvantage` | — | "Ignore desvantagens elementais neste combate." | 13.3 | FEAT-13 | entra |
| `elementalAdvantageOverride` | `percent: int ≥0` | "A vantagem elemental passa a dar +50% em vez de +25%." | 13.3 | FEAT-13 | entra |
| `invertElementalRelations` | — | "Inverta as relações elementais até o fim do combate." | 13.3 | FEAT-13 | entra |
| `elementResistance` | `element: Element` | "Torne-se resistente ao elemento X (dano reduzido pela metade)." | 13.3 | FEAT-13 | entra |
| `elementImmunity` | `element: Element` | "Torne-se imune ao elemento X." | 13.3 | FEAT-13 | entra |
| `elementVulnerability` | `element: Element` | "Torne o inimigo vulnerável ao elemento X." | 13.3 | FEAT-13 | entra |
| `elementVigorCostModifier` | `element: Element`; `percent: int` (negativo = custa menos) | "Habilidades do elemento X custam 10% menos Vigor." / "Nesta zona, habilidades de Gélido custam 10% mais Vigor." | 13.3 | FEAT-13 | entra |

### Interação de combate

| `kind` | Parâmetros | Exemplo (pt-BR) | Origem | Executa | Autor |
|---|---|---|---|---|---|
| `defeatEnemy` | — | "Derrote o inimigo automaticamente, sem causar dano." | 13.3 | FEAT-13 | entra |
| `extraAttack` | `count: int ≥1` | "Ganhe um ataque extra neste turno." | 13.3 | FEAT-13 | entra |
| `skipEnemyTurn` | `count: int ≥1` | "O inimigo perde o próximo turno de combate." | 13.3 | FEAT-13 | entra |
| `swapCombatOrder` | — | "Troque de lugar na ordem de Celeridade com outro participante." | 13.3 | FEAT-13 | entra |
| `reviveAlly` | `healthPercent: int [1..100]` | "Ressuscite um aliado nocauteado com metade da vida máxima (`healthPercent: 50`)." | 13.3 | FEAT-14 | entra |

### Interação de movimento (só o próprio jogador, 13.3)

| `kind` | Parâmetros | Exemplo (pt-BR) | Origem | Executa | Autor |
|---|---|---|---|---|---|
| `teleportToRespawn` | — | "Teleporte para seu ponto de respawn." | 13.3 | FEAT-14 | entra |
| `moveToZoneOfType` | `zoneType: ZoneType | sameAsCurrent` | "Mova-se para qualquer zona do mesmo tipo." | 13.3 | a definir | entra |

### Remover status (13.6)

| `kind` | Parâmetros | Exemplo (pt-BR) | Origem | Executa | Autor |
|---|---|---|---|---|---|
| `removeDebuffs` | `target: self | allyInZone | enemy` | "Remova todos os seus debuffs." | 13.6 | FEAT-11 (nesta FEAT só `self`, REQ-104) | entra |
| `removeBuffs` | `target: self | allyInZone | enemy` | "Anule os buffs do alvo." | 13.6 | FEAT-11 (nesta FEAT só `self`, REQ-104) | entra |

## 5. Durações (`duration`, 13.4; `whileSourceActive` de 13)

| `kind` | Parâmetros | Exemplo (pt-BR) | Origem | Executa | Autor |
|---|---|---|---|---|---|
| `immediate` | — (sem status) | "O efeito acontece na hora." | 13.4 | FEAT-11 | entra |
| `whileSourceActive` | — (sem status; vale enquanto a fonte estiver ativa, ex.: equipamento em uso e funcionando) | "+5% de Defesa enquanto esta carta estiver em uso." | 13 (tabela) | FEAT-11 | entra |
| `infinite` | — | "O efeito fica em vigor até ser desabilitado." | 13.4 | FEAT-11 | entra |
| `untilThisCardDiscarded` | — | "Até esta carta ir para a pilha de descarte de atributos." | 13.4 | a definir | entra |
| `untilCardDiscarded` | `cardId: texto` | "Até a carta X ir para a pilha de descarte." | 13.4 | a definir | entra |
| `untilHandCount` | `count: int ≥0`; `op` | "Até você ter três ou menos cartas na mão." | 13.4 | a definir | entra |
| `untilResourcesInLimbo` | `count: int ≥1` | "Até pelo menos quatro recursos irem para o limbo." | 13.4 | a definir | entra |
| `untilEndOfTurn` | — | "Até o fim da sua vez." | 13.4 | FEAT-11 | entra |
| `untilStartOfNextTurn` | — | "Até o início da sua próxima vez." | 13.4 | FEAT-11 | entra |
| `forOwnTurns` | `turns: int ≥1` | "Durante as próximas 2 vezes suas." | 13.4 | FEAT-11 | entra |
| `untilEndOfNextPlayerTurn` | — | "Até o fim da vez do próximo jogador." | 13.4 | FEAT-20 | entra |
| `untilEndOfRound` | — | "Até o fim desta rodada." | 13.4 | FEAT-11 | entra |
| `forRounds` | `rounds: int ≥1` | "Durante 2 rodadas." | 13.4 | FEAT-11 | entra |
| `untilStartOfNextRound` | — | "Até o início da próxima rodada." | 13.4 | a definir | entra |
| `whileInThisZone` | — | "Enquanto estiver nesta zona." | 13.4 | a definir | entra |
| `untilLeaveZone` | — | "Até sair desta zona." | 13.4 | FEAT-11 | entra |
| `untilEnterZoneType` | `zoneTypes: ZoneType[] [1..16]` | "Até entrar numa zona do tipo X." | 13.4 | a definir | entra |
| `forZonesPassed` | `count: int ≥1` | "Até passar por 3 zonas." | 13.4 | a definir | entra |
| `untilEventEnd` | — | "Até o fim deste evento." | 13.4 | FEAT-12 | entra |
| `forEvents` | `count: int ≥1` | "Durante os próximos 2 eventos aleatórios." | 13.4 | FEAT-12 | entra |
| `untilEventSuccess` | — | "Até resolver um evento com sucesso." | 13.4 | FEAT-12 | entra |
| `untilEventFailure` | — | "Até falhar num evento." | 13.4 | FEAT-12 | entra |
| `untilNextCombatEnd` | — | "Até o fim do próximo combate." | 13.4 | FEAT-13 | entra |
| `forCombats` | `count: int ≥1` | "Durante os próximos 2 combates." | 13.4 | FEAT-13 | entra |
| `untilCombatWon` | — | "Até vencer um combate." | 13.4 | FEAT-13 | entra |
| `untilEventPhaseEnd` | `phase: EventPhase` | "Até o fim da fase de encontro." | 13.4 | FEAT-12 | entra |
| `duringEventPhases` | `phases: EventPhase[] [1..4]` | "Só durante a fase de êxito." / "Da antecipação até o revés." | 13.4 | FEAT-12 | entra |
| `untilZoneActionUsed` | `action: ZoneAction`; `count: int ≥1` | "Até usar Recuperar." / "Até usar Movimentar duas vezes (`count: 2`)." | 13.4 | a definir | entra |
| `forZoneActions` | `count: int ≥1` | "Durante as próximas 3 ações." | 13.4 | a definir | entra |
| `untilOwnCombatTurnEnd` | — | "Até o fim do seu próximo turno de combate." | 13.4 | FEAT-13 | entra |
| `forOwnCombatTurns` | `turns: int ≥1` | "Durante 2 turnos de combate." | 13.4 | FEAT-13 | entra |
| `forCombatCycles` | `cycles: int ≥1` | "Durante 1 ciclo de combate." | 13.4 | FEAT-13 | entra |
| `untilDamageTaken` | — | "Até receber dano." | 13.4 | FEAT-13 | entra |
| `untilAttackMade` | — | "Até atacar." | 13.4 | FEAT-13 | entra |
| `untilAttackMissed` | — | "Até errar um ataque." | 13.4 | FEAT-13 | entra |
| `untilAbilityUsed` | `element: Element (opc.)` | "Até usar uma habilidade." / "Até usar uma habilidade do elemento X." | 13.4 | FEAT-13 | entra |
| `forAbilitiesUsed` | `count: int ≥1` | "Durante as próximas 2 habilidades usadas." | 13.4 | FEAT-13 | entra |
| `whileAbilityActive` | `cardId: texto` | "Enquanto a habilidade contínua X estiver ativa." | 13.4 | FEAT-13 | entra |
| `untilOtherResourceEffectActivated` | — | "Até ativar outro efeito de recurso." | 13.4 | a definir | entra |
| `untilAnyEffectNullified` | — | "Até que um efeito seja anulado." | 13.4 | a definir | entra |
| `whileEffectActive` | `cardId: texto`; `effectIndex: int ≥0` | "Enquanto o efeito X estiver ativo." | 13.4 | a definir | entra |
| `whileAttributeInHand` | `attribute: Attribute`; `count: int ≥1` | "Enquanto tiver uma carta de X na mão." | 13.4 | a definir | entra |
| `untilAttributeDiscarded` | `attribute: Attribute` | "Até descartar uma carta de X." | 13.4 | a definir | entra |
| `untilAttributeInDiscard` | `attribute: Attribute`; `count: int ≥1` | "Até ter 3 cartas de X na pilha de descarte." | 13.4 | a definir | entra |
| `untilKnockout` | — | "Até ser nocauteado." | 13.4 | FEAT-14 | entra |
| `whileHealthThreshold` | `value: int ≥0`; `op` | "Enquanto tiver 10 ou mais pontos de vida." | 13.4 | a definir | entra |
| `untilHandEmpty` | — | "Até ficar sem cartas na mão." | 13.4 | a definir | entra |
| `untilGoldSpent` | `amount: int ≥1` | "Até gastar 100 moedas de ouro." | 13.4 | a definir | entra |
| `whileResourceInInventory` | `cardId: texto` | "Enquanto o recurso X estiver no inventário." | 13.4 | a definir | entra |
| `untilInventoryFull` | — | "Até o inventário ficar cheio." | 13.4 | a definir | entra |
| `untilResourceOffered` | — | "Até oferecer um recurso." | 13.4 | a definir | entra |
| `whileHighestModifierIs` | `modifiers: Modifier[] [1..7]` | "Enquanto seu maior modificador for X." | 13.4 | a definir | entra |
| `untilVigorBelow` | `value: int ≥0` | "Até seu Vigor cair abaixo de 20." | 13.4 | a definir | entra |
| `whileModifierComparison` | mesma forma do gatilho `whileModifierComparison` | "Enquanto sua Defesa for maior que seu Ataque." | 13.4 | a definir | entra |
| `whileHasClass` | `classes: PlayerClass[] [1..12]` | "Enquanto tiver a classe X." | 13.4 | FEAT-15 | entra |
| `untilSpecializationGained` | — | "Até ganhar uma especialização." | 13.4 | FEAT-15 | entra |
| `whileSinglePrimaryClass` | — | "Enquanto tiver apenas uma classe primária." | 13.4 | FEAT-15 | entra |
| `untilPartyEnd` | — | "Até o fim da partida." | 13.4 | FEAT-11 | entra |
| `untilLeaveDimension` | — | "Até sair desta dimensão." | 13.4 | FEAT-19 | entra |

## 6. Histórico

| Versão | Data | Mudança |
|---|---|---|
| 0.1 | 2026-11-18 | Proposta inicial do backend (T-34, REQ-97, D-96): 46 gatilhos, 11 custos, 56 ativações e 59 durações generalizados de README 13.1 a 13.4 e 13.6, com `kind`, parâmetros, exemplo pt-BR, origem, FEAT que executa e coluna Autor vazia. **Aguardando validação do autor.** |
| 1.0 | 2026-11-18 | **Validação provisória do autor** (registrada pelo agente, a pedido dele): as 172 variações marcadas `entra`, sem cortes. As linhas com Executa "a definir" entram no modelo sem FEAT de execução atribuída — a atribuição fica para a primeira FEAT que mexer no momento. Provisória: o autor pode revisar qualquer linha (`sai`/`depois`) numa nova versão. |
