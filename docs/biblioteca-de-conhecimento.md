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

### Cronômetro de tarefa (exclusividade e interrupção)

- **Uma tarefa contando tempo por pessoa, garantido pelo BANCO** → antes era só
  convenção do código, e convenção não sobrevive a concorrência: a checagem lê
  antes de escrever, então dois cliques simultâneos leem "nenhuma ativa" ao mesmo
  tempo e abrem dois cronômetros.
- **A garantia é uma COLUNA, não um índice parcial** → `ActivityLog.openForUserId`
  carrega o `userId` enquanto o período está aberto e volta a null ao fechar; um
  `@unique` comum faz o resto, porque no Postgres nulos não colidem — os fechados
  convivem aos milhares e só os abertos disputam. A primeira versão foi um índice
  parcial (`userId WHERE endedAt IS NULL`), que funciona mas o Prisma não declara:
  sumia do schema, um `db push` não o recriava (comprovado numa recuperação de
  banco, teve que ser recriado à mão) e `migrate dev` o lia como drift e propunha
  derrubá-lo. **O custo aceito:** a coluna duplica o `userId` e vira estado a
  manter — e o modo de falha é assimétrico. Não preencher ao abrir só enfraquece a
  garantia; não limpar ao fechar **trava a pessoa**, com o erro aparecendo longe,
  no próximo "Iniciar". Por isso as duas escritas são ponto único
  (`startWorkOnTask` e `closeActivityLog`) e cada lado tem teste que falha se a
  coluna for esquecida. O índice parcial continua no banco como defesa redundante.
- **Bug corrigido — horas descartadas na troca de tarefa** → havia dois
  caminhos de fechamento e só o "Parar" manual criava o `TimeLog`. Iniciar B com
  A rodando fechava A **sem registrar nada**: as horas sumiam do relatório de
  horas, da utilização e de todo denominador. `closeActivityLog` é agora o
  caminho único — fechar um período sempre registra o tempo.
- **Justificativa obrigatória só na INTERRUPÇÃO** → parar o próprio trabalho não
  exige justificar-se (descrição opcional); cortar um bloco no meio para trocar
  de tarefa, sim. É o único registro de por que aquele tempo foi interrompido, e
  vira a descrição das horas da tarefa abandonada. A regra é validada no
  servidor: a UI abre o diálogo antes, mas não é ela quem garante.
- **O diálogo avisa que o tempo é preservado** → sem isso, alguém que soubesse
  do comportamento antigo evitaria trocar de tarefa para não perder as horas.

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

### Calendário (/planning/calendar/week e /planning/calendar/month)

- **Mora em "Planejamento", não em "Relatórios"** → a tela **escreve** (cria
  demanda). Listada como relatório, parecia leitura retrospectiva — o oposto do
  que faz. A rota antiga responde com 308.
- **Duas telas, não uma com alternador** → respondem a perguntas diferentes: a
  semana é **execução** (quem está com o quê, e criar demanda no dia), o mês é
  **contexto** (datas comemorativas, feriados, aniversários — de onde sai a
  campanha). Já foram uma só; a fusão existia para acabar com a barra de controle
  duplicada, e essa parte continua: `shared.tsx` mantém UMA barra, filtros e trava.
  O que a separação devolveu foi o **esqueleto fiel** — `loading.tsx` não enxerga
  `searchParams`, então a tela única desenhava sempre a grade da semana, inclusive
  para quem abria o mês — e ~40 kB de JS a menos na visão mensal, que carregava o
  grafo de chunks da semana. `/planning/calendar` e `?view=` respondem com 308.
- **Trava de escrita explícita (`?plan=1`)** → **P6/P1**: em leitura, os gatilhos
  de criação ficam **desmontados**, não inertes. Vive na URL para sobreviver à
  navegação de período e à troca de visão — liga-se uma vez por rodada de
  planejamento.
- **Sem arrastar para reagendar** → o gesto existiu e foi **removido**: a semana é
  visualização e criação, não edição de prazo. Arrastar é barato demais para uma
  ação que muda um **compromisso com o cliente**, e num grid denso o arraste
  acidental passa despercebido — a trava `?plan=1` nasceu justamente para conter
  isso. **Consequência aberta:** `rescheduleTask` era a ÚNICA escrita de `dueDate`
  depois da criação, e saiu junto. Hoje não há como remarcar um prazo pela
  interface; se voltar, deve voltar como campo explícito no detalhe da tarefa, não
  como gesto no calendário.
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

### Visão de UMA pessoa (/my-evolution e /reports/user/[id])

- **Uma implementação só (`PersonAnalytics`), duas portas** → **P2**: a pessoa
  (`/my-evolution`) e o gestor (`/reports/user/[id]`) veem **a mesma tela**. Se
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
- **Etapa coringa (template sem time padrão) roteada na criação** → o template
  afirma que o passo **existe**, não quem o executa; uma etapa sem `defaultTeam`
  é uma decisão de desenho, não configuração faltando. Quem executa e **o que
  precisa ser feito** (instrução por etapa) são escolhidos na criação, único
  momento em que alguém conhece a demanda concreta. Antes disso a etapa nascia
  órfã: nenhuma fila de time a mostrava. Roteamento **não** sobrescreve etapa que
  já tem time no template — senão cada demanda viraria uma variante do processo,
  que é o que o template existe para evitar. Errar o roteamento é corrigível
  enquanto a demanda não começou (ver ADR "janela de correção"); depois disso é
  erro de processo que já produziu medição, e a saída é **marcar obsoleta e
  duplicar** — a cópia nasce sem responsável, logo virgem, e carrega o desenho
  (etapas incluídas + roteamento + instrução) para que consertar UMA coisa não
  custe redecidir todas. _(P3/P7)_

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

### /help/equipes (descritivos de equipe)

- **Índice por família + faixa "ainda não documentadas"** → **P6**: a função que
  ainda não tem descritivo **aparece marcada**, não some. Omitir seria esconder a
  exceção — que aqui é a própria ausência de expectativa escrita.
- **Seções `entregaveis` e `interfaces`** → saem das `TemplateStage` reais
  (`prisma/seed.ts`), não de texto genérico de internet: o descritivo descreve o
  fluxo que existe, e por isso envelhece junto com ele.
- **Seção `relatorios`** → **P5/política de sensibilidade**: cada artefato declara
  `destino` (cliente/gestão/documentação) e a sensibilidade correspondente. O guard
  impõe `destino: cliente` ⟺ `CLIENTE`, porque CLIENTE é o único nível
  compartilhável para fora (`lib/nas/sensitivity.ts`).
- **Seção `avaliacao`** → **P1/P2, e é o ponto de maior risco de todo o produto**.
  Um descritivo de cargo com seção de avaliação é o artefato que mais tende a virar
  nota, ranking e vínculo a remuneração. Três defesas: (1) um callout fixo antes dos
  sinais, em toda função, dizendo que aquilo informa conversa e nunca pontua;
  (2) `oQueNuncaFazemos` obrigatório, nunca vazio; (3) `__tests__/content/
team-profiles.test.ts` reprova vocabulário de premiação/ordenação dentro de
  `oQueOlhamos`. **Nenhum descritivo pode criar uma segunda exceção ao P2** — a de
  3b (FTR por pessoa) é a única registrada.
- **Atalho em `/account`** → o colaborador chega ao descritivo da própria equipe
  sem passar pelo índice; a equipe sem descritivo aparece igual, marcada.
- **Bloco de referência brasileira (CBO)** → **P1/honestidade de fonte**: cita o
  código da CBO com um campo de **aderência** (`direta` · `aproximada` ·
  `inexistente`), porque um código citado sem qualificação vira enquadramento
  falso. SEO está marcado como `inexistente` — a CBO não tem a ocupação, e a
  lacuna é informação, não erro de preenchimento. Duas ressalvas aparecem em
  TODA função: a CBO é vocabulário e não enquadramento (a operação não está sob
  registro trabalhista brasileiro), e os códigos vieram de espelhos da tabela
  porque o site oficial não abre ficha por link. Cinco funções ficam sem entidade
  setorial: só entram as três que foram abertas e conferidas (FENAJ, Sinapro-SP,
  SBC), e a ausência é exibida em vez de preenchida com fonte fraca.
- **`/help/relatorios` (modelos por artefato)** → o descritivo declara o artefato;
  o modelo diz como ele deve parecer. Padrão **por artefato, não da casa**: um
  clipping e um relatório de incidente têm leitores e perguntas diferentes, e a
  mesma anatomia produziria seções vazias nos dois. Cada modelo traz anatomia,
  regras, o que estraga, um exemplo **fictício** (marcado como tal na tela, para
  não ser confundido com dado de cliente) e um esqueleto copiável — que também
  fica visível na página, para quem não tem área de transferência disponível.
  O relatório ao cliente é peça comercial e continua sob **P3**: previsão sai como
  faixa, nunca como promessa. `destino: cliente` ⟺ `CLIENTE` vale aqui também, e
  o guard reprova divergência entre o modelo e o descritivo do mesmo artefato.
  Cobertura: os **34** artefatos declarados nos descritivos têm modelo. O índice
  agrupa por **função**, não por destino → **P6**: com trinta e quatro modelos,
  agrupar por destino colocava vinte cartões sob um único título. Quem procura
  sabe a própria função antes de saber para quem o artefato vai; o destino virou
  etiqueta com legenda.
- Conteúdo **espelha `docs/descritivos-de-equipe.md`**; renderizado por
  `components/help/TeamProfileView.tsx` a partir de
  `locales/{pt-BR,es-ES}/teamProfiles.json`. Vale o mesmo aviso do `help.json`: ao
  alterar um descritivo no doc, **atualize o JSON nos dois locales** — com o
  agravante de que o guard oficial de paridade **não entra em arrays**, e aqui quase
  tudo é array. Quem cobre esse buraco é o guard de conteúdo.

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
- **Time EFETIVO da etapa = roteamento da tarefa ?? time padrão do template**
  (`lib/stage-team.ts`) — regra única para fila, cockpit, calendário e
  relatórios. Estava prestes a ser reescrita por consulta, e regra repetida
  diverge: bastaria uma tela esquecer o override para a mesma etapa aparecer em
  dois times conforme a tela. O teto de WIP é a exceção deliberada — ele é
  propriedade da **coluna** no fluxo, não da demanda. _(P4)_
- **Preview de avanço roda o MESMO motor da ativação** (`computeStageReadiness`)
  — a versão que só olhava dependentes diretos anunciava a etapa opcional
  **excluída** como próxima e escondia a que de fato abre (pré-requisito sem
  linha na tarefa conta como satisfeito). Preview divergir da execução é pior que
  não ter preview: confirma-se uma coisa e o sistema faz outra. _(P3)_
- **Janela de correção = antes de iniciar** (`lib/task-virgin.ts`) — reconfigurar
  etapas e roteamento é livre enquanto nada foi executado, e proibido depois:
  mudar o time de uma etapa já trabalhada moveria throughput e on-time de um time
  para outro, falsificando a medição. A âncora é `Task.startedAt` (carimbo
  write-once que já existia) mais "nenhuma etapa com responsável" — e não um
  predicado novo de "teve interação", que teria de decidir se comentário conta,
  se artefato conta, e divergiria em cada tela nova. O bloqueio devolve o MOTIVO,
  para a tela poder dizer por que travou em vez de só sumir com o botão.
  _(P1/P2/P3)_
- **Retorno preserva o que foi determinado na criação** — a reversão reativa a
  etapa-alvo por `update` na linha existente (nunca `create`), então `teamId` e
  `instructions` sobrevivem: a etapa coringa volta para a fila do time escolhido
  na criação, com a instrução intacta. O `assigneeId` é limpo de propósito (volta
  ao backlog), e é justamente isso que a faz reaparecer para o time certo. Só se
  volta para etapa que a tarefa **percorreu** (`getPreviousStages` deriva de logs
  fechados) e que **faz parte** dela — etapa opcional excluída não tem linha e é
  recusada antes de qualquer escrita, sem `ReworkEvent` fantasma. _(P3/P5)_
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

**Documentos acoplados a este.** Ao mexer nos princípios, verifique se o texto
in-app precisa acompanhar:

| Doc                                  | Espelho in-app                                      |
| ------------------------------------ | --------------------------------------------------- |
| §1/§2/§6 deste doc                   | `locales/{pt-BR,es-ES}/help.json` → `fundamentos.*` |
| `docs/descritivos-de-equipe.md`      | `locales/{pt-BR,es-ES}/teamProfiles.json`           |
| `docs/descritivos-de-equipe.md` §3.2 | `locales/{pt-BR,es-ES}/reportModels.json`           |

Em especial: a §2 de `descritivos-de-equipe.md` (salvaguardas de RH) deriva
diretamente de P1 e P2. Se um desses princípios mudar, ela muda junto — é o
documento que o RH lê antes de contratar e antes de avaliar.
