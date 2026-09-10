# Pendências abertas

Coisas encontradas em uso, com decisão já tomada e execução adiada. Cada item traz o que está
errado (ou o que falta), a evidência, e por que importa — para quem pegar não precisar redescobrir.

Item resolvido sai daqui e vira commit; item que virar feature grande vira spec própria.

---

## 1. Linha do tempo do projeto — o teto de tamanho da grade

**O que é:** a revisão final da linha do tempo (`/projects/{id}`) levantou quinze pontos. Nove foram
corrigidos na entrega, três na varredura de 02/set/2026 (tooltip, `diasAtras`, chaves mortas) e este
segue aberto, de propósito.

**`stageTransition.findMany` cresce com a história do projeto**, não com a janela desenhada: é
consulta em lote (não é N+1), mas num projeto muito antigo traz uma linha por transição só para
extrair os dias em que houve liberação de etapa. Não dá para estreitar sozinho: `distinct` por
(demanda, etapa) apagaria a reativação de uma etapa que voltou atrás — retrabalho é movimento real,
e a grade ficaria mentindo por omissão. E a janela só se conhece DEPOIS de ler o que teve movimento.

**Direção:** vira problema junto com o **teto de tamanho da grade**, que a spec adiou de propósito —
e é lá que os dois se resolvem de uma vez: com um teto, a consulta ganha um limite de data para
respeitar. Enquanto isso, o `select` já leva só o que o consumidor usa (`taskId`, `at`).

---

## 2. Dois testes da janela fixa não discriminam

**O que é:** a revisão final da janela fixa aprovou o código e apontou dois testes que passariam
igual se ele estivesse errado — o que os torna decoração, não rede.

- Em `week-planning-write.test.ts`, "checagem ancorada no dia de DESTINO" usa o MESMO dia como
  origem e destino, então não distingue as duas coisas que o nome promete distinguir.
- No teste do compromisso fantasma, o laço `expect(args.where.plannedDate).not.toBeNull()` é vazio:
  naquele caminho nenhuma consulta chega a rodar. A outra asserção do mesmo teste (o `data` gravado
  com a janela limpa) é forte e é ela que segura a regra.

**Por que importa:** o código está correto hoje — os dois foram conferidos por rastreio, não por
teste. Mas um teste que não falha quando deveria dá a impressão de cobertura onde não há, e é
exatamente na borda do fantasma (dia nulo virando dia real) que uma regressão futura passaria batido.

**Direção:** dar ao primeiro dias diferentes para origem e destino, e trocar o laço vazio por uma
asserção sobre o que aquele caminho de fato faz.

---

## 3. `prisma migrate dev` está quebrado para todo mundo

**O que é:** rodar `migrate dev` para replicar o histórico de migrações no shadow database falha
com `P3006`: o tipo `ActiveStageStatus` não é criado por nenhum arquivo de migração — um buraco
pré-existente na história, não desta entrega. `migrate deploy` (aplica os arquivos pendentes direto,
sem shadow DB) funciona normalmente e foi o que a tela da etapa usou para gravar
`TaskComment.activeStageId`/`kind` e `Task.createdById`.

**Por que importa:** quem criar a PRÓXIMA migração vai tropeçar no mesmo `P3006` sem entender por
quê, porque `migrate dev` é o comando padrão e o defeito não está na migração nova — está numa
anterior.

**Direção:** achar a migração que deveria ter criado `ActiveStageStatus` e corrigi-la (ou recriar o
tipo numa migração de reparo), depois confirmar que `migrate dev` volta a replicar limpo.

---

## 4. `PresenceCard` não consegue linkar para a etapa

**O que é:** das seis listagens em formato de etapa que passaram a apontar para
`/tasks/{id}/stages/{activeStageId}`, `PresenceCard` é a única que ficou apontando para a demanda.
`ActivityLog.stageId` é chave estrangeira para `TemplateStage`, e o modelo não tem relação nenhuma
com `TaskActiveStage` — chegar à instância exigiria uma busca nova por `(taskId, stageId)`, fora do
que a consulta atual já traz.

**Por que importa:** é a única das seis sem o link, e o motivo é estrutural (schema), não uma
consulta que só faltou um campo — três das outras cinco eram exatamente isso (`AgingQueue`,
`BlockedQueue` e `TeamLoadBalanceClient`: bastou `id: true` a mais no `select`); as duas restantes
— minhas etapas e dashboard — já tinham o id em mãos.

**Direção:** decidir se vale a busca extra por `(taskId, stageId)` para este card, ou se a relação
correta é acrescentar em `ActivityLog` uma referência à instância — o que também serviria de base
para outras leituras que hoje só têm o id do template.

---

## 5. O `not-found.tsx` da demanda com português cravado

**O que é:** `app/[locale]/(protected)/tasks/[taskId]/not-found.tsx` tem português cravado, sem
`getTranslations`, ao contrário dos quatro irmãos conformes do mesmo padrão (o `not-found.tsx` da
rota nova da etapa foi escrito certo desde o início).

Era um item de três; os outros dois foram fechados na revisão final da tela da etapa —
`components/tasks/TaskActionsMenu.tsx` (morto, e ainda chamando `LogTimeButton` sem etapa) foi
removido, e o "Registrar Tempo" cravado em `LogTimeButton` virou `tasks.actions.logTime`.

**Por que importa:** não quebra nada hoje, mas é uma tela inteira que a paridade de locales não
pega — porque a string não está em locale nenhum para comparar contra.

**Direção:** migrar o `not-found.tsx` da demanda para `getTranslations`, no padrão dos irmãos.

---

## Todo link existente está INTERNO por omissão

**Onde:** `TaskArtifact.sensitivity` dos artefatos de link, criados antes de a aba pedir o campo.

Os dois caminhos de criação de link — `addLinkArtifact` (`lib/actions/task.ts`) e
`addScopedLinkArtifact` (`lib/actions/artifact.ts`) — nunca gravaram `sensitivity`. Os dois caíam no
padrão do schema, `INTERNO`. A partir da importação para o NAS a aba passa a pedir o campo, o que
conserta daqui para frente e não toca no que já existe.

**Por que importa:** a sensibilidade é a etiqueta do artefato e é o que vai definir o que o cliente
enxerga. No dia em que essa visão do cliente entrar no ar, **todo link anterior fica invisível para
ele** — não porque alguém decidiu, mas porque ninguém foi perguntado. Um dado que nasce de omissão e
depois governa acesso é a forma mais silenciosa de errar: não dá erro, só não mostra.

**Direção:** é decisão de dado, não de código, e de quem conhece o acervo — marcar em massa como
CLIENTE o que for material de cliente, ou deixar cada dono remarcar o seu. O que não pode é a virada
da visão do cliente acontecer antes dessa decisão.

**Decidido em 2026-09-09:** o acervo atual fica como está, `INTERNO`, porque ainda é dado de teste —
não há material de cliente de verdade a proteger. **A pendência não morre, ela hiberna:** volta a
valer no instante em que entrar acervo real, e mais ainda antes de a visão do cliente ir ao ar. Quem
reabrir isto precisa saber que a decisão foi tomada sobre dado descartável, não sobre o acervo que
existir naquele dia.

---

## Anexo do Trello exige login — medido, não suposto (2026-09-09)

A importação para o NAS foi construída para atender à migração do Trello. No primeiro teste real com
um anexo de lá, o resultado foi `SOURCE_REFUSED` ("a origem recusou o download").

**A causa foi medida, e não é nossa.** O mesmo link abre no navegador (que manda os cookies da
sessão), mas do caminho de rede do próprio NAS:

```
curl -o /dev/null -w "%{http_code}" -A "" 'URL'   ->  401
curl -o /dev/null -w "%{http_code}"     'URL'     ->  401
```

Igual com e sem `User-Agent`, o que descarta a hipótese de o agente estar sendo barrado por não
mandar cabeçalho de navegador — era a suspeita razoável, já que ele não manda nenhum. É
autenticação: o anexo está atrás de login.

**Consequência para uma decisão que estava em aberto.** A spec da importação deixou "traduzir link de
fornecedor" fora do escopo _até a migração mostrar se valia a pena_. Para o **Trello**, está
respondido: não vale, porque o obstáculo é permissão, e nenhuma reescrita de URL contorna login. Para
o **Drive**, o obstáculo é outro — link de compartilhamento devolve a página de visualização, e a
forma de download direto existe para arquivo público. Lá a tradução resolveria de fato.

**Os caminhos que sobram para o acervo do Trello**, do mais barato ao mais caro: quem tem acesso baixa
e sobe pelo NAS (funciona hoje, sem código, mas exige estar na rede local — que é exatamente a
limitação que a importação existe para contornar); ou move para o Drive com link público e importa de
lá. A segunda é a que torna a tradução de link do Drive um investimento com retorno claro.

---

## Higiene deixada pela importação de link (2026-09-09)

Dezesseis achados menores que a revisão final triou como "podem esperar" — nenhum tem consequência
em produção, e a recomendação dela foi agrupá-los numa fatia só, em vez de espalhá-los.

**Testes que não seguram o que dizem segurar**

- `useNasReupload` e `guessMediaType` não têm teste dedicado; a cobertura é indireta.
- Dos quatro testes do rótulo de tipo (`artifacts-unify`), só um discrimina a mudança; os outros três
  produzem o mesmo resultado com a regra antiga e com a nova (e se nomeiam honestamente como
  não-regressão).
- `importPathTaken` (colisão de caminho, P2002) está implementado e sem teste.

**Arestas de código**

- `deriveFileNameFromUrl(...) as string` recomputa e faz asserção de tipo em vez de aproveitar o
  resultado que `checkImportUrl` já validou.
- `user.id as string` — a origem é o tipo de retorno de `requireMemberOrHigher`/`requireManagerOrAdmin`.
- `addLinkArtifactVersion` ainda herda o `type` legado (sai junto com a coluna, por desenho).
- O botão de editar importação usa só o `isPending` global, sem estado de "salvando" próprio.
- `NOT_A_FILE` está no `FetchFailureCode` do agente e nunca é lançado por lá (quem o produz é a
  tradução no worker).
- `nas-poc/agent/src/nas-path.ts` não é importado por nenhum arquivo de `src/` — a política de tipos
  do agente é cópia documental, não imposição em runtime. Quem for mantê-la precisa saber disso para
  não pagar o custo achando que compra segurança.

**Robustez do agente, sem consequência hoje**

- `destroyAndUnlink` espera `finished(ws)` sem prazo; num mount de NAS travado, o caminho de
  desistência fica refém de um `open()` que não volta. Não é risco novo (o `unlink` anterior já era
  uma chamada de sistema sem prazo no mesmo caminho).
- `startImportWorker` descarta o timer que devolve, diferente do worker irmão que o guarda para o
  encerramento. Ambos têm `unref`, então nada trava.
- `pedirFila` não tem tratamento próprio para exceção de rede (o não-2xx já passou a ser registrado).
- `FinalizeQueue.enqueue` não deduplica por artefato: duas falhas do mesmo artefato viram dois jobs,
  e o reagendamento só encontra o primeiro.
- O relato de falha não carrega marca da tentativa: sob queda longa da nuvem, um relato antigo
  drenado da fila pode marcar como falha uma tentativa nova já em curso.
- O filtro de "já estou processando" roda na montagem da lista, não dentro do laço.
- A régua de endereços não cobre 6to4 nem NAT64 (ver as limitações da importação, acima).

---

## Limitações conhecidas, registradas em outro lugar

Não são pendências desta lista, mas quem lê aqui costuma precisar delas:

- **Demanda não se edita** — decisão explícita. Título, prazo e prioridade só são escritos na
  criação. Por isso toda porta de criação precisa da mesma trava de prazo (formulário, criação em
  lote do calendário, duplicar).
- **Upload de artefato é LAN-only** — fora da rede, só o registro de link. Ver a spec da tarefa
  rápida, seção "Problema em aberto — foto do artefato fora da rede".
- **Marcar demanda como obsoleta não apaga as horas apontadas nela.**
- **Comentário e demanda de antes da tela da etapa não têm etapa nem criador.** `TaskComment.activeStageId`
  e `Task.createdById` nasceram sem backfill, de propósito: inventar o vínculo pelo autor era
  exatamente o defeito que a tela da etapa fechou, e gravar esse chute teria promovido palpite a
  dado. Quem consultar o banco direto — relatório, migração de dados, investigação — precisa saber
  que `activeStageId` nulo ou `createdById` nulo em registro antigo não é erro de gravação.
  `kind` NÃO entra nessa lista: a coluna é `NOT NULL DEFAULT 'USER'`, então comentário antigo
  nenhum ficou sem ela — todos nasceram (retroativamente) `USER`, que é exatamente o que eram.

### Limitações da importação de link para o NAS (2026-09)

- **A importação não fecha DNS rebinding.** O agente confere o DNS contra faixas privadas — a
  régua é `isPrivateAddress`, escrita à mão em `nas-poc/agent/src/fetch-source.ts` (não existe
  dependência nenhuma para isso: nenhum `package.json` do projeto traz `ipaddr.js`) — e depois faz
  o `fetch` — entre as duas consultas, uma resposta DNS com TTL curtíssimo pode trocar o endereço
  e fazer o `fetch` cair num servidor público. Fechar a brecha de verdade exigiria fixar o IP da
  primeira resolução e falar TLS com SNI manual. O que a trava atual cobre — literal privado
  (`127.0.0.1`, `::1`), nome que resolve para privado, e a reconferência de DNS a **cada**
  redirecionamento HTTP — é a maior parte do risco real; isto é o que fica descoberto.

- **Também não cobre 6to4 (`2002:7f00:1::1`) nem NAT64 (`64:ff9b::7f00:1`)**, que embutem
  endereços IPv4 internos em faixas de IPv6 que `isPrivateAddress` não reconhece. Coerente com o
  que o próprio arquivo declara: é uma lista de faixas conhecidas, não uma prova completa.

- **Só link direto.** Um link de visualização do Drive ou do Trello devolve uma página HTML
  (não um arquivo) e morre com o código de falha `NOT_A_FILE`, visível ao usuário na tela.
  Traduzir link de fornecedor externo (abrir um download por trás de um redirecionamento)
  ficou fora de propósito: é código que cada fornecedor muda sem avisar, e a manutenção
  ficaria quebrando sozinha.

- **O cron de reconciliação não toca importação.** O cron `/api/cron/nas-reconcile` expira
  uploads de navegador parado (aqueles que nunca chegaram ao agente). A importação tem liveness
  própria: a reserva do endpoint `/api/artifacts/import-queue`, carimbada uma ÚNICA vez
  (`importClaimedAt`) quando o agente pega o item — o agente não a renova. Um `PENDING` de
  importação não expira por tempo; a reserva é que vence, sozinha, depois de `IMPORT_LEASE_MS`
  (2h). Ao vencer, o item **volta para `PENDING`** (não é descartado) — é a recuperação de um
  agente que reiniciou no meio de um download. Quem mexer no cron de reconciliação e seus TTLs
  precisa saber que `PENDING` significa **duas coisas diferentes** conforme o artefato tenha ou
  não um `url`: upload de navegador fica órfão e entra na expiração do cron; importação volta
  sozinha para `PENDING` quando a reserva vence, sem o cron entrar em ação.

---

## Limitações da importação do Trello (2026-09)

**Cards de instrução ficam fora.** 10 cards que não têm anexo nenhum — o conteúdo está no título
e na descrição — merecem decisão humana, um a um. São: `MODELO - Checklist materiais campanhas` (×2) ·
`ACCESSOS` · `TAMAÑO - Banners Web` · `TAMAÑO OOH - Tienda` · `TAMAÑO DOOH` ·
`MODELO - SOLICITAÇÃO Tráfego` · `TAMAÑO - Contenido de Tráfego` · `Modelo - Pedido Tráfego` ·
`MODELO - SOLICITAÇÃO Briefing`. Nenhum é demanda; todos ficam para revisão manual.

**O que não foi importado e por quê.** Além das 10 instruções acima, a importação descarta:

- **38 separadores visuais** (`PRIORIDAD 👆`, `EN PROCESO ⬆️`, `-----`, `☝ ALTERACIÓN ☝`) — mobília de quadro, não trabalho.
- **25 registros de ausência** (`FERIADO`, `FÉRIAS`, `DIA LIBRE`, `REUNIÓN`) — eventos e faltas, não demandas.
- **26 demandas sem etapa mapeável** — nenhuma evidência de por onde passaram no processo (movimentação, anexo com data ou lista de origem reconhecida). Importá-las marcaria etapa inventada — o oposto do combinado.
- **Comentários (33 no export).** O export do Trello corta em 1000 ações no total, cobrindo só 2026-08-12 → 2026-09-09. Importar comentários antigos cortados e novos sem contexto não paga o custo de mapeá-los.

**Anexos são LINK para o Trello, não cópias.** 454 dos 455 arquivos são `isUpload: true` e hospedados atrás de autenticação (`curl 'URL' → 401`). A importação para o NAS não consegue baixá-los. Cada um entra como **artefato de link**, com nome, tipo de mídia e a URL original. **Se o quadro do Trello for apagado ou a conta encerrada, as referências morrem junto.** É consequência aceita da decisão de não guardar credencial do Trello para uma migração única — mas quem depender desses arquivos (3,47 GB, maior arquivo 201 MB) precisa saber.

**A repescagem manual de pessoas.** 5 dos 17 membros do Trello não casaram com usuário do WorkOS: `FSRezende`, `Franciele Souza`, `Paola Palma`, `Vladimir Goon`, `rocio bernal` — juntos, 2 demandas. `Sara Goon` era a sexta e foi resolvida por declaração no script (`MANUAL_MATCHES`, em `scripts/import-trello/run.ts`): o e-mail dela no WorkOS é `saragoonmmkt@gmail.com`, com dois `m`, fora do padrão que as três chaves reconhecem. **O cadastro continua com o e-mail fora do padrão** — se alguém quiser que o casamento automático passe a funcionar, é lá que precisa mexer, sabendo que o e-mail é a chave de login por Google.

**O `Black Friday 2026` deixou de existir.** A pergunta era se aquele projeto de teste conviveria com os 17 mensais; o dono do projeto apagou os projetos de teste antes da gravação, então a importação entrou em terreno limpo. Não há decisão pendente aqui.

**O Desenho só tem dono quando a lista diz o nome.** 44 das 96 etapas de `Desenho` ficam sem
responsável: são os cards que nunca pararam nem passaram por uma lista `DISEÑO - <NOME>`, e para
eles o quadro não diz quem desenhou. O autor do anexo não serve como resposta — é quem SUBIU o
arquivo, com frequência o atendimento. Se alguém souber de quem eram essas 44, é correção manual.

**O desempate do responsável pode inflar quem supervisiona.** Quando o card declara 2 a 4 membros e nada desempata, a etapa fica com o **primeiro da lista do card** — decisão explícita do dono do projeto, e é escolha, não medição: a ordem em que o Trello guarda os membros não significa nada. Vale para `Audio Visual`, `Quality Control`, `Aprovação` e `Relatório` — nunca para `Desenho`, que exige o nome da lista. Quem olhar métrica de execução por pessoa precisa saber disso antes de concluir qualquer coisa.

**A reclassificação de "arquivado" (2026-09-10).** O desenho original marcava `OBSOLETE` todo card
arquivado fora de `Concluido`, e isso deixou 12 projetos mensais com 100% das demandas descartadas —
63 peças entregues que o sistema exibia como nada. A evidência derrubou a decisão: 100 das 101
arquivadas pararam numa lista de produção ou no portão, o arquivamento está espalhado por 84 dias
distintos em 14 meses, e a mediana da distância entre o prazo e o arquivamento é ZERO dia. Hoje a
importação não produz `OBSOLETE`: 152 concluídas e 52 abertas. **O que fica em aberto é o inverso:**
se alguma daquelas 152 tiver sido de fato abandonada, ela agora conta como entregue e infla o
throughput daquele mês. Não há no export como distinguir uma da outra — quem conhecer um caso
específico corrige à mão.

**Quality Control pendente fica sem dono.** As 45 etapas de revisão que as demandas abertas têm pela frente nascem sem responsável, de propósito: o portão de qualidade é do time de qualidade, não de quem abriu a demanda. Se o processo quiser um dono ali, é uma linha em `CREATOR_OWNED_STAGES` (`lib/trello/plan.ts`).

**Sobras da importação, sem efeito no dado gravado.** O relatório do ensaio não diz quantas demandas cada projeto mensal recebe nem quais cards foram descartados um a um (só a contagem por motivo); `applyImportPlan` tem um ramo de ensaio que o executável nunca chama, então as pré-condições de banco só são checadas na hora do `--commit`; `ReworkEvent.byTrelloId` e o `kind: "CLIENT"` nunca são escritos; os checklists de 3 cards não foram importados; e o mês do projeto é recortado do ISO em UTC enquanto o resto do app usa fuso de São Paulo, o que põe 18 das 204 num mês vizinho.

---

## O gatilho órfão que impedia criar demanda (2026-09-10)

`20250104160000_add_assignee_team_validation` criou o gatilho `check_task_assignee_team`, que lê
`NEW."assigneeId"` e `NEW."currentStageId"`. `20260901180000_drop_task_assignee` derrubou a coluna
`assigneeId` e **não** derrubou o gatilho. Um gatilho `BEFORE INSERT` que lê campo inexistente do
registro faz o Postgres recusar a linha com `column "new" does not exist` — mensagem que não aponta
para lugar nenhum. Resultado: **criar qualquer demanda no sistema falhou de 1º a 10 de setembro**, e
ninguém percebeu, porque os testes de criação usam cliente falso e nenhuma demanda de verdade foi
criada nesse intervalo. Apareceu na primeira gravação da importação do Trello, que quebrou nos 17
meses de uma vez. Corrigido em `20260910130000_drop_stale_assignee_team_trigger`.

**A lição que fica:** migração que remove coluna precisa remover o que lê aquela coluna — gatilho,
função, view, índice de expressão. E a suíte, que mocka o Prisma, é estruturalmente incapaz de ver
isso: nada aqui roda contra um banco de verdade. Enquanto for assim, a primeira escrita real depois
de uma migração destrutiva é o teste.
