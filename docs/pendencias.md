# Pendências abertas

Coisas encontradas em uso, com decisão já tomada e execução adiada. Cada item traz o que está
errado (ou o que falta), a evidência, e por que importa — para quem pegar não precisar redescobrir.

Item resolvido sai daqui e vira commit; item que virar feature grande vira spec própria.

---

## 1. Linha do tempo do projeto — o teto de tamanho da grade (medido em 2026-09-14)

**O que é:** `stageTransition.findMany` (em `lib/actions/project-timeline.ts`) cresce com a história
do projeto, não com a janela desenhada. É consulta em lote — não é N+1 —, mas traz uma linha por
transição só para extrair os dias em que houve liberação de etapa. Não dá para estreitar sozinho:
`distinct` por (demanda, etapa) apagaria a reativação de uma etapa que voltou atrás — retrabalho é
movimento real, e a grade ficaria mentindo por omissão. E a janela só se conhece DEPOIS de ler o
que teve movimento.

**Medido, o problema ainda não existe.** O acervo real, em 14/set:

| projeto               | demandas | dias com movimento (= colunas) | amplitude               |
| --------------------- | -------- | ------------------------------ | ----------------------- |
| AtlanticoShop 2026-08 | 43       | **36**                         | 2025-04-25 → 2026-09-10 |
| AtlanticoShop 2026-07 | 38       | 29                             | 2026-03-12 → 2026-08-28 |
| AtlanticoShop 2026-09 | 23       | 15                             | 2026-08-14 → 2026-09-10 |

O pior caso é 43 linhas × 36 colunas, e a consulta traz **71 transições**. Com a função em `gru1`
(ver a seção da latência) isso custa a casa de 10 ms. **Construir o teto agora seria resolver um
problema que o dado não tem** — e o teto é decisão de produto, não de código: quanto passado
esconder, e como dizer a quem olha que há história fora da tela. A spec o adiou de propósito.

**O gatilho para reabrir**, para não depender de alguém "achar que ficou lento": rodar a contagem
de novo e olhar as COLUNAS, não as demandas. É o eixo horizontal que fica ilegível primeiro — a
grade rola na vertical sem esforço, e na horizontal não. Acima de ~60 colunas vale desenhar o teto;
aí a consulta ganha o limite de data que ela hoje não tem por onde respeitar.

**Os três dias de 2025, investigados (2026-09-14) — não é defeito, é sinal.** A amplitude de quase
17 meses de `AtlanticoShop 2026-08` vem de três dias isolados em 2025. **A suspeita registrada aqui
antes estava errada:** ela dizia que a importação "datou etapas pela data do anexo" e que o conserto
era na origem do dado. Rastreado, nada disso se sustenta.

- **As datas estão certas.** `cardCreatedAt` decodifica a criação do id do card do Trello e só a
  usa quando ela não contradiz o primeiro evento conhecido (`lib/trello/writer.ts`). Os artefatos
  dessas demandas foram criados em 11/set/2026 — a data da importação —, não em 2025. Nada foi
  datado por anexo.
- **O projeto está certo.** `extractMonthKey` agrupa por `card.due || card.dateLastActivity`, ou
  seja, pelo mês em que o trabalho ESTÁ acontecendo, não pelo de criação. Um card de 2025 mexido em
  agosto/2026 pertence ao ciclo de agosto — é a regra, e ela é deliberada.

**O que existe de verdade são duas demandas abertas há mais de 15 meses**, as únicas do sistema
criadas antes de 2026:

| criada em  | dias parada | demanda                                    |
| ---------- | ----------- | ------------------------------------------ |
| 2025-04-25 | 507         | `MANUAL DE MARCA - atlantico`              |
| 2025-05-31 | 471         | `DISEÑO MOCKUP DE MARCAS - PEDIDO DE FRAN` |

As duas estão `IN_PROGRESS` com `Desenho` ACTIVE, **sem responsável, sem dia planejado e sem
prazo**. E **o sistema já as mostra**: as duas encabeçam a coluna "paradas" da carga por cliente
(`/planning/client-load`), com o "parado há N dias" ao lado — são 2 de **11 paradas**, das quais 7
em `Desenho` há mais de 60 dias.

**Portanto não há o que consertar no código.** As três colunas quase vazias no eixo da linha do
tempo são a consequência VISUAL de um fato REAL que a operação já tem sinalizado em outra tela.
Esconder o eixo esconderia o sinal.

**Decidido em 2026-09-14: as duas ficam ABERTAS.** O dono do projeto optou por mantê-las, ciente de
que estão paradas há mais de 15 meses. A consequência aceita: elas seguem no topo da coluna de
paradas e continuam esticando o eixo da linha do tempo daquele projeto. Quem reabrir isto não
precisa investigar de novo — a decisão é conhecida, e o que a mudaria é a operação, não o código.

## O histórico de migrações tinha um buraco — reparado em 2026-09-14

**O sintoma era `migrate dev` quebrado para todo mundo.** Rodar `prisma migrate dev` — o comando
PADRÃO para criar a próxima migração — falhava com `P3006 / 42704: type "ActiveStageStatus" does
not exist` ao replicar a história no shadow database. A mensagem apontava para a migração de
26/jun, que é inocente: ela só era a primeira a tocar no que nunca fora criado. Só `migrate deploy`
funcionava, porque ele aplica os arquivos pendentes direto, sem replicar nada.

**A causa, achada rodando o histórico contra um Postgres limpo:** `prisma db push` escreveu
objetos no banco sem deixar arquivo de migração. O histórico não criava `TaskActiveStage` — a
tabela CENTRAL do fluxo de etapas, alterada por seis migrações posteriores — nem os tipos
`ActiveStageStatus` e `ProjectStatus`. Com o replay destravado, `migrate diff` revelou o resto:
**dezenove diferenças**, todas da mesma origem — colunas de `Client`, `Project`, `User` e
`WorkflowTemplate`, a junção `_UserTeams` (pessoa pertence a várias equipes), três índices
compostos de `TaskActiveStage`, e a regra `CASCADE` das chaves de `TaskArtifact`.

**O reparo são duas migrações**, porque são dois problemas:

- `20260626140000_repair_active_stage_objects` — datada ANTES da primeira migração que referencia
  os objetos, senão o replay não chega até ela. Cria o enum com TRÊS valores, não quatro: quem
  acrescenta `INACTIVE` é a migração seguinte, e criá-lo já completo faria aquele
  `ALTER TYPE ... ADD VALUE` falhar por duplicidade. O reparo devolve a história como ela FOI, não
  como ela terminou.
- `20260914120000_repair_db_push_drift` — o resto do drift, no fim do histórico.

**As duas são idempotentes de propósito** (`IF NOT EXISTS`, `DO $$ ... EXCEPTION WHEN
duplicate_object $$`): em produção tudo isto já existe, e a migração precisa passar sem fazer nada.

**Verificado, não presumido.** Contra um Postgres 16 em container:

| o que                                                                    | resultado                                                           |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| replay das 38 migrações num banco vazio                                  | aplica limpo                                                        |
| `migrate diff` histórico replicado × schema                              | **No difference detected**                                          |
| `prisma migrate dev` com shadow database                                 | "Your database is now in sync" — **sem `P3006`**                    |
| simulação de produção (`db push` + 36 marcadas, depois `migrate deploy`) | aplica sem erro                                                     |
| o banco simulado × schema, depois do reparo                              | **No difference detected**                                          |
| replay do zero × simulação de produção                                   | **No difference detected** — os dois caminhos chegam ao mesmo lugar |
| reaplicar os dois reparos sobre banco completo                           | 0 erros, nenhuma mudança                                            |

**Aplicado em produção em 2026-09-14.** O build NÃO roda `migrate deploy` (é `next build` +
`prisma generate`), então commitar não aplicava nada — foi um passo à parte e deliberado. O pré-voo
mediu antes de agir: `migrate diff` entre o banco de produção e o schema dizia **No difference
detected**, e a única operação que não é puro no-op (derrubar e recriar as chaves de `TaskArtifact`,
que revalida a tabela sob lock) encontrou **550 linhas** — instantâneo.

Depois de aplicar: `migrate status` diz "Database schema is up to date!" com as 38; `migrate diff`
contra o schema continua **No difference detected**; e as contagens não se moveram (TaskArtifact
550, TaskActiveStage 232, User 34), com a relação pessoa↔equipe intacta. A latência seguiu na faixa
medida de manhã — nenhuma regressão.

**A lição, que é maior que o defeito.** `db push` é conveniente e não deixa rastro; o histórico de
migrações é a única memória reproduzível do schema. Um banco novo — a máquina de quem clonar, um
ambiente de teste, o shadow database — só existe através dele. Enquanto alguém usar `db push` num
schema versionado, este buraco volta a se abrir, e a próxima pessoa vai achar que a culpa é da
migração que a mensagem de erro nomeia.

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

## Higiene da importação de link — varrida em 2026-09-14

Eram dezesseis achados que a revisão final triou como "podem esperar", com a recomendação de
agrupá-los numa fatia só. **Quinze foram fechados. Três não eram higiene: eram defeitos**, e cada
um foi reproduzido por teste ANTES do conserto.

**Os três defeitos de verdade**

- **Rodadas concorrentes baixavam o MESMO artefato duas vezes.** O filtro de "já estou
  processando" rodava na montagem da lista. Com um item passava por acidente de ordenação; com
  DOIS — o caso real, porque a fila devolve lote — a rodada 1 trava em A, a rodada 2 começa B, e a
  rodada 1 segue para B sem reconferir. Dois downloads simultâneos para o mesmo caminho no NAS.
- **O backoff não segurava quando havia duplicata na fila de relatos.** `reschedule` acha o
  primeiro job (usa `find`), então o segundo mantinha o prazo vencido e era retentado a cada tick,
  contra uma nuvem já fora do ar. `enqueue` passou a deduplicar por artefato, guardando o payload
  novo e o AGENDAMENTO antigo — recuo e idade pertencem ao artefato, não ao relato.
- **A régua de endereços deixava passar 6to4 e NAT64.** `2002:7f00:1::1` é 127.0.0.1;
  `2002:a9fe:a9fe::1` é o endereço de metadados da nuvem. As duas embutem um IPv4 num IPv6 — a
  forma mais direta de pedir um endereço interno sem escrever um endereço interno.

**O que mais saiu**

- Testes que não existiam: `guessMediaType` (6) e `useNasReupload` (7). O guard mais valioso é o
  que confere a tabela de extensões contra o enum do banco: um erro de digitação ali ("FOTO" por
  "FOTOS") não falha no tsc nem em teste — falha no INSERT, em produção, com o arquivo já no NAS.
- `importPathTaken` ganhou dois testes que se cobrem mutuamente: catch largo demais derruba um,
  estreito demais derruba o outro.
- Os três testes de `artifacts-unify` que a revisão chamou de não-discriminantes são
  não-regressão DE PROPÓSITO, e isso é legítimo. Faltavam os casos em que as regras velha e nova
  discordam — com `type` E `mediaType`, mediaType vence; e `storageKind` não participa da decisão.
- **33 asserções `as string` removidas, todas redundantes:** `types/next-auth.d.ts` já declara
  `Session.user.id` como `string` obrigatório. Quem provou que eram dispensáveis foi o tsc.
- `checkImportUrl` devolve o `fileName` que já calculou, apagando a recomputação e a asserção do
  chamador.
- `NOT_A_FILE` saiu do `FetchFailureCode`: quem o produz é a tradução no worker, não o buscador.
- `pedirFila` trata a exceção de rede — "não consegui nem PERGUNTAR" deixou de se confundir com
  "falhei processando um item".
- `startImportWorker` devolve a PARADA, e `server.ts` a chama no encerramento.
- `destroyAndUnlink` ganhou prazo: o caminho de desistência não pode ser o que trava.
- `nas-poc/agent/src/nas-path.ts` ganhou um aviso no topo dizendo que nada em `src/` o importa —
  manter a política em dia ali CUSTA e não COMPRA segurança. Não foi apagado: a decisão é de quem
  mantém, e agora pode ser tomada com a informação na mão.
- O diálogo de editar importação ganhou o giro no botão. **A pendência estava desatualizada aqui:**
  ela dizia que faltava estado próprio, e o `isSubmitting` já existia — o que faltava era o retorno
  visual.

**O que ficou aberto, e por quê**

- **`addLinkArtifactVersion` ainda herda o `type` legado.** Por desenho: sai junto com a coluna.
- **O relato de falha não carrega marca da tentativa.** Sob queda longa da nuvem, um relato antigo
  drenado da fila pode marcar como falha uma tentativa nova já em curso. **A deduplicação de
  14/set reduziu a janela** — agora há no máximo um relato por artefato, e ele é sempre o mais
  recente —, mas não a fechou: o job pode esperar o backoff enquanto uma nova tentativa roda.
  Fechar de vez exige carimbar a tentativa (o `importClaimedAt` da reserva serviria) e a nuvem
  passar a ignorar relato de tentativa vencida. **É mudança de PROTOCOLO entre agente e nuvem, não
  ajuste local** — precisa de deploy coordenado dos dois lados, e é por isso que fica para uma
  fatia própria, com decisão explícita.
- **A régua do app continua mais fraca que a do agente** (regex, sem 6to4/NAT64). É aceitável e a
  assimetria é declarada: o app recusa CEDO com mensagem boa, mas quem trava de verdade é o
  agente, que reconfere o DNS a cada redirecionamento. O efeito prático de um 6to4 hoje é entrar
  na fila e falhar com `PRIVATE_HOST` em vez de ser recusado no formulário — pior experiência,
  mesma segurança.

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

- ~~**Também não cobre 6to4 nem NAT64**~~ — **fechado em 2026-09-14** no agente, que é quem trava
  de verdade: `isPrivateAddress` passou a extrair o IPv4 embutido de `2002::/16` e do NAT64
  bem-conhecido `64:ff9b::/96`, sem recusar o prefixo inteiro (`2002:0808:0808::1` é 8.8.8.8 por
  6to4, e barrá-lo seria recusar um host legítimo pelo transporte). **Continua fora:** os prefixos
  NAT64 de uso local (`64:ff9b:1::/48`, RFC 8215), em que a posição do IPv4 varia com o tamanho do
  prefixo. E a régua do APP (`lib/nas/import-source.ts`) segue por regex, sem os dois — assimetria
  aceita e explicada na seção da higiene.

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

**O Desenho só tem dono quando a lista diz o nome.** 40 das 71 etapas de `Desenho` ficam sem
responsável: são os cards que nunca pararam nem passaram por uma lista `DISEÑO - <NOME>`, e para
eles o quadro não diz quem desenhou. O autor do anexo não serve como resposta — é quem SUBIU o
arquivo, com frequência o atendimento. Se alguém souber de quem eram essas 40, é correção manual.

**~~A revisão de qualidade tem 12 donos que provavelmente estão errados.~~ CORRIGIDO em
2026-09-14.** As etapas de `Quality Control` percorridas aceitavam o membro declarado no card — a
mesma fonte que já fora tirada da aprovação. O caso mais claro: **Luis (Designers) constava como
quem fez o controle de qualidade de 8 flyers que ele mesmo desenhou.** Um portão assinado por quem
ele deveria fiscalizar não é um portão.

A régua aplicada, por decisão do dono do projeto: **sai o dono de toda etapa de portão cujo
responsável não pertence ao time que a justifica** — não só os de equipe criativa. O argumento é
que a lista `REVISIÓN` do Trello não nomeia ninguém, então QUALQUER dono ali era palpite promovido
a dado. Sem dono é o estado honesto, e já era o de 25 das 52 etapas de QC.

Ficou em `scripts/fix-gate-owners.mjs` (ensaio por padrão, `--commit` para aplicar, backup em JSON
antes de escrever). **15 etapas alteradas**, e o `assignedAt` caiu junto com o `assigneeId` — o
carimbo diz QUANDO o dono atual foi definido, e sobreviver a um dono nulo deixaria "atribuído em
11/set" sem ninguém atribuído.

| etapa             | antes                                             | depois                      |
| ----------------- | ------------------------------------------------- | --------------------------- |
| `Quality Control` | 25 sem dono · Luis 8, Pedro 2, Vinícius 1, Lèli 1 | **50 sem dono** · Norma 2   |
| `Audio Visual`    | Pedro (atendimento) 3 · Thiago 11                 | **15 sem dono** · Thiago 11 |

**Preservados de propósito:** Norma pertence a `Quality Control`/`Proofreading` e Thiago a
`Video-makers` — os dois estão nas etapas que seus times justificam, e tirá-los seria apagar um
vínculo que o quadro sustenta.

**Nada foi órfão nisso:** o sistema não tinha nenhum `TimeLog` nem `ActivityLog` no momento da
correção, então o vínculo pessoa↔etapa morava só nessas duas colunas. Numa base com horas
apontadas, esta mesma correção precisaria decidir o que fazer com elas antes de rodar.

**~~E `Audio Visual` tem 2 demandas com o atendimento como produtor~~ — eram 3, e foram limpas em
2026-09-14** junto com os portões de qualidade, pelo mesmo motivo (autor do anexo é quem SUBIU o
arquivo).

**~~A regra continua frouxa~~ — a TRAVA foi construída no mesmo dia.** O dono do projeto deu time
padrão a `Quality Control` e `Gráfica`, e isso sozinho já mudou muita coisa: `isEffectiveTeamMember`
devolve `true` quando não há time, então com QC coringa **a regra literalmente não existia**. Os dois
caminhos que faltavam foram fechados. Onde a regra vale hoje:

| caminho                                  | valida time? | como                                      |
| ---------------------------------------- | ------------ | ----------------------------------------- |
| Criação de demanda (`createTaskStages`)  | sim          | dono fora do time vira `null`             |
| Mesa do gestor (`scheduleStage`)         | sim          | `isEffectiveTeamMember`                   |
| Minha semana — puxar (`pullStageToMe`)   | sim          | mais estrito: recusa até coringa sem rota |
| Passar adiante ao concluir               | sim          | `isValidStageAssignee`                    |
| Mudar alguém de equipe                   | sim          | **desatribui** as etapas ativas dele      |
| Poço de trabalho — a tela                | sim          | `getTeamBacklog` filtra por time efetivo  |
| **Poço — a AÇÃO** (`claimActiveStage`)   | **passou a** | `isEffectiveTeamMember`, 2026-09-14       |
| **Importação do Trello** (`assigneeFor`) | **passou a** | recusa dono fora do time, 2026-09-14      |

**As coringas ficam sem trava, por decisão e não por descuido (2026-09-14).** `Aprovação`,
`Relatório`, `Briefing`, `Briefing & Copy` e `Registro` seguem sem time padrão porque **podem ser
executadas por vários times** — coordenação/gerência, social media, direção —, e
`TemplateStage.defaultTeamId` guarda UM só. Validar ali inventaria uma regra que o MODELO não tem
como expressar: **a limitação é do schema, não da configuração.** Quem quiser fechar esse portão
precisa primeiro dar à etapa a capacidade de pertencer a vários times, o que é mudança de schema —
e aí a pergunta seguinte é se "vários times" não é, na verdade, papel (quem aprova) em vez de
equipe.

A consequência aceita enquanto isso: em etapa coringa, qualquer pessoa pode ser dona, e a
importação não confere nada — é exatamente o que `assigneeFor` faz ao deixar passar a etapa ausente
do mapa `stageTeams`.

**O desempate do responsável pode inflar quem supervisiona.** Quando o card declara 2 a 4 membros e nada desempata, a etapa fica com o **primeiro da lista do card** — decisão explícita do dono do projeto, e é escolha, não medição: a ordem em que o Trello guarda os membros não significa nada. Vale para `Audio Visual`, `Quality Control`, `Aprovação` e `Relatório` — nunca para `Desenho`, que exige o nome da lista. Quem olhar métrica de execução por pessoa precisa saber disso antes de concluir qualquer coisa.

**Arquivar é descartar, e as listas de concluído mudam de nome (2026-09-10).** O desenho passou por
três leituras deste ponto — "arquivado é descartado", depois "arquivado é entregue", e de volta —
antes de quem opera o quadro explicar a prática: quando o mês vira, `Concluido` é renomeada para o
mês e uma nova nasce; as renomeadas envelhecem e somem, e o que sobra dos meses antigos é o entulho.
Hoje card arquivado não vira demanda, e as listas de concluído (`Concluido` e `Julio`) são
declaradas no script. **O que fica em aberto:** cada mês novo que for renomeado precisa de uma linha
em `COMPLETED_LIST_NAMES` (`scripts/import-trello/run.ts`) antes de uma reimportação — sem ela, as
demandas daquele mês entram como "em andamento". Não dá para adivinhar por nome de mês: o quadro tem
`ABRIL ATL` e `concluido` como listas arquivadas, e uma lista mal identificada viraria conclusão
inventada.

**O histórico anterior a março de 2026 não existe no export.** De maio de 2025 a fevereiro de 2026,
100% dos cards estão arquivados — zero abertos. O que o quadro sustenta são 103 demandas em 5
projetos (2026-03, 2026-06, 2026-07, 2026-08, 2026-09), das quais 38, 43 e 20 nos três últimos.
Quem quiser aquele histórico precisa de outra fonte: ele não está no Trello.

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

---

## Datas comemorativas do cliente no catálogo (2026-09-11)

As 112 datas da lista `Fechas Conmemorativas` do quadro do Trello foram transcritas para
`lib/calendar/events.ts`. O catálogo passou de 41 para **153 datas no ano**, materializadas em 2026
e 2027. A visão mensal ganhou filtro por tipo e por país (`lib/calendar/occurrence-filter.ts`).

**O que ficou de fora, e o que custaria trazer:**

- **Dezembro.** O card do mês está vazio no quadro. Nenhuma data comemorativa de dezembro entrou —
  só as que o catálogo já tinha (Natal, Imaculada Conceição, Caacupé, Black Friday, Cyber Monday).
  É o mês mais comercial do ano e está mais vazio que os outros. Quem tiver a lista, basta escrever.
- **Datas móveis fixadas num dia de 2026:** os dois `Día no laborable con fines turísticos` da
  Argentina (definidos por decreto a cada ano) e o `Día del perdón` (Yom Kippur, lunar). Ficariam
  certas em 2026 e erradas em todo ano seguinte.
- **`Fiesta del Sacrificio` e `Año Nuevo Judío`**, do bloco "Extras": lunares, sem cálculo no
  catálogo. Entram quando alguém escrever o cálculo, como já existe para a Páscoa.

**A revisão que falta.** Os 112 títulos em português são tradução minha do espanhol do quadro, e
aparecem na tela. Vale uma passada de quem conhece o vocabulário da operação — em especial os que
têm nome próprio de campanha. O `kind` também: classifiquei como `COMMERCIAL` tudo que não é
feriado nacional, então `Dia do Programador` e `Dia da Cachaça` estão no mesmo balde que
`Dia do Cliente`. Se a distinção importar para o planejamento, o schema já tem `EVENT` livre.

---

## A latência, remedida — a função roda em Washington (2026-09-14)

**O registro de 11/set estava errado, e vale saber por quê.** Ele mediu `select 1` em **304 ms** e
concluiu "a lentidão é distância até o banco". O que aquele número mediu foi a **primeira consulta
do processo** — o handshake TLS + autenticação —, não a consulta. Remedido em 14/set, contra o
mesmo Neon `sa-east-1`, três processos novos em sequência:

| medida                                    | tempo      |
| ----------------------------------------- | ---------- |
| abrir a conexão (1ª consulta do processo) | **265 ms** |
| `select 1` depois disso                   | **26 ms**  |
| 6 consultas simultâneas (pool quente)     | 30 ms      |
| mesa do gestor, 3 fases em série          | 186 ms     |
| as mesmas 3, colapsadas em 1 fase         | 113 ms     |

Em regime a distância custa 26 ms, não 304. E o paralelismo é de graça: seis consultas ao mesmo
tempo custam o que uma custa.

**Onde o tempo está de verdade.** A app em produção responde de `x-vercel-id: gru1::iad1::…` — o
edge que recebe é São Paulo (`gru1`), mas **a função executa em Washington (`iad1`)**, e o banco
está em São Paulo. Medianas de 12 medidas, até o primeiro byte:

| rota                                         | 1º byte    | o que isola                           |
| -------------------------------------------- | ---------- | ------------------------------------- |
| estático servido pelo edge `gru1`            | **76 ms**  | a rede do cliente até São Paulo       |
| função em `iad1`, 1 consulta ao banco        | **210 ms** | ida e volta a Washington: **~134 ms** |
| função em `iad1`, página inteira renderizada | **262 ms** | o render em si: ~52 ms                |

O mesmo build, servido localmente, entrega a mesma página de 172 KB em **7 ms**. O render não é o
problema; a geografia é. Cada requisição paga ~134 ms só para chegar à função, e **cada fase de
consulta em série atravessa o Atlântico de novo** (`iad1`↔`sa-east-1`, ~120 ms típicos). Uma tela
de planejamento com três fases encadeadas: 76 + 134 + 3×120 + render + volta ≈ **0,9–1,2 s** — que
é exatamente a faixa relatada.

**Corrigido e CONFIRMADO em 2026-09-14.** `vercel.json` fixa `"regions": ["gru1"]`. Depois do
deploy, `x-vercel-id` passou de `gru1::iad1::…` para `gru1::gru1::…` — a função executa ao lado do
banco. Medido de novo, mesmo método, 12 medidas cada:

| rota                               | antes (`iad1`) | depois (`gru1`) | ganho              |
| ---------------------------------- | -------------- | --------------- | ------------------ |
| estático no edge — **controle**    | 76 ms          | 77 ms           | — inalterado       |
| função + 1 consulta ao banco       | 210 ms         | **98 ms**       | **−112 ms (−53%)** |
| função, página inteira renderizada | 262 ms         | **154 ms**      | **−108 ms (−41%)** |

O controle é o que dá confiança no resto: o estático ficou idêntico, então o ganho vem da mudança e
não de a rede estar melhor na hora da segunda medição. Descontando os 77 ms de rede até o edge,
**função + consulta ao banco caiu de ~134 ms para ~21 ms** — cada fase de consulta em série agora
custa a casa de 10 ms, como previsto.

Para reconferir a qualquer momento (o esperado é `gru1::gru1`):

```
curl -sI https://workos.goonmarketing.com/auth/signin | grep -i x-vercel-id
```

**O que a correção de região torna DESNECESSÁRIO.** O registro anterior propunha três frentes de
código; com a função em `gru1`, o retorno de cada uma muda:

1. **Consultas em série que poderiam ser paralelas** — era a de maior retorno esperado. Medida,
   rende **73 ms** localmente; com função e banco na mesma região, cai para a casa de 20 ms. Deixa
   de pagar o risco de mexer na semântica dos filtros (`coverage`, `client-load` e a mesa do gestor
   validam o recorte da URL ANTES da consulta principal, de propósito — ver os comentários no
   código).
2. **Campos trazidos sem uso** (`task.stageLogs`, `project.client`) — continua valendo como higiene,
   mas não é latência: com 26 ms de RTT, o que pesa é o trabalho no banco, não o tamanho da linha.
3. **Cache entre navegações** (equipes, clientes, projetos) — o acervo é minúsculo (1 cliente, 6
   projetos ativos, 17 equipes, 6 templates, 33 executores). Cachear isso economiza uma consulta de
   ~10 ms e compra um problema de invalidação. Não vale.

**O que continua valendo, e não foi feito.** `next.config.ts` desliga o Router Cache do cliente
(`staleTimes: { dynamic: 0, static: 0 }`) — decisão explícita e documentada: frescor acima de
velocidade, porque o menu é sensível a papel e a grade a dado apagado. Ela MULTIPLICA o custo de
cada navegação, e era cara enquanto cada navegação custava um segundo. Com a função em `gru1` ela
fica barata — mas quem reabrir isto precisa saber que a escolha foi feita quando o custo era outro.

**E o payload de i18n.** `app/[locale]/layout.tsx` serializa os 23 namespaces inteiros —
**176.592 bytes** — no HTML de TODA página, via `NextIntlClientProvider messages={messages}`. A tela
de login carrega as strings de relatórios, admin e ajuda para mostrar um botão. O levantamento
estático diz que o CLIENTE usa 13 desses namespaces (114.121 B), então o corte economizaria ~62 KB
por navegação. **Não foi feito, e não por esquecimento:** medido, o custo em TEMPO é desprezível (o
mesmo HTML sai em 7 ms localmente), então isto é economia de BYTES, que importa em rede ruim e não
no relógio. E o corte tem uma armadilha — `PlanningFilters` recebe o namespace por PROP
(`reportsPerformance`, `reportsProductivity`), invisível para qualquer varredura estática: cortar
sem um guard que acompanhe quebraria aquelas telas em runtime, não no build.

## Formulários de ação sem proteção contra duplo envio (2026-09-11, varrido em 2026-09-14)

`CreateTaskForm` usava `<form action={createTask}>` com o botão bloqueado apenas por falta de
projeto ou template — nada impedia o segundo clique. Com o banco a ~300ms de ida e volta, a criação
leva mais de um segundo sem nenhuma mudança visível no botão, e o segundo clique **criava uma
demanda duplicada**. Corrigido com `components/ui/SubmitButton.tsx`, que usa `useFormStatus`.

**A varredura de 14/set fechou o resto — e achou mais do que este registro previa.** A nota dizia
que nenhum dos restantes duplicava DADO. Dois duplicavam:

- `components/admin/SimpleEntityCrudList.tsx` é o formulário de **criação** de `/admin/clients`,
  `/admin/teams` e `/admin/templates` — segundo clique, segunda linha.
- `createClientProject` em `app/[locale]/(protected)/admin/clients/[clientId]/page.tsx` cria
  projeto — o mesmo defeito que a criação de demanda teve.

Os outros oito (troca de idioma e sair no `PrimaryNav`, `SignOutButton`, login, `TemplateHeader`,
os três `edit-*-header.tsx`, e o ativar/desativar projeto) são edição, entrada e saída: gravam por
cima ou repetem um fluxo. Ficaram bloqueados na mesma rodada, porque o silêncio do botão é o que
convida o segundo clique.

**Ficaram de fora por medição, não por esquecimento.** `delete-client-button`, `delete-team-button`,
`EditDisplayNameForm`, `QuickTaskForm`, `StageEditForm`, `CreateStageForm` e `TaskStageSetupEditor`
**já** se bloqueavam (`useTransition` / `useServerAction`). `ReportFilterBar` é `method="GET"` —
navegação, não escrita, e `useFormStatus` não a enxerga; quem cuida do retorno visual ali é a barra
de progresso da navegação.

**O `SubmitButton` mudou de natureza na varredura.** Ele cravava o estilo do botão de criar demanda,
e por isso servia a um chamador só — usá-lo em outro lugar exigiria desfazer classe por classe.
Agora é **comportamento**: o estilo vem inteiro de quem chama (`cn` resolve os conflitos), que é como
o app já faz — cada tela crava a classe do seu botão.

**E a proteção continua sendo só do lado do cliente.** Um duplo envio que escape do botão — rede
lenta, clique antes da hidratação, requisição repetida — ainda cria duas linhas. Idempotência de
verdade exigiria uma chave por envio, e isso é decisão de desenho, não ajuste de tela.
