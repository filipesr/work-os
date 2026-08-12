# Prompts de geração de telas — briefing para ferramenta de UX/IA

> **O que é.** Um **prompt paste‑ready por tela** para uma ferramenta externa de UX/IA
> (v0, Figma Make, Lovable, etc.) gerar cada tela **já no estado reorganizado** definido em
> [arquitetura-de-informacao.md](./arquitetura-de-informacao.md) (§3 realocações). Cada prompt
> diz, de forma geral: o que a tela é, quem usa, a **prioridade da informação** (o que vem
> primeiro), os **blocos** que a compõem, os **tipos de dado** que cada bloco consome, as
> **interações**, os **estados vazios** e as **restrições de princípio** (P1–P8).
>
> **Como usar.** (1) Cole o **Preâmbulo global** (§A) uma vez como contexto de sistema na
> ferramenta. (2) Cole o **Vocabulário de dados** (§B) — as entidades recorrentes, para os
> prompts não repetirem shapes. (3) Cole o prompt da tela desejada. Os prompts são
> **tool‑agnósticos**: descrevem intenção e dados, não código nem nomes de componentes React.
>
> **Estado‑alvo.** Descreve o **depois** da reorganização (ex.: o dashboard já **sem** o widget
> de evolução; relatórios já fundidos; navegação já reagrupada). Onde a tela muda em relação
> ao hoje, há a nota **“Mudou vs hoje”**.

---

## §A. Preâmbulo global (colar uma vez como contexto)

> Você vai gerar telas de um **sistema de gestão de demandas por etapas para uma agência de
> marketing/criativo** (não é um time de software). O trabalho flui por **templates de
> workflow** (tipos de tarefa: Vídeo Curto, Post Carrossel, Landing Page, Campanha de Tráfego…),
> cada um com **etapas** que têm **time responsável**, **SLA** (duração esperada), **dependências**
> e opcionalidade. As pessoas têm papéis: **MEMBER** (executa), **SUPERVISOR**, **MANAGER**,
> **ADMIN**.
>
> **Tom e filosofia (inegociáveis — são o DNA do produto):**
>
> 1. **Informacional, nunca motivacional.** Nada de score composto, ranking público, leaderboard
>    ou vínculo a remuneração. Os sinais **informam** decisão (coaching, staffing, previsão,
>    triagem) — nunca premiam/punem.
> 2. **Variação é do sistema, não da pessoa.** Nunca ranquear/comparar pessoas por output ou
>    defeito. Métricas individuais são **auto‑referenciadas** (a própria pessoa ao longo do tempo),
>    lidas como coaching, sempre com o contexto/motivo à vista.
> 3. **Previsibilidade é probabilística.** Prazos e previsões usam **percentis (p50/p85/p95)** e
>    simulação, não estimativa determinística. Compromisso é no **p85**, não na média.
> 4. **Gestão por exceção.** Destacar **o acionável** (a restrição, quem está sobrecarregado, o que
>    envelheceu) — nunca despejar tabelas de 40 linhas. Exceção primeiro; detalhe sob demanda
>    (drawer/drill‑down).
> 5. **Capacidade criativa não é horas fungíveis.** Utilização (horas ÷ meta) é **faixa
>    indicativa** de sobrecarga/ócio, não ferramenta de planejamento nem alarme; a medida real de
>    capacidade é **throughput** por tipo.
>
> **Requisitos transversais:**
>
> - **Bilíngue pt‑BR / es‑ES**: toda string é traduzível (nada hardcoded); textos abaixo estão em
>   pt‑BR como referência.
> - **Tema claro E escuro** (o usuário alterna).
> - **Responsivo**; tabelas largas rolam no próprio container.
> - **Server‑first**: preferir conteúdo renderizado no servidor; JS de cliente só onde há
>   interação real. Gráficos podem ser SVG simples (sem lib pesada).
> - **Estados vazios com sentido**: quando um bloco de exceção não tem nada a mostrar, ele
>   **some** (não ocupa espaço) — coerente com “gestão por exceção”.
> - **Densidade adequada ao dado**: um bloco não deve ser grande demais para 1 número nem
>   pequeno demais para uma tabela — dimensione ao conteúdo.

---

## §B. Vocabulário de dados (entidades recorrentes)

Referencie estes shapes nos prompts (descrições, não tipos exatos):

- **Tarefa (demanda):** `{ id, título, descrição?, cliente, projeto, tipo/template, prioridade
(baixa|média|alta|urgente), status (backlog|em_andamento|pausada|concluída|cancelada),
criadaEm, venceEm?, concluídaEm? }`
- **Etapa ativa (instância de etapa numa tarefa):** `{ tarefa, cliente/projeto, etapa (nome),
time responsável, status (inativa|ativa|bloqueada|concluída), responsável?, ativadaEm,
atribuídaEm?, bloqueadaEm?, concluídaEm?, slaHoras, agingRatio (número; ≥1 = passou do SLA),
estadoPrazo (no_prazo|vence_em_breve|atrasada) }`
- **Usuário:** `{ id, nome, email, papel, times[], capacidadeSemanalHoras?, últimoAcesso? }`
- **Time:** `{ id, nome, membros[] }`
- **Cliente:** `{ id, nome, contato?, projetos[], pastaNAS? }`
- **Projeto:** `{ id, nome, cliente, %conclusão, tarefas[] }`
- **Template/tipo:** `{ id, nome, etapas[] }`; **Etapa‑modelo:** `{ nome, ordem, timePadrão?,
slaHoras?, dependeDe[], opcional, wipLimit? }`
- **Métricas de fluxo (por tipo/time):** cycle‑time `{ p50, p85, p95, amostra }`; throughput
  `{ série: [{ semana, quantidade }] }`; CFD `{ série: [{ data, concluída, ativa, bloqueada,
não_iniciada }] }`; forecast Monte Carlo `{ backlog, prazoP85dias, entregasProx30d }`; eficiência
  de fluxo por etapa `{ etapa, eficiência (0–1 = ativo÷(ativo+bloqueado)), amostra }`.
- **Qualidade:** retrabalho `{ tarefa, etapaOrigem, tipo (interno|cliente), classe
(defeito|legítimo|não_classificado), motivo (texto), responsávelOrigem?, quando }`;
  FTR (certo‑da‑primeira‑vez) `{ percentual, retornosInternos, retornosCliente }`.
- **Pessoas/gestão:** utilização `{ percentual, horas, metaHoras }`; carga (WIP) `{ pessoa, wip,
teto, nível (ok|perto|acima) }`; cadência 1:1 `{ pessoa, últimoEm?, atrasado (bool) }`;
  burnout `{ pessoa, utilizaçãoMédia, overtime, wip, sustentado (bool) }`; restrição do sistema
  `{ etapa, quanto_represa }`.
- **Presença:** `{ pessoa, estado (online|trabalhando|offline), tarefaAtual?, desde }`.

---

# Parte 1 — Shell e navegação

## 0. Navegação global (barra primária + menu de avatar)

**Persona/acesso:** todos os autenticados; itens variam por papel.
**Objetivo:** uma navegação **persona‑aware** que substitua a atual (navbar de 3 links + um
dropdown‑tudo confuso).

**Prompt de geração:**

> Crie o **shell de navegação** de um app de gestão. Uma **barra superior persistente** com o
> logo à esquerda, os **itens primários no centro/esquerda** (variam por papel) e, à direita, um
> **menu de avatar enxuto**. Agrupe por trabalho‑a‑ser‑feito, não por tabela do banco.
> **Para MEMBER (executor):** `Início`, `Meu Trabalho`. **Para MANAGER/ADMIN:** `Cockpit`,
> `Demandas`, `Entregas` (Clientes, Projetos), `Relatórios` (abre um submenu/landing),
> `Administração` (só ADMIN: Usuários, Equipes, Fluxos de Trabalho). O **menu de avatar** contém
> apenas: nome+papel, `Minha Conta`, `Ajuda`, alternar **tema**, alternar **idioma**, `Sair`
> (destacado, destrutivo, separado). Rótulos devem **revelar escopo** (ex.: “Minhas Horas” vs
> “Produtividade da Equipe”; “Calendário Semanal” vs “Mensal / Eventos”). Cada destino aparece
> **em um só lugar** (sem duplicar entre barra e menu). Indicar o item ativo. Responsivo: em telas
> estreitas, colapsar os primários num menu “hambúrguer”, mantendo o avatar visível.

**Restrições:** P6 (clareza/escopo). **Mudou vs hoje:** elimina a navbar redundante e o
dropdown‑tudo; expõe `Meu Trabalho` (hoje órfão); tira tema/deck/sair do meio das ferramentas;
tema+idioma vão para a conta/avatar juntos.

---

# Parte 2 — Colaborador

## 1. Início — dashboard pessoal diário · `/dashboard`

**Persona/acesso:** qualquer autenticado com time.
**Objetivo:** responder “o que faço agora e o que está em risco?”.

**Prompt de geração:**

> Crie um **dashboard pessoal de trabalho**. Prioridade de cima para baixo: (1) uma **faixa de
> KPIs de exceção** — 4–5 números grandes: etapas ativas, envelhecendo, em risco, concluídas na
> semana, horas hoje; (2) **“Meu foco” — minhas etapas ativas**: uma lista/tabela das minhas
> etapas em andamento, cada linha mostrando tarefa, cliente/projeto, etapa, status
> (ativa/bloqueada), **aging** (idade vs SLA, com destaque quando passou), vencimento e uma ação
> rápida; um aviso **informacional** (não repreensivo) se eu tenho WIP demais; (3) **Backlog do
> time**: etapas do meu time ainda sem responsável, com botão **“Reivindicar”** (modelo pull).
> Os KPIs devem derivar **da mesma consulta** que alimenta a lista (o número do topo nunca pode
> divergir da lista). Estados vazios amigáveis. Nada de comparação com colegas.

**Dados:** faixa de KPIs (contagens); lista de **Etapa ativa** (minhas); lista de **Etapa ativa**
sem responsável (time).
**Restrições:** P6 (exceção‑primeiro), P2 (auto‑referenciado), P7 (aviso de WIP informacional).
**Mudou vs hoje:** **remover** o widget “Minha evolução” daqui (vai para a tela _Minha Evolução_);
a lista de etapas passa a ser o **componente canônico** de lista de etapas (o mesmo de _Meu
Trabalho_); KPIs e lista compartilham a mesma fonte.

## 2. Meu Trabalho — fila de etapas do colaborador · `/tasks`

**Persona/acesso:** qualquer autenticado. **Mudou vs hoje:** passa a ser **acessível pela
navegação** (hoje é órfã) e reusa a **mesma** lista/KPIs do Início (um componente canônico).

**Prompt de geração:**

> Crie a **fila de trabalho** de um colaborador: uma tela focada em filtrar e varrer as próprias
> etapas. Topo: **barra de filtros** — alternância “minhas / do time”, pílulas de status
> (ativa/bloqueada/concluída/atrasada), intervalo de datas, e “limpar”. Abaixo: **KPIs** curtos
> (total, ativas, bloqueadas, concluídas, atrasadas, horas). Depois: a **tabela de etapas**
> (mesma linguagem visual do Início), clicável → abre um **painel/modal read‑only** com o detalhe
> da etapa/tarefa (sem ações — as ações moram no detalhe da tarefa). Priorize “estreitar → varrer
> → inspecionar”. A tabela deve rolar horizontalmente em telas estreitas.

**Dados:** filtros (estado); KPIs (contagens); lista de **Etapa ativa**.
**Restrições:** P6. **Unificar:** a tabela e os KPIs são os mesmos do Início (não recriar).

## 3. Detalhe da tarefa — superfície de execução · `/tasks/[id]`

**Persona/acesso:** ver = autenticado; **ações** só para o responsável da etapa ativa ou
gestor; time logs só para gestor.

**Prompt de geração:**

> Crie a **tela de execução de uma tarefa**, layout em duas colunas. **Coluna esquerda (contexto
> → discussão):** cabeçalho com título, cliente/projeto, badges de status e prioridade, responsável
> e vencimento; descrição da tarefa e destaque da descrição do projeto; a **etapa atual** em
> evidência com acesso ao **histórico do fluxo** (linha do tempo de entradas/saídas de etapa,
> comentários, anexos); depois a **thread de comentários** + campo para novo comentário.
> **Coluna direita (agir):** botão **iniciar/parar trabalho** (cronômetro da sessão); **menu de
> ações da etapa** (avançar, reverter, reivindicar, concluir) — habilitado só se eu posso agir;
> **painel de artefatos** (arquivos da tarefa/projeto/cliente com origem, adicionar/remover);
> e, **só para gestor**, os **registros de tempo**. Use um **badge de status/prioridade
> consistente** com o resto do app.

**Dados:** **Tarefa** completa; lista de etapas do fluxo (com status/ordem/dependências);
histórico (logs/comentários/anexos); artefatos; time logs (gestor).
**Restrições:** P5 (mudança de estado só pela máquina de etapas). **Mudou vs hoje:** **remover** o
bloco de **armazenamento NAS** daqui (é infra/capacidade — vai para cliente/projeto); usar o
badge de status compartilhado (não rolar mapa de cor próprio).

## 4. Minha Evolução — analítica pessoal (privada) · nova tela pessoal

**Persona/acesso:** a **própria pessoa** e seu gestor (fail‑closed). Auto‑referenciada, **nunca**
comparativa. **Mudou vs hoje:** consolida o widget “Minha evolução” (que sai do dashboard) com o
relatório por‑pessoa (que sai do CRUD admin) numa visão única.

**Prompt de geração:**

> Crie uma tela **privada de evolução pessoal** — “como EU venho fluindo ao longo do tempo”,
> explicitamente **não comparada com colegas**. Blocos: (1) **Throughput** — gráfico de linha das
> minhas conclusões por semana (últimas ~8–12 semanas), com **eixos X (datas) e Y (quantidade)**;
> (2) **Utilização (mês)** — um percentual com a leitura “X h de Y h previstas”, apresentado como
> **faixa indicativa** (não alarme, não nota); (3) **Qualidade** — meu **certo‑da‑primeira‑vez
> (FTR)** e a divisão de retornos **interno vs cliente**, seguido da **lista dos retornos com o
> motivo de cada um sempre à vista** (o motivo é o material de coaching; o número nunca aparece
> sozinho); deixe claro em texto que boa parte da variação é do sistema. Só o gestor reclassifica
> um retorno (defeito vs mudança legítima); a pessoa vê, não reclassifica. Nada de ranking.

**Dados:** throughput (série); utilização; FTR + lista de **retrabalho** (com motivo).
**Restrições:** P1, P2 (exceção 3b: salvaguardas), P7 (utilização = faixa).

## 5. Kanban do projeto · `/projects/[id]`

**Persona/acesso:** qualquer autenticado (filtro “meu time” usa meus times).

**Prompt de geração:**

> Crie um **quadro Kanban de um projeto**: colunas na **ordem das etapas** do fluxo (mostre
> também colunas **vazias** — revelam lacunas de fluxo), cards agrupados pela etapa atual da
> tarefa. Topo: filtros (minhas tarefas / por time / responsável / prioridade / limpar). Cada
> **card** mostra título, badge de prioridade, vencimento relativo, avatar do responsável **e um
> sinal de exceção** (aging/bloqueada) — esta é a tela onde “o que está velho/travado” mais
> importa. Card clica → detalhe da tarefa. O board é **read‑only** para mudança de etapa (avançar
> acontece no detalhe da tarefa); deixe isso visualmente claro (não sugerir arrastar para avançar).

**Dados:** **Projeto** com tarefas (+ etapa atual, responsável, prioridade, vencimento, aging);
colunas derivadas dos templates.
**Restrições:** P6. **Mudou vs hoje:** o card passa a exibir **aging/bloqueada**; header
localizado (hoje “Cliente:” é hardcoded).

---

# Parte 3 — Gestor (cockpit, entregas, relatórios)

## 6. Cockpit — saúde do time · `/admin`

**Persona/acesso:** MANAGER+.
**Objetivo:** triagem diária — “onde eu ajo primeiro?”.

**Prompt de geração:**

> Crie o **cockpit de saúde do time de um gestor**, guiado por **exceção** (não é um mural de
> tabelas). Prioridade: (1) **A restrição do sistema** — um callout no topo nomeando a **única
> etapa que mais represa o fluxo** (some se não houver); é onde agir primeiro; (2) **1:1
> atrasados** — até ~5 pessoas cujo 1:1 está vencido, com “registrar 1:1” (confirmação + atualiza
> a lista) e um atalho para ver todas; (3) **Balanço de carga** — um **medidor de WIP por pessoa**
> (barra = WIP ÷ teto, com marca da mediana do time; verde/âmbar/vermelho por nível), com resumo
> (sobrecarregados / ociosos) e **drill‑down** num painel lateral; **nunca um ranking** — é
> distribuição de carga; (4) **Fila de envelhecendo** e (5) **Fila de bloqueados** — top‑N
> exceções, com aging vs SLA e risco por dependências, linkando ao detalhe; (6) **Violações de
> WIP** — etapas acima do teto (some se todas ok); (7) **Sinais de sobrecarga** — padrão
> **sustentado** por pessoa (utilização média + overtime + WIP), **informacional**, some se
> ninguém em risco. Adicione um bloco compacto de **carga ao vivo por time** (quantos em
> andamento, on‑track/atenção/atrasado). Cada card **some quando não tem exceção**.

**Dados:** restrição `{ etapa }`; cadência 1:1; carga (WIP por pessoa + mediana); filas de aging e
bloqueados (Etapa ativa); violações de WIP; burnout; carga ao vivo por time.
**Restrições:** P6 (exceção‑primeiro/ToC), P2/P7 (carga ≠ ranking), P1 (burnout informacional).
**Mudou vs hoje:** **remover os 5 contadores decorativos** do topo e o **rail de navegação**
(a navegação agora é global); **remover a redundância** da “rotina” que linkava para relatórios
cujos sinais já estão nos cards aqui; **trazer** a “carga ao vivo por time” (que hoje vive em
team‑productivity); tirar o storage por cliente daqui (fica em Clientes).

## 7. Demandas — lista, detalhe e criação · `/admin/tasks(+/[id], /new)`

**Persona/acesso:** MANAGER+.

**Prompt — lista:**

> Crie a **lista de todas as demandas** (tarefas) com **barra de filtros** (cliente / time / status
> / prioridade / busca) e **paginação**. Tabela: título, cliente/projeto, tipo, etapa atual,
> prioridade, responsável, vencimento (com badge de estado de prazo). CTA **“Criar demanda”** no
> topo. Badges de status/prioridade **consistentes** com o app. Estado vazio (com e sem filtro).

**Prompt — detalhe:** igual à _tela de execução da tarefa_ (§3), porém com as ações de ciclo de
vida sempre disponíveis (gestor) e os registros de tempo visíveis.

**Prompt — criação:**

> Crie um **formulário de criar demanda**: título, descrição, **projeto** (com atalho “criar
> projeto/cliente”), **tipo/template**, prioridade, vencimento. Ao escolher o tipo, mostre a
> **pré‑visualização das etapas** (com checkbox de inclusão para as opcionais e um seletor de
> responsável por etapa). Quando houver histórico do tipo e uma data de vencimento, exiba uma
> **checagem de viabilidade informacional**: comparando os dias disponíveis com os percentis
> (p50/p85) daquele tipo — “confortável / apertado / em risco” + início ideal — que **informa, não
> bloqueia**. Se o responsável da etapa de entrada é novo no tipo, a banda fica mais conservadora
> (p95) com uma nota; se a 1ª etapa for desmarcada, a entrada é a próxima etapa incluída.

**Dados:** lista de **Tarefa**; para criação: projetos, templates (+ etapas com time/opcional),
previsão por tipo `{ p50, p85, p95, amostra }`.
**Restrições:** P1/P3/P4 (viabilidade informa, probabilística, por classe).

## 8. Fluxo & Entrega — relatório de fluxo (fundido) · `/reports/performance` (absorve team‑productivity)

**Persona/acesso:** MANAGER+. **Mudou vs hoje:** **funde** performance + team‑productivity num só
relatório de fluxo, com **um** sistema visual e **uma** barra de filtro; segmentável por **tipo**
e por **time**.

**Prompt de geração:**
Crie o **relatório de fluxo e previsibilidade** de uma agência, segmentável por **tipo de trabalho** e por **time** (uma barra de filtro única: período + time + cliente + projeto + tipo). Blocos, nesta ordem: (1) **headline de lead time** (médio/mediano + amostra); (2) **cycle‑time em percentis** — p50/p85/p95 + um **scatter** dos concluídos com linhas de referência; enquadre o **p85 como o prazo confiável** (não a média); (3) **previsão de entrega (Monte Carlo)** — backlog atual, quando fica pronto no p85, entregas nos próximos 30 dias; (4) **throughput no tempo** (linha, eixos X/Y) e **CFD** (área empilhada por status, eixos X/Y — banda de bloqueadas alargando = represamento); (5) **on‑time por time** e **carga atual por time**; (6) **exceções**: gargalos (top‑3 etapas mais lentas), **eficiência de fluxo por etapa** (separa “lento” de “esperando” — diagnósticos opostos); (7) **qualidade agrupada num bloco só**: certo‑da‑primeira‑vez por etapa, retrabalho por **etapa‑origem** e a distinção **interno vs cliente**. Mostrar **aviso de baixa confiança** quando a amostra é pequena (N<8). Todos os gráficos com **eixos rotulados**.

**Dados:** lead time; cycle‑time percentis + pontos; forecast; throughput (série); CFD (série); on‑time e carga por time; gargalos; eficiência de fluxo por etapa; FTR + retrabalho por origem.
**Restrições:** P3/P4 (probabilístico, por classe), P5 (qualidade na fonte, interno≠cliente), P6 (exceção). **Unificar:** throughput e duração‑por‑etapa aparecem **uma vez** (hoje duplicados entre as duas telas).

## 9. Horas & Utilização · `/reports/productivity`

**Persona/acesso:** MANAGER+.

**Prompt de geração:**
Crie o **relatório de horas** de um mês. Blocos: total de horas (banner); **horas por pessoa** com a **utilização** de cada uma (horas ÷ meta) apresentada como **faixa indicativa** — jamais como nota ou ranking (é guarda de sobrecarga/ócio, e o benchmark é aproximado); horas por projeto, por cliente e por etapa (tabelas que se auto‑ocultam quando o respectivo filtro já está ativo). Barra de filtro única (mês + time + cliente + projeto). Exportar CSV/PDF nas tabelas. **Não** colorir a pessoa como “vermelha/ruim” — utilização é contexto, não julgamento.

**Dados:** horas por usuário (+ utilização), por projeto, por cliente, por etapa.
**Restrições:** P7/P1 (utilização faixa, não nota).

## 10. Pessoas — visão por pessoa (reconciliada) · `/reports/user/[id]` (absorve analytics do admin)

**Persona/acesso:** a própria pessoa e o gestor (fail‑closed). **Mudou vs hoje:** unifica o relatório por‑pessoa com as análises que hoje estão **enterradas no CRUD** `/admin/users/[id]`. É a **mesma** analítica da tela _Minha Evolução_ (§4), vista pelo gestor.

**Prompt de geração:**
Crie a **visão de uma pessoa para o gestor** — coaching, não avaliação. Igual à tela “Minha Evolução”: throughput próprio no tempo (eixos), utilização como faixa, e qualidade (certo‑da‑primeira‑vez + retornos interno/cliente **com o motivo de cada um**), aqui com o controle de **reclassificar** um retorno (defeito vs mudança legítima) disponível só para o gestor. Acrescente as etapas ativas atuais da pessoa e seus registros de tempo recentes. **Auto‑referenciado, nunca comparado com outras pessoas.** O CRUD de editar a pessoa (papel, times, capacidade) **não** vive aqui — é uma tela separada de administração.

**Dados:** throughput; utilização; FTR + retrabalho (com motivo, reclassificável); etapas ativas; time logs.
**Restrições:** P1/P2 (exceção 3b), P7.

## 11. Calendário — semanal + mensal (unificado) · `/reports/calendar`

**Persona/acesso:** MANAGER+. **Mudou vs hoje:** **uma** feature com **toggle semana/mês** (hoje são duas telas/dois cards); é uma ferramenta **operacional** (reagenda), então idealmente vive numa seção de planejamento, não “relatórios”.

**Prompt de geração:**
Crie um **calendário de demandas** com **alternância entre visão semanal e mensal** e uma **navegação de período única** (anterior / hoje / próximo). **Semana:** grade de 7 dias com as tarefas por dia; permitir **arrastar para reagendar** o vencimento. **Mês:** grade do mês com as demandas, e uma sobreposição de **feriados** e **aniversários/aniversários de casa** (marcador discreto). Filtros: time / projeto / pessoa / mostrar concluídas. Permitir **criar demanda(s)** a partir de um dia (inclusive em lote para vários projetos). Deixe claro o que é planejamento (escrita) vs leitura.

**Dados:** tarefas no intervalo (com vencimento); feriados; aniversários.
**Restrições:** P6.

## 12. Presença ao vivo — board + modo TV (unificado) · `/reports/live-activity` (absorve `/tv`)

**Persona/acesso:** MANAGER+ (board); modo TV é um wallboard. **Mudou vs hoje:** funde a “atividade ao vivo” e a tela `/tv` numa **feature só, com um “modo TV”** (tela cheia, escura, sem navegação).

**Prompt de geração:**
Crie um **quadro de presença em tempo real**: quem está **online / trabalhando (em qual tarefa) / offline**, atualizado ao vivo (stream com fallback de polling), com contadores e filtros (estado, visibilidade por time). Ofereça um **“modo TV”**: tela cheia, tema escuro, tipografia grande, relógio, **sem navegação** — para um monitor de parede. Enquadre como **operacional/ informativo**, **não como vigilância nem ranking** (sem “quem trabalhou mais”). Extraia o card de pessoa como um bloco reutilizável entre o board e o modo TV.

**Dados:** presença `{ pessoa, estado, tarefaAtual?, desde }`.
**Restrições:** P1/P2 (informativo, não vigilância/nota). **Nota de segurança:** o modo TV público precisa ter os dados protegidos na API.

## 13. Clientes — lista e detalhe · `/admin/clients(+/[id])`

**Persona/acesso:** MANAGER+.

**Prompt de geração:**
**Lista:** clientes com número de projetos, criar/excluir inline, busca. **Detalhe:** cabeçalho editável do cliente (nome, contato, pasta NAS com trava), contadores, **artefatos** do cliente e **armazenamento (storage) por projeto** (barras por ocupação — é a casa certa dessa info de capacidade), e a **lista de projetos** do cliente (criar projeto, ativar/desativar, abrir o Kanban). Filtro de status de projeto (pendentes/concluídos) **traduzível**.

**Dados:** **Cliente** (+ projetos, artefatos, storage por projeto).
**Restrições:** P8 (traduzir os rótulos hoje hardcoded). **Recebe:** o `StorageBreakdown` que saido detalhe da tarefa e do cockpit.

## 14. Projetos — lista (nova) e detalhe · `/projects` + `/admin/projects/[id]`

**Persona/acesso:** MANAGER+. **Mudou vs hoje:** **criar a lista de projetos** (hoje projetos só
são acessíveis via cliente; não há índice).

**Prompt de geração:**
Crie uma **lista de projetos** (todos os projetos, com cliente, % de conclusão, status, busca/filtro por cliente) e o **detalhe do projeto**: cabeçalho editável (nome, descrição, cliente), **% de conclusão** + contadores de status das tarefas, a **tabela de tarefas** do projeto (com badges consistentes), **artefatos** e **armazenamento por tarefa**, e atalho para criar tarefa já no projeto. Link para o Kanban do projeto.

**Dados:** lista de **Projeto**; **Projeto** detalhado (+ tarefas, artefatos, storage).
**Restrições:** P8; badges consistentes.

---

# Parte 4 — Administração (CRUD)

Estas três telas compartilham um **padrão de lista simples** (criar + tabela + excluir) e um **padrão de detalhe editável**. Peça à ferramenta um **componente de lista CRUD reutilizável** e um **modal padrão** (não modais artesanais diferentes por tela).

## 15. Usuários · `/admin/users(+/[id])` — só ADMIN

**Prompt:**
**Lista:** diretório de usuários com busca, filtro (papel/time), ordenação e paginação; por linha, editar. **Editar (modal padrão):** papel, times, data de nascimento, admissão e **capacidade semanal (horas)**. **Importante:** a **analítica da pessoa** (throughput/utilização/ qualidade) **não** fica aqui — ela vive na tela _Pessoas_ (§10). Esta tela é **CRUD puro**.

**Dados:** **Usuário**; times. **Mudou vs hoje:** move a analítica para _Pessoas_; usa o modal padrão (não artesanal).

## 16. Equipes · `/admin/teams(+/[id])` — só ADMIN

**Prompt:**
**Lista:** times com contagem de membros, criar/excluir. **Detalhe:** editar nome, **gerir membros** (busca + seleção por checkbox, modal padrão), e a lista de **etapas‑modelo que têm este time como responsável padrão** (com link para o fluxo). Reusar o mesmo padrão de lista simples dos Clientes.

**Dados:** **Time** (+ membros, etapas‑padrão).

## 17. Fluxos de trabalho — editor de templates · `/admin/templates(+/[id])`

**Persona/acesso:** MANAGER+ (ADMIN pra editar). Este subsistema é **coeso**; descreva‑o como uma ferramenta.

**Prompt de geração:**
Crie um **editor de fluxo de trabalho (template)**. **Lista:** templates com nº de etapas e data, criar. **Editor:** cabeçalho editável (nome/descrição) + excluir; **adicionar etapa** (nome, time responsável, dependências); **lista de etapas** onde cada uma expande para editar (ordem, time, SLA, opcionalidade, **limite de WIP**, dependências); e uma **visualização do grafo** de etapas e dependências (DAG). É a única tela genuinamente “ferramenta de configuração” — priorize clareza de edição e do grafo. Padronize o estilo de card e o namespace de textos com o resto do admin.

**Dados:** **Template** (+ etapas‑modelo com dependências, SLA, wipLimit, time).
**Restrições:** P8 (namespace de i18n consistente).

---

# Parte 5 — Apoio

## 18. Conta · `/account`

**Prompt:**
Crie a **tela de conta**: dossiê read‑only (nome, email, papel, time, aniversário, admissão) com nota de que os dados sincronizam do Google; e um bloco de **preferências** reunindo **idioma** e **tema** juntos, mais **sair**. Um único caminho de logout. Tudo traduzível.

**Restrições:** P8. **Mudou vs hoje:** o **tema** vem do menu para cá (ao lado do idioma); logout unificado.

## 19. Ajuda · `/help(+guias)`

**Prompt:**
Crie um **hub de ajuda** com cards para cada guia (colaborador, projetos, templates) e uma **tela de guia** que renderiza seções, passos e destaques a partir de conteúdo estruturado, com **figuras/screenshots** (placeholder rotulado quando a imagem ainda não existe) com zoom. Se possível, deep‑link “experimentar” para a tela real que o passo documenta. Tudo traduzível.

**Restrições:** P8.

## 20. Login / Home pública · `/auth/signin`, `/`

**Prompt:**
**Login:** entrar com Google, com uma linha de termos **traduzível**, respeitando o destino original (voltar para a página que o usuário tentou abrir após autenticar). **Home pública:** hero com “Entrar” e “Ver apresentação” (deck de onboarding que explica a filosofia do produto). Autenticado → redireciona para o Início.

**Restrições:** P8; preservar o `callbackUrl` no login.

---

## Como este documento se relaciona com os outros

- **O quê/por quê:** [arquitetura-de-informacao.md](./arquitetura-de-informacao.md) (diagnóstico,
  realocações §3, roadmap §4).
- **A régua de princípios:** [biblioteca-de-conhecimento.md](./biblioteca-de-conhecimento.md)
  (P1–P8, mapa de defesa).
- **Este doc:** o **briefing de geração por tela** (o “como pedir para a ferramenta criar cada
  tela ajustada”). Ao mudar uma tela, atualize também o mapa de defesa (§3 da biblioteca) para a
  tela não perder o vínculo com o princípio que a justifica.
