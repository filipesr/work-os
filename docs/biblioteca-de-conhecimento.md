# Biblioteca de Conhecimento — fundamentos & decisões do workos

> **Propósito.** Este é o documento-âncora que **defende cada página, componente e
> métrica** do workos. Cada escolha de gestão (o que medir, como exibir, o que
> deliberadamente NÃO fazer) está ligada aqui a um **princípio fundamentado** e à
> sua **fonte**. Use-o para: (a) justificar uma tela numa reunião; (b) decidir uma
> feature nova sem contradizer o que já foi estabelecido; (c) não reabrir debates
> já resolvidos.
>
> **Como está organizado:** §1 os princípios inegociáveis (a "constituição");
> §2 o glossário de métricas; §3 o mapa de defesa (tela/componente → fundamento);
> §4 as decisões de arquitetura registradas; §5 o que NÃO fazemos e por quê;
> §6 as fontes.
>
> **Fontes de research (verificadas por deep-research adversarial):**
> [gestão de fluxo & pessoas](./pesquisa-gestao-fluxo-e-pessoas.md) ·
> [medição de desempenho criativo](./pesquisa-medicao-desempenho-criativo.md) ·
> [qualidade & retrabalho](./pesquisa-qualidade-e-retrabalho.md).
> Referências de implementação:
> [métricas de fluxo & forecasting](./flow-metrics-and-forecasting.md) ·
> [cockpit de saúde do time](./admin-team-health-cockpit.md).

---

## 1. Os princípios inegociáveis

Estes são load-bearing: qualquer feature nova precisa passar por eles. Cada um tem
**afirmação → argumentação → fonte → o que exige/proíbe**.

### P1 — Informacional, nunca motivacional (a regra mestra)

**Afirmação.** Todo sinal do workos existe para **informar** decisão (coaching,
staffing, previsão, triagem) — nunca para **premiar/punir** (score composto,
ranking público, vínculo a remuneração).
**Argumentação.** Medir um indicador de desempenho tende a **degradá-lo** —
"dysfunction é a regra, não a exceção", sobretudo com trabalhadores do
conhecimento. Uso motivacional (mudar comportamento via prêmio) e informacional
(insight de processo) são **incompatíveis**; e _nada num dado é inerentemente um
ou outro — só o USO decide_, então quem projeta é "impotente" para impedir que
uma métrica informacional vire punição. A defesa é manter o uso informacional e
os sinais **separados** (nunca um número composto).
**Fonte.** Austin, _Measuring and Managing Performance in Organizations_ (2ª rodada, verificado 3-0).
**Exige/proíbe.** PROÍBE: score composto único, leaderboard, pay-link, bloquear
ação com base num sinal. EXIGE: dimensões separadas lidas por exceção.

### P2 — Variação é do sistema, não da pessoa

**Afirmação.** A maior parte da variação de desempenho vem do **sistema**
(processo, cliente, dependências), não do indivíduo. Responsabilizar pessoa é
seguro só para **coaching**, nunca para ranking/pay, e só depois de confirmar que
o sinal **excede o ruído** do sistema.
**Argumentação.** Deming: ~94% da variação é common-cause (sistema); Red Bead
mostra defeitos mal-atribuídos a quem não os controla; **ranquear por defeitos é
informacionalmente inútil** (só reflete o sistema). Reagir a common-cause como se
fosse special (individual) **aumenta** a variação. Empírico: notas individuais não
predizem efetividade de time (Google Aristotle); stack-ranking ≈ aleatório sob
ruído; Microsoft o abandonou (2013).
**Fonte.** Deming/SPC, Google re:Work, SHRM (3ª rodada, verificado 3-0).
**Exige/proíbe.** PROÍBE: ranking individual por output/defeito. EXIGE: atribuir
ao **processo/etapa**; individual só como leitura de coaching com contexto.

> **Exceção registrada (3b).** Existe UMA métrica de qualidade ligada à pessoa — o
> **FTR por pessoa** — decisão deliberada e informada do dono do produto, **cercada**
> pelas salvaguardas que a tornam defensável: (1) auto-referenciada, **nunca
> comparativa** (não ordena/rankeia/compara pessoas); (2) **defeito-only via
> reclassificação humana** (só o gestor marca defeito vs. mudança legítima; não-
> classificado conta como defeito até revisado); (3) **motivos sempre à vista** (o
> `reason` de cada retorno é o material de coaching — o número nunca fica sozinho);
> (4) **reclassificação só do gestor/admin** (a pessoa vê, não reclassifica — evita
> gaming); (5) **acesso fail-closed** (`requireSelfOrManager`; só a própria pessoa e
> o gestor); (6) **zero pay/rank**. Fora dessas salvaguardas, P2 continua valendo
> integralmente. Ver `docs/superpowers/specs/2026-07-22-visao-de-pessoas-3b-design.md`.

### P3 — Previsibilidade é probabilística, não determinística

**Afirmação.** Não se estima a tarefa criativa individual em horas; mede-se a
**distribuição** e prevê-se por **probabilidade** (percentis, Monte Carlo).
Comprometa-se com o **p85**, não com a média.
**Argumentação.** A variabilidade criativa é **irredutível por matemática**:
filas com variabilidade a alta utilização derivam para estados de atraso
persistentes e **não regridem à média** (Markov/passeio aleatório). Estimativa
determinística falha por estrutura, não por má gestão. A resposta é **limitar WIP**
e **prever probabilisticamente** sobre o histórico.
**Fonte.** Reinertsen (variabilidade/filas), Vacanti (Monte Carlo/percentis),
Lei de Little (1ª+2ª rodadas, verificado 3-0).
**Exige/proíbe.** PROÍBE: prazo/estimativa determinística apresentada como
verdade. EXIGE: percentis (p50/p85/p95), forecast probabilístico, WIP limitado.

### P4 — Outside view: prever pela classe, não pela tarefa

**Afirmação.** Posicione a tarefa na **distribuição empírica da sua classe**
(tipo de trabalho), não em estimativa bottom-up. Segmente por tipo. A experiência
do executor entra como **largura da banda**, nunca como nota.
**Argumentação.** A "inside view" (focar na tarefa específica) é
**sistematicamente otimista** (planning fallacy); a "outside view" é a cura. Os
uplifts diferem drasticamente por categoria → arte/LP/vídeo precisam de classes
separadas. Textual de Flyvbjerg: banda mais estreita só com evidência de ser
melhor que os pares; mais larga se pior — o percentil escolhido codifica a
tolerância a risco.
**Fonte.** Flyvbjerg/Kahneman — reference-class forecasting (2ª rodada, verificado 3-0).
**Exige/proíbe.** PROÍBE: um número global de previsão; experiência virar score.
EXIGE: forecast por template; experiência ajusta largura da banda (v2).

### P5 — Qualidade na fonte; interno ≠ externo

**Afirmação.** Qualidade se constrói **no processo** (inspecionar na fonte), o
retrabalho é atribuído à **etapa que injetou o defeito**, e distingue-se
retrabalho **interno** (pego antes do cliente — gate funcionando, desejável) de
**rejeição do cliente** (escapou — custosa).
**Argumentação.** Jidoka (TPS): parar na anormalidade para não passar defeito
adiante; "inspecionar na fonte" > inspeção final reativa. COPQ: falha interna
(antes do cliente) vs externa (após entrega, mais danosa). Contá-los juntos apaga
a distinção que mais importa.
**Fonte.** Toyota/TPS, COPQ/OpEx (3ª rodada, verificado 3-0).
**Exige/proíbe.** PROÍBE: contar retrabalho como um "revert" genérico
indistinto; atribuir defeito à pessoa. EXIGE: evento de qualidade por etapa,
interno-vs-cliente, atribuído à etapa-origem (subsistema 2, a construir).

### P6 — Gestão por exceção (não paredes de dados)

**Afirmação.** O cockpit destaca **exceções acionáveis** (a restrição, quem está
sobrecarregado, o que envelheceu) — não despeja tabelas de 40 linhas.
**Argumentação.** ToC: existe **uma** restrição; melhorar em outro lugar não
aumenta o throughput → foque nela. DeGrandis: tornar o trabalho e as dependências
visíveis, mas o valor está em **agir na exceção**. Feedback do usuário confirmou:
"não está prático" quando virou parede de linhas.
**Fonte.** Goldratt/ToC, DeGrandis (1ª rodada, verificado 3-0) + feedback de uso.
**Exige/proíbe.** PROÍBE: listar tudo sem priorizar. EXIGE: exceção primeiro,
detalhe sob demanda (drawer/drill-down).

### P7 — Capacidade criativa não é horas fungíveis

**Afirmação.** Horas-capacidade é instrumento **fraco** para planejar trabalho
criativo. A capacidade real é **throughput** (itens/período por tipo), que absorve
a variabilidade; utilização (horas ÷ meta) é **guarda de sobrecarga/ócio**, não
ferramenta de planejamento. Ócio é questão de **capacidade/roteamento**, não
dedução da nota de qualidade.
**Argumentação.** Horas criativas não são intercambiáveis (pesquisa, iteração,
espera de aprovação). Throughput por classe embute a variabilidade (P3/P4).
Misturar volume na nota de qualidade suja o sinal e esconde o problema real.
**Fonte.** Reinertsen/Vacanti (fluxo), síntese das 2ª/3ª rodadas.
**Exige/proíbe.** PROÍBE: usar horas como verdade de planejamento; descontar
volume da qualidade. EXIGE: utilização como faixa **indicativa** (não alarme).

### P8 — Bilíngue de verdade (pt-BR / es-ES)

**Afirmação.** Toda string de UI passa por `t()`, presente nos dois locales com
chaves idênticas; es-ES é **espanhol real** (sem ortografia portuguesa).
**Argumentação.** Afeta a experiência real de usuários es-ES; regressões de i18n
são silenciosas. Um guard de paridade (`__tests__/i18n/locale-parity.test.ts`)
falha em divergência de chave ou vazamento de português.
**Fonte.** Convenção do projeto + guard de CI.
**Exige/proíbe.** PROÍBE: string hardcoded; tradução placeholder. EXIGE: paridade
testada.

---

## 2. Glossário de métricas

Cada métrica: **o que é · fórmula/local · o que responde · fonte/caveat**.

| Métrica                    | O que é / fórmula                                    | Responde                              | Fonte · caveat                                                                                                                                |
| -------------------------- | ---------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **WIP**                    | itens ativos por pessoa/etapa                        | "quanto está em curso?"               | Lei de Little. Alavanca central (P3).                                                                                                         |
| **Lead time**              | `completedAt − createdAt` (dias)                     | "quanto o **cliente** espera?"        | Demanda → entrega; inclui a fila. É o que se promete.                                                                                         |
| **Cycle time**             | `completedAt − startedAt` (dias)                     | "quanto leva **executar**?"           | Início → entrega. Meta: curto e **consistente**. Só desde a migração `20260812120000`.                                                        |
| **Queue time**             | `startedAt − createdAt` (dias)                       | "quanto tempo ficou **parado**?"      | `lead − cycle`. Espera antes de alguém pegar. Idem caveat.                                                                                    |
| **Throughput**             | concluídos por período                               | "quanto sai?"                         | Base do forecast (P3/P7).                                                                                                                     |
| **Work item age**          | tempo desde ativação da etapa                        | "está velho?"                         | Vacanti aging WIP.                                                                                                                            |
| **Aging ratio**            | `idade ÷ SLA` (`≥1` = passou)                        | "passou do esperado?"                 | `stageAgingRatio`; SLA = `expectedDurationHours ?? 72h`.                                                                                      |
| **Flow efficiency**        | `ACTIVE ÷ (ACTIVE+BLOCKED)`                          | "é lento ou fica **esperando**?"      | Reconstruído do log `StageTransition`. Só desde a migração.                                                                                   |
| **Cycle-time percentis**   | p50/p85/p95 dos concluídos                           | "qual meu **prazo confiável**?"       | p85 = compromisso (P3).                                                                                                                       |
| **Forecast Monte Carlo**   | simulação sobre throughput histórico                 | "quando o backlog fica pronto? (p85)" | Precisa de poucas semanas de histórico.                                                                                                       |
| **CFD**                    | contagem por status/dia (série)                      | "onde acumula/escasseia?"             | Banda de bloqueadas alargando = gargalo.                                                                                                      |
| **Restrição do sistema**   | etapa que mais **represa** (inversão do `waitingOn`) | "onde agir primeiro?" (ToC)           | `getSystemConstraint`; sinal causal, ao vivo.                                                                                                 |
| **Risco de dependência**   | nº de pré-requisitos pendentes → baixo/médio/alto    | "quão travado está?"                  | Heurística de composição de atraso.                                                                                                           |
| **WIP limit**              | teto de itens em progresso por etapa                 | "estourou o teto?"                    | Enforcement de **pull** no claim; auto-ativação nunca bloqueia.                                                                               |
| **Utilização**             | `horas TimeLog ÷ capacidade prorrateada`             | "o tempo pago está usado?"            | Faixa **indicativa** 60–90% (P7); benchmarks de agência não verificados. Exibida como medidor (`utilizationMeter`), nunca como escala de cor. |
| **Sinais de burnout**      | util média + overtime + WIP (4 sem)                  | "alguém em risco **sustentado**?"     | Indicativo, não diagnóstico (Gallup dá agregado).                                                                                             |
| **Cadência de 1:1**        | dias desde o último 1:1 → atrasado                   | "quem precisa de 1:1?"                | Gallup: gestor = 70% da variância de engajamento.                                                                                             |
| **Medidor de carga (WIP)** | `WIP ÷ teto`, cor por nível + marca da mediana       | "quem está acima/abaixo do balanço?"  | Coerente com os totais do card.                                                                                                               |
| **Viabilidade de prazo**   | dias disponíveis vs p50/p85 do tipo                  | "o prazo nasceu apertado?"            | Confortável/apertado/em risco; **informacional** (P1).                                                                                        |
| **Previsão por classe**    | percentis do **template** (tipo)                     | "quanto leva ESTE tipo?"              | `getTypeForecast`; usa **lead** time (a demanda ainda vai passar pela fila); N<8 = baixa confiança (P4).                                      |

---

## 3. Mapa de defesa — tela/componente → fundamento

Cada superfície e a razão de existir **daquela forma**.

### /admin (cockpit de saúde do time)

- **Rotina de gestão do fluxo** (checklist fixo, links em nova aba) → **P6**: a
  ronda diária que faz o gestor percorrer as exceções e agir. Não colapsa porque é
  referência permanente.
- **Restrição do sistema** (callout no topo) → **P6/ToC**: uma etapa, sinal causal
  ao vivo (não o top-3 histórico enterrado no relatório).
- **Balanço de carga** (medidor WIP + mediana + drawer) → **P2/P7**: distribuição
  de carga coerente com os totais; estado de prazo fica no drawer, não na barra.
  Nunca vira ranking (P2).
- **Fila de envelhecendo / bloqueados + risco de dependência** → **P6**: exceções
  de fluxo; risco composto visível.
- **Limites de WIP** (violações) → **P3**: torna o teto e a violação visíveis.
- **Sinais de sobrecarga** → **P1/P2**: padrão sustentado, **informacional**, some
  se ninguém em risco; nunca desconta qualidade nem ranqueia.
- **Cadência de 1:1** (atrasados + registrar + modal com todos) → **Gallup**:
  materializa a alavanca de gestão de pessoas.

### /reports/performance

- **Lead / fila / cycle lado a lado** → **P5/fluxo**: o mesmo par de diagnósticos
  opostos que a eficiência de fluxo faz DENTRO da etapa, agora ANTES dela — "somos
  lentos executando" (cycle alto) vs "a demanda espera para ser pega" (fila alta).
  Enquanto as duas métricas usavam a mesma fórmula, essa distinção era invisível.
- **Cycle time (percentis) + scatter** → **P3**: prazo confiável p85, não média.
  Mede do **início**, não da criação: o compromisso é sobre o que a execução
  controla. A espera fica no lead time, onde o cliente de fato a sente.
- **Previsão de entrega (Monte Carlo)** → **P3**: compromisso probabilístico.
- **Throughput no tempo + CFD** → **P3/P6**: tendência e detecção visual de gargalo.
- **Eficiência de fluxo por etapa** → **P5-ish/fluxo**: separa "lento" de
  "esperando" — diagnósticos opostos.
- **Seletor de tipo** → **P4**: segmenta tudo por classe (arte/LP/vídeo).
- **Aviso de baixa confiança (N<8)** → **P4**: honestidade sobre amostra pequena.

### /reports/productivity

- **Utilização (medidor com faixa sombreada)** → **P7/P1**: horas viram utilização,
  mas como **guarda**, não nota; benchmarks não verificados → faixa, não alarme.
  A informação está na **posição** do marcador na régua (`UtilizationMeter`),
  numa cor neutra única. **Correção registrada:** a coluna exibia o percentual
  numa escala verde (60–90%) → vermelha (>90%), o que lê como aprovado/reprovado
  e contradizia a própria legenda ("nunca um ranking"). Escala de julgamento por
  pessoa é justamente o que P1 proíbe; estar fora da faixa é pauta de 1:1.
- **Banner de total + quebras por projeto/cliente/etapa** → **P6**: o total
  contextualiza; as quebras se **auto-ocultam** quando o filtro correspondente já
  está ativo (não repetir na tabela o que a barra de filtro já diz).
- **Exportar CSV/PDF nas quatro tabelas** → uso real: o dado sai para
  fechamento/faturamento sem virar screenshot. A coluna de utilização vai como
  número puro — a faixa vive na tela, onde o contexto está junto.

### Apoio (conta, ajuda, login/home)

- **Duas portas de logout, um mecanismo** → `signOutAction`. **Bug corrigido:**
  o botão de `/account` chamava `signOut()` do next-auth direto e **não zerava
  `lastSeenAt`** — quem saía por ali seguia "online" no quadro de presença e no
  mural de TV até o dia virar, corrompendo justamente o dado de §12.
- **`callbackUrl` preservado no login** → o middleware carimbava a rota tentada,
  mas a página ignorava e mandava todos para `/`. Quem clicava num link de tarefa
  perdia o destino ao autenticar.
- **`safeRedirectPath` contra open redirect** → o destino vem da URL, logo não é
  confiável. Só caminho relativo à raiz; rejeita absoluto, protocol-relative
  (`//host`), `\` (que navegadores normalizam para `//`), percent-encoding que
  esconde o `//`, esquemas executáveis, credenciais embutidas e o laço de voltar
  ao próprio login. Sem isso, `?callbackUrl=https://falso.com` faria phishing
  com a credibilidade do nosso domínio.
- **Ajuda: badge de rota é link, não texto** → mostrava a rota e deixava o leitor
  digitá-la à mão. Passos ganham `try` opcional só quando documentam outra tela —
  repetir o mesmo link em todo passo viraria ruído.
- **Preferências juntas em `/account`** → idioma e tema no mesmo bloco; o tema
  saiu do menu de avatar (§3.1).

### Administração — CRUD (usuários, equipes, fluxos)

- **Um `FormDialog`, não modais artesanais** → `/admin/users` e `/admin/teams`
  montavam `fixed inset-0` à mão. Além da inconsistência, o artesanal perde o que
  o Radix dá: ESC, trava de foco, `aria-modal`, foco restaurado no gatilho e
  scroll do fundo bloqueado. Reescrever a moldura por tela é como esses detalhes
  somem, um de cada vez.
- **Bug corrigido — perda silenciosa de membros** → "Gerir membros" salva com
  `set:` (substitui a lista inteira), mas só enviava os checkboxes **renderizados**.
  Com uma busca ativa, salvar removia do time todos os que o filtro escondeu.
  Os selecionados fora do filtro agora viajam em inputs ocultos.
- **Usuários é CRUD puro** → papel, times, datas, capacidade. A analítica da
  pessoa vive em `/reports/user/[id]` (§10), guardada por P1/P2.
- **SLA, teto de WIP e opcionalidade visíveis na lista de etapas** →
  configuração invisível é configuração esquecida. Estavam só dentro do
  formulário de edição, embora o SLA alimente o envelhecimento e o WIP limite o
  pull. Ausente aparece como "sem SLA"/"sem limite" — que é diferente de zero.
- **P8: namespace único** → `template.json` era o único arquivo de locale
  próprio de uma tela de admin; foi fundido em `admin.workflows.*`, junto com a
  remoção de 9 chaves órfãs da lista de fluxos.

### Projetos (/projects e /admin/projects/[id])

- **Duas telas, dois propósitos** → `/admin/projects/[id]` é a visão de
  **gestão** (editar, contadores, tabela de tarefas, artefatos, armazenamento);
  `/projects/[id]` é o **Kanban** de execução. Faltava a ponte: chegava-se ao
  detalhe e não havia saída para o quadro. O índice linka para os dois.
- **% de conclusão é derivada, nunca persistida** → `computeProjectCompletion`
  sobre os status das tarefas; canceladas e obsoletas saem do denominador. Uma
  coluna persistida entraria em desacordo com as tarefas no primeiro bug.
- **Barra de progresso além do número** → com 12 cards lado a lado, "43%" não se
  lê de relance; a barra sim.
- **Inativo é `neutral`, não `danger`** → arquivar projeto é decisão normal de
  gestão, não problema. E `pending` é neutro: se o estado mais comum fosse
  âmbar, o painel inteiro ficaria amarelo e o aviso perderia significado.
  `empty` (nenhuma tarefa ativa) é o único `warning` — provável esquecimento.
- **Índice é MANAGER+, Kanban não** → o índice é ferramenta de gestão de
  entregas; o quadro do projeto continua acessível a quem executa.

### Clientes (/admin/clients e /admin/clients/[id])

- **Armazenamento por projeto mora aqui** → é informação de **capacidade**, e a
  casa certa é o cliente que a consome. O `StorageBreakdown` já havia saído do
  detalhe da tarefa e do cockpit (§3); o detalhe do projeto mantém a quebra
  por tarefa, que é o nível dele.
- **Busca no banco, não na lista carregada** → `?q=` + `contains` insensitive,
  para a lista funcionar igual com 5 ou 500 clientes e o resultado ser
  compartilhável. Campo opcional no `SimpleEntityCrudList`, então
  `/admin/teams` e `/admin/templates` podem adotar com uma prop.
- **"Nada encontrado" ≠ "não há nada"** → vazio de busca tem texto próprio;
  reusar o "nenhum cliente cadastrado" faz o usuário achar que apagou a base.
- **P8 fechado** → o título do bloco de armazenamento era a única string
  hardcoded em português destas telas (`"Armazenamento no NAS — por projeto"`).
  O filtro de status de projeto já era traduzível (`admin.projectStatusFilter`).

### Presença ao vivo + modo TV (/reports/live-activity e /tv)

- **Uma feature, duas apresentações** → board (operacional, com filtros e link
  para a tarefa) e wallboard (`/tv`: tela cheia, escuro, tipografia grande,
  relógio, sem navegação). Mesma fonte de dados, mesmo stream, mesmo
  `PresenceCard`. Antes eram dois `activity.ts`, dois endpoints e dois cards
  inline — que já divergiam no que mostravam.
- **Informativo, nunca vigilância nem ranking** → **P1/P2**: nota à vista na
  tela (não só na ajuda) e no próprio mural. O card **não** mostra acumulado de
  horas do dia, não ordena por volume e não compara pessoas. "Desde quando" é o
  tempo da tarefa **atual** — contexto para "posso interromper?", não placar.
  Ausência de trabalho marcado ≠ ociosidade (reunião, leitura, não clicou).
- **Ordem estável no mural** → reordenar por estado a cada tick de 10s faria os
  cards pularem de lugar; de longe, ilegível. Board ordena online-primeiro
  (triagem), TV ordena alfabeticamente.
- **Contorno de autorização fechado** → **correção registrada:** a `/tv` exigia
  `requireMemberOrHigher` enquanto o board exigia `requireManagerOrAdmin`, então
  quem não podia abrir o board via a mesma informação (incluindo o nome do
  cliente) pela TV. Agora existe **um** gate, `requirePresenceRead`.
- **Wallboard autentica por conta de serviço, não por sessão de pessoa** → um
  monitor de parede não é um usuário. `TV_WALLBOARD_TOKEN` (env, opcional) é
  trocado por cookie httpOnly de 1 ano e a URL é limpa por redirect, tirando o
  segredo do histórico e dos logs. **Fail-closed:** sem a env configurada,
  `verifyWallboardToken` devolve false e a `/tv` volta a exigir gestor — uma
  instalação não configurada nunca vira mural aberto. O escopo do token termina
  na leitura de presença; ele não autoriza escrita nenhuma.
- **Stream com 403 limpo** → o endpoint roda um snapshot antes de abrir o
  stream. O `/api/tv/stream` removido devolvia `200 text/event-stream` e deixava
  a exceção virar `: keep-alive`, mascarando a negação numa conexão que nunca
  falhava visivelmente.

### Calendário (/planejamento/calendario)

- **Mora em "Planejamento", não em "Relatórios"** → a tela **escreve** (reagenda
  vencimento, cria demanda). Listada como relatório, parecia leitura
  retrospectiva — o oposto do que faz. A rota antiga responde com 308.
- **Trava de escrita explícita (`?plan=1`)** → **P6/P1**: em leitura, arrastar e
  criar ficam **desmontados**, não inertes. Arrastar é gesto barato demais para
  uma ação que muda um **compromisso com o cliente**, e num grid denso o arraste
  acidental passa despercebido. Vive na URL para sobreviver à navegação de
  período e à troca de visão — liga-se uma vez por rodada de planejamento.
- **Navegação de período única (anterior/hoje/próximo)** → uma implementação para
  semana e mês. **Correção registrada:** a navegação do mês montava a URL do
  zero e **descartava os filtros** a cada clique; o toggle semana/mês fazia o
  mesmo. Agora ambos partem dos parâmetros atuais.
- **Mesmos filtros nas duas visões** → o mês não tinha nenhum, então trocar de
  visão ampliava silenciosamente o escopo do que estava na tela. Time e pessoa
  escopam pela etapa **aberta** (onde o trabalho está agora), como na semana;
  concluídas ficam ocultas por padrão nos dois lados.
- **Feriados e aniversários como marcador discreto** → **P6**: contexto de
  planejamento (não agendar entrega num feriado), nunca protagonista da grade.

### Visão de UMA pessoa (/minha-evolucao e /reports/user/[id])

- **Uma implementação só (`PersonAnalytics`), duas portas** → **P2**: a pessoa
  (`/minha-evolucao`) e o gestor (`/reports/user/[id]`) veem **a mesma tela**. Se
  divergissem, a 1:1 começaria com as duas partes olhando números diferentes.
- **Acesso `requireSelfOrManager`, fail-closed** → salvaguarda (5) da exceção 3b.
  **Correção registrada:** o relatório usava `requireManagerOrAdmin`, que trancava
  a pessoa fora do próprio relatório — o contrário de "auto-referenciado".
- **Throughput próprio no tempo, com eixos** → **P2/P3**: tendência contra o
  próprio histórico, nunca contra colegas. Sem ranking, sem nota composta.
- **Utilização como medidor de faixa** → **P7/P1**: mesmo `UtilizationMeter` do
  relatório de horas. Faixa, não nota.
- **Qualidade com o MOTIVO de cada retorno** → salvaguarda (3): o `reason` é o
  material de coaching; o número nunca aparece sozinho. FTR é defeito-only.
- **Reclassificar (defeito vs legítimo) só do gestor sobre OUTRA pessoa** →
  salvaguardas (4) e o guarda contra gaming: `canReclassifyRework` nega também o
  gestor sobre os **próprios** retornos — corrigir a própria nota é o mesmo
  gaming pela porta dos fundos. Regra pura e testada, não enterrada no JSX.
- **Etapas ativas + horas recentes aqui, não no CRUD** → **§3.1**: a analítica
  saiu de `/admin/users/[id]`, que fica com identidade, edição (papel/times/
  capacidade) e o link. Uma fonte por dado.

### Criação de tarefa (/admin/tasks/new)

- **Checagem de viabilidade ao vivo** → **P1/P3/P4**: usa a distribuição do tipo
  para dizer se o prazo nasceu apertado; **informa, não bloqueia** (P1).

### Dashboard pessoal ("Meu foco" / etapas ativas)

- **KPIs + tabela com aging e idade** → **P6/aging WIP**: o colaborador vê suas
  próprias exceções (auto-referenciado, não comparado — P2).

### /help (Central de Ajuda)

- **Grupo "Como fazer"** (3 guias passo a passo: template, hierarquia, dia a dia
  do colaborador) → onboarding operacional; texto sem emoji decorativo.
- **/help/principios** (os 8 princípios, cada um com afirmação → por quê →
  exige/proíbe → fonte) → **P1/P8**: torna a fundamentação **legível dentro do
  produto** — não só neste doc — para sustentar decisões e reuniões; bilíngue de
  verdade via `t()`.
- **/help/glossario** (as 18 métricas: o que é · responde · fonte/caveat) →
  **P6/P8**: vocabulário compartilhado para ler relatórios e cockpit sem
  ambiguidade.
- Conteúdo **espelha §1/§2/§6** deste doc; renderizado por
  `components/help/FundamentoView.tsx` a partir de `locales/{pt-BR,es-ES}/help.json`
  (`fundamentos.*`). Ao alterar um princípio ou métrica aqui, **atualize também o
  `help.json`** (nos dois locales) para não deixar a versão in-app divergir — o
  guard de paridade cobre chaves, não conteúdo. O mapa de defesa por tela (esta §3)
  e as anti-features (§5) ainda **não** estão expostos in-app: são o próximo passo
  natural de expansão do grupo Fundamentos.

---

## 4. Decisões de arquitetura registradas (ADRs)

- **`StageTransition` (log append-only de transições de status)** — para medir
  flow efficiency **exata** (ativo vs bloqueado) mesmo com ciclos de
  block/unblock/revert, que o timestamp único não retém. Só acumula a partir da
  migração (não fabricamos histórico). _(P3/P5)_
- **`Task.workflowTemplateId` denormalizado** — o tipo é dimensão consultada e
  agrupada o tempo todo → merece `GROUP BY` indexado, não join por etapa. Fixo na
  criação, nunca muda. _(P4)_
- **Viabilidade = checagem contra o `dueDate` escolhido** (não pré-preencher data)
  — o prazo é a data-limite; a previsão valida a **janela disponível** contra a
  classe. Se o início ideal já passou → 🔴. _(P1/P4)_
- **Barra do balanço = medidor de WIP + mediana** (não empilhamento de estado de
  prazo) — a barra codifica **carga**, coerente com os totais do card; prazo vai
  pro drawer. _(P2/P7)_
- **WIP limit = restrição de pull** — bloqueia reivindicar além do teto; a
  auto-ativação por dependência **nunca** bloqueia (não trava o motor). _(P3)_
- **`"use server"` só exporta funções async** — constante (`MIN_CLASS_SAMPLES`)
  mora em módulo plano (`lib/reporting-constants.ts`); um const num módulo
  `"use server"` quebra `next build`. _(constraint de plataforma)_

---

## 5. O que deliberadamente NÃO fazemos (anti-features)

| Não fazemos                                                                                                                                                        | Por quê (princípio)                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Score de desempenho **composto** (qualidade×tempo×volume)                                                                                                          | P1 — número único é gameável e esconde a história           |
| **Ranking** individual / leaderboard por velocidade ou defeito _(exceto o FTR-por-pessoa **auto-referenciado** da 3b — não é ranking: não compara/ordena pessoas)_ | P1/P2 — degrada qualidade e colaboração; ≈ ruído do sistema |
| Vínculo de métrica a **remuneração**                                                                                                                               | P1 — transforma informacional em motivacional               |
| **Estimativa em horas** apresentada como prazo certo                                                                                                               | P3 — variabilidade irredutível; use percentis               |
| **Bloquear** o usuário com base num sinal (ex.: não deixar criar com prazo apertado)                                                                               | P1 — informa, não impõe                                     |
| Descontar **volume/ócio** da nota de **qualidade**                                                                                                                 | P7 — ócio é capacidade/roteamento, dimensão separada        |
| Contar retrabalho como **revert genérico** indistinto                                                                                                              | P5 — apaga interno-vs-cliente e a etapa-origem              |
| **Média** como métrica principal de duração                                                                                                                        | P3 — distribuição enviesada; percentis                      |
| Capacidade em horas como **ferramenta de planejamento**                                                                                                            | P7 — throughput por classe é a medida certa                 |

---

## 6. Fontes (verificadas por deep-research adversarial)

**Fluxo & previsibilidade:** Vacanti _Actionable Agile_ · Reinertsen _Principles of
Product Development Flow_ · Lei de Little · Flyvbjerg/Kahneman (reference-class
forecasting) · Goldratt/ToC · DeGrandis _Making Work Visible_.
**Medição & pessoas:** Austin _Measuring and Managing Performance_ · Deming/SPC
(Red Bead, common vs special cause) · Google re:Work (Project Aristotle) · SHRM
(Microsoft stack-ranking) · Gallup (engajamento).
**Qualidade:** Toyota/TPS (jidoka) · COPQ (interno vs externo) · Lean
inspect-at-source.

> Cada afirmação usada passou por verificação adversarial (3 votos) nas rodadas de
> research linkadas no topo. Onde uma decisão é **de design sem fonte verificada**
> (ex.: proxies concretos de qualidade criativa), isso está explicitado no doc de
> research correspondente — não inventamos respaldo.

---

## Manutenção

Ao adicionar/alterar uma tela, métrica ou feature: (1) identifique o(s)
princípio(s) que a justificam; (2) se nenhum justifica, ou se ela contradiz um
anti-feature de §5, **pare e reavalie**; (3) registre a nova superfície em §3 e
qualquer decisão nova em §4. Este doc é a memória de por que o workos é como é.
