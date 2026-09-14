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

## 2. `prisma migrate dev` está quebrado para todo mundo

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

## 3. `PresenceCard` não consegue linkar para a etapa

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

**O Desenho só tem dono quando a lista diz o nome.** 40 das 71 etapas de `Desenho` ficam sem
responsável: são os cards que nunca pararam nem passaram por uma lista `DISEÑO - <NOME>`, e para
eles o quadro não diz quem desenhou. O autor do anexo não serve como resposta — é quem SUBIU o
arquivo, com frequência o atendimento. Se alguém souber de quem eram essas 40, é correção manual.

**A revisão de qualidade tem 12 donos que provavelmente estão errados.** As etapas de `Quality
Control` percorridas ainda aceitam o membro declarado no card — a mesma fonte que foi tirada da
aprovação —, e o resultado é Martin (designer) com 8, Pedro com 2, Vinícius e Lèli com 1. A lista
`REVISIÓN` não nomeia ninguém, então o quadro não diz quem revisou. Aplicar a mesma régua deixaria
as 49 etapas de QC sem responsável. Decisão do dono do projeto, ainda não tomada.

**E `Audio Visual` tem 2 demandas com o atendimento como produtor**, pelo mesmo motivo (autor do
anexo). É pequeno hoje porque quase todo o audiovisual do quadro estava arquivado, mas a regra
continua frouxa: se voltar a crescer, volta o problema.

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

**Corrigido em 2026-09-14:** `vercel.json` fixa `"regions": ["gru1"]`. A função passa a executar ao
lado do banco, o que remove os ~134 ms de deslocamento E derruba cada consulta de ~120 ms para a
casa de 10 ms. **Confirmar no primeiro deploy:** se `x-vercel-id` continuar mostrando `iad1`, a
mudança não pegou.

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
