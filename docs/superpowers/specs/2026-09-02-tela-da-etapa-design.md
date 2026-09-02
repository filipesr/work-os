# A tela da etapa

**Data:** 2026-09-02 · **Estado:** desenho conversado, aguardando revisão da spec
**Fecha:** o agrupamento de comentários por autor (`WorkflowHistoryModal.tsx:48`) e a instrução de
etapa que ninguém lê no momento certo
**Prepara:** [as instâncias de etapa](#o-caminho-seguinte-instâncias-de-etapa), a spec seguinte

## O problema

`/tasks/{id}` é a tela onde se lê a demanda **e** onde se opera. Quase tudo que ela oferece para
agir é, na verdade, operação de uma ETAPA vestida de tela de demanda:

| Botão de hoje                                    | O que ele realmente faz         |
| ------------------------------------------------ | ------------------------------- |
| `ActivityButton` (iniciar/parar)                 | cronômetro de uma etapa         |
| `AdvanceStageButton`                             | conclui uma etapa               |
| `RevertStageButton`, `UnassignActiveStageButton` | agem sobre uma etapa            |
| `LogTimeButton`                                  | aponta hora em uma etapa        |
| `AddCommentForm`                                 | comenta — sem saber sobre o quê |
| `UnifiedArtifactsPanel`                          | artefato entregue por uma etapa |

O schema permite **etapas ativas em paralelo** (`prisma/schema.prisma:407`, fork/join). Com duas
ativas, cada um desses botões precisa perguntar "qual?" — e a tela responde escolhendo sozinha.

O caso mais visível disso é o comentário. `TaskComment` tem `taskId` e `userId`, e nada mais: não
existe comentário DE ETAPA. O modal de histórico finge que existe (`WorkflowHistoryModal.tsx:48`)
atribuindo cada comentário à etapa **pelo autor** — quem trabalhou em três etapas tem todos os seus
comentários repetidos nas três, comentário de gestor não aparece em nenhuma, e a data é ignorada.

A instrução da etapa coringa (`TaskActiveStage.instructions`) sofre do mesmo mal por outro caminho:
ela é escrita na criação e aparece em três telas, mas **nunca no momento em que a etapa é liberada**,
que é quando alguém precisa dela.

## A decisão: uma tela por etapa, e cada tela responde uma pergunta

| Tela                                 | Pergunta                            | Pode agir?                |
| ------------------------------------ | ----------------------------------- | ------------------------- |
| `/tasks/{id}`                        | o que aconteceu nesta demanda?      | **não** — leitura         |
| `/tasks/{id}/stages/{activeStageId}` | o que eu faço nesta etapa?          | sim — tudo que é da etapa |
| `/admin/tasks/{id}`                  | o que eu decido sobre esta demanda? | sim — o que é da demanda  |

A regra cabe numa frase: **se a ação precisa saber QUAL etapa, ela mora na etapa.** A ambiguidade
não é resolvida por desempate — ela deixa de existir, porque o contexto virou o endereço.

`/admin/tasks/{id}` já tem `AdvanceStageButton`, `RevertStageButton`, `CompleteTaskButton` e
`UnassignActiveStageButton`. Concentrar os poderes ali é, em boa parte, **apagar a duplicata** que
vive em `/tasks/{id}` — não construir tela nova.

## A rota é pela INSTÂNCIA, não pela etapa do template

`/tasks/{id}/stages/{activeStageId}` usa o id da linha de `TaskActiveStage`.

Hoje `@@unique([taskId, stageId])` garante uma linha por par, então o id do template seria
igualmente único — e mais bonito de ler. A escolha é deliberada e olha para a frente: a spec
seguinte remove essa unicidade, e uma demanda passa a poder ter duas "Gravação". Chavear a rota pela
instância agora custa zero e faz esta tela **atravessar aquela migração sem reescrita**.

Toda etapa da demanda tem página, porque toda etapa tem linha desde a criação: numa cadeia
sequencial, a que ainda não chegou é `INACTIVE`. Então há três leituras da mesma tela — a que ainda
não começou mostra a instrução e o que virá; a ativa opera; a concluída abre em leitura, mostrando o
que aconteceu nela. Um link mandado no chat continua abrindo depois que a etapa fecha, e o histórico
do fluxo passa a ter para onde apontar.

## Modelo de dados: três colunas, nenhuma obrigatória, sem backfill

| Coluna                        | Por quê                                                                                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Task.createdById String?`    | quem gerou a demanda. **O sistema não guarda isso hoje** — o modelo `Task` tem título, prazo, projeto e template, e nenhum autor. É o autor do comentário de instrução, e um dado que faltava por si só |
| `TaskComment.stageId String?` | a etapa em que o comentário nasceu                                                                                                                                                                      |
| `TaskComment.kind`            | `USER` (padrão) ou `STAGE_INSTRUCTION` — é o que torna a linha não editável, não apagável, e lhe dá o título "Instrução da etapa"                                                                       |

**Comentários antigos ficam sem etapa, e demandas antigas sem criador.** Nenhum backfill: inventar o
vínculo pelo autor é exatamente o defeito que esta entrega remove, e gravá-lo promoveria o chute a
dado. Instrução de demanda legada, sem criador registrado, não gera comentário — ela continua
aparecendo nos três lugares onde já aparece.

## A instrução da etapa

Quando uma etapa é liberada e tem instrução, nasce um comentário `STAGE_INSTRUCTION` **assinado por
quem criou a demanda**, independente de quem seja o colaborador da etapa. Ele aparece:

- **em destaque no topo da tela da etapa**, que é onde alguém está prestes a executar;
- **no fluxo da conversa**, na posição cronológica da liberação.

Isso reverte, de propósito, uma separação que o schema declara em
`prisma/schema.prisma:435`: _"É direcionamento do gestor para quem for pegar, não conversa —
discussão continua em TaskComment"_. A separação estava certa sobre a NATUREZA (instrução não é
conversa) e errada sobre a CONSEQUÊNCIA (por isso não pode aparecer na conversa). O `kind` preserva
a distinção sem esconder o texto: é um comentário que ninguém edita, com título próprio.

### A reversão já faz isso — mal

`revertTaskStage` (`lib/actions/task.ts:~1947`) **já cria** um `TaskComment` com o corpo montado à
mão dentro da action:

```
**TAREFA REVERTIDA** por {nome}
De: {etapas}  Para: {etapa alvo}
**Motivo:** {motivo}
Data: {new Date().toLocaleString("pt-BR")}
```

Três defeitos num só lugar: o texto é **português cravado em código** (e a paridade de locales não
pega, porque a string não está em locale nenhum); a data sai em pt-BR para quem lê em espanhol; e é
um comentário de sistema **fingindo ser de usuário** — editável, apagável, e preso à demanda em vez
da etapa que precisa agir sobre ele.

Esta entrega o converte em `STAGE_INSTRUCTION`, com o texto vindo do locale, o motivo do gestor como
corpo, e o autor sendo **quem reverteu**. A simetria com a coringa é o ponto: coringa → instrução de
quem criou a demanda; retrabalho → instrução de quem reverteu.

## A conversa é contínua; a etapa é uma lente

As duas telas mostram **o fluxo inteiro** da demanda. A tela da etapa realça o bloco daquela etapa e
é a única com caixa de escrever — e o que se escreve ali nasce com aquela etapa, sem regra de
desempate.

Comentário que não é de etapa nenhuma ("o cliente adiou tudo") se escreve em `/admin/tasks/{id}`,
onde já moram os poderes da demanda. É o que dá sentido a `stageId` ser opcional: nem toda conversa
é sobre uma etapa, e forçar a escolha seria o mesmo chute, feito pela pessoa em vez do código.

## O que sai, o que fica, o que muda de destino

**Sai de `/tasks/{id}`:** `ActivityButton`, `TaskActionsMenu` inteiro, `AddCommentForm`, e as ações
do `UnifiedArtifactsPanel` (o painel continua, em leitura).

**`/admin/tasks/{id}` ganha:** a caixa de comentário da demanda. E tem um defeito consertado junto:
ele usa `task.currentStageId` (`page.tsx:216`), que com etapas paralelas elege uma sozinho — passa a
listar as ativas, cada uma com suas ações.

**Links.** São **8 navegações** e **18 `revalidatePath`** — a contagem crua de 26 confunde as duas.
Mudam de destino as seis que nascem de contexto de ETAPA: minhas etapas (`tasks/page.tsx:119`),
dashboard (`page.tsx:172`), `AgingQueue`, `BlockedQueue`, `TeamLoadBalanceClient` e `PresenceCard`.
Continuam na demanda as duas de contexto de DEMANDA: linha do tempo do projeto e barra do calendário.
Os `revalidatePath` ganham o caminho novo além do atual.

## Permissões

A tela da etapa **não afrouxa nada**. Quem enxerga a demanda enxerga a etapa; os botões carregam as
mesmas travas que carregam hoje, e as Server Actions continuam validando por conta própria — a tela
explica, o servidor garante. Mudar de lugar não é mudar de regra.

## Testes

- **A atribuição do comentário:** escrever na tela da etapa grava `stageId`; escrever no admin grava
  nulo. É a regra que substitui todo o desempate, então é a que precisa de proteção explícita.
- **A instrução:** liberar etapa com instrução cria um `STAGE_INSTRUCTION` assinado pelo criador da
  demanda; sem instrução não cria nada; demanda sem criador não cria nada.
- **A reversão:** o comentário nasce `STAGE_INSTRUCTION`, com texto do locale nos dois idiomas, e o
  autor é quem reverteu. Um teste afirma que **nenhuma string do corpo vem do código**.
- **A imutabilidade** não precisa de guarda: **não existe ação de editar ou apagar comentário** neste
  sistema — `addComment` é a única porta. "Não editável" é, hoje, uma afirmação sobre a tela (título
  próprio, sem controles) e um custo zero de garantir. Fica escrito aqui para que, no dia em que
  alguém criar a ação de apagar, saiba que este tipo tem de ficar de fora dela.
- **A rota:** etapa concluída abre em leitura; etapa de outra demanda no id da rota é recusada (não
  basta o id existir — ele tem de pertencer àquela demanda).
- **O histórico:** o modal passa a filtrar por `stageId` real; um comentário de quem passou por três
  etapas aparece em UMA.

## Fora desta entrega

- **Backfill** de comentários antigos e de criador de demandas antigas.
- **Comentário de sistema para etapa sem instrução** — não há texto a entregar, e um marco vazio
  precisaria de um autor que ninguém escreveu.
- **Qualquer mudança no que já funciona em `/admin/tasks/{id}`** além da caixa de comentário e da
  lista de etapas ativas.
- **As instâncias de etapa** — a spec seguinte, abaixo.

---

## O caminho seguinte: instâncias de etapa

Registrado aqui porque **decide escolhas desta entrega** (a rota é por instância por causa dele) e
porque é o próximo passo acordado.

### O que se quer

Reverter deixa de sobrescrever a etapa e passa a **criar execução nova**. Numa demanda de cinco
etapas, revertendo da terceira para a segunda, nascem a 2'' e a 3'', injetadas entre a 3 antiga e a 4. Cada passada guarda o próprio responsável, dia programado, horas, artefatos e conversa; e o motivo
da reversão vira a **instrução da etapa nova**, pelo mecanismo que esta entrega constrói.

### O que isso conserta

Hoje `@@unique([taskId, stageId])` garante **uma linha por par**, então reverter reaproveita a mesma
linha. `TaskStageLog` guarda o rastro de que houve reversão, mas não separa **o trabalho**: `TimeLog`
aponta para `stageId`, não para uma instância, então as horas da primeira e da segunda passada são um
balde só. O mesmo vale para artefatos — e, depois desta entrega, valeria para os comentários.

Pergunta que hoje não tem resposta: _"quem fez a primeira gravação, e quanto custou refazê-la?"_

### O tamanho, medido

- **36 pontos em 8 arquivos** dependem da identidade `(taskId, stageId)`: planejamento
  (`client-load`, `stage-reference`), relatórios, `stage-team`, `stage-transitions`,
  `stage-assignment-helpers`, `task-stage-setup`, `task`.
- **A ordenação muda de natureza.** Injetar a 2'' e a 3'' entre a 3 antiga e a 4 significa que a
  sequência da demanda deixa de ser a ordem do template e vira uma **lista materializada por
  demanda**. É a parte mais funda: `TemplateStage.order` hoje dirige o sequenciamento em todo lugar.
- **As métricas mudam de sentido — para melhor.** Retrabalho deixa de ser derivado de log `REVERTED`
  e passa a ser um fato: existe uma segunda instância. Mas toda consulta que agrupa por
  `(taskId, stageId)` precisa decidir se soma as passadas ou as separa, e a resposta não é a mesma
  para throughput, para on-time e para custo de retrabalho.

### O que esta entrega já deixa pronto

A rota por instância; o `kind` de comentário; a instrução como comentário assinado; e o
`TaskComment.stageId`, que passa a apontar para a instância certa sem mudança de forma.
