# A janela fixa do agendamento

**Data:** 2026-09-02 · **Estado:** desenho conversado, aguardando revisão da spec
**Fecha:** a limitação "janela fixa não tem tela" de [`docs/pendencias.md`](../../pendencias.md)
**Estende:** [a programação semanal](2026-08-28-programacao-semanal-design.md)

## O problema

`TaskActiveStage.scheduledStart` e `scheduledEnd` existem desde a fatia 1 e **nenhuma tela os
escreve**. Todo o resto do caminho foi construído e testado em cima deles:

| Peça pronta                                                    | Onde                              |
| -------------------------------------------------------------- | --------------------------------- |
| "agendado é fixo" / "agendado + não liberado = conflito"       | `lib/planning/day-queue.ts:79`    |
| bloco vermelho no topo da mesa, com pessoa, dia, hora e motivo | `planning/week/page.tsx:60-120`   |
| a hora na célula da mesa e da minha semana                     | as duas telas                     |
| reordenar recusa mexer em item com janela                      | `reorder.ts:45`, `my-week.ts:437` |

O resultado é uma feature inteira em coma: **o bloco de conflitos nunca acende em uso real**, porque
conflito exige janela e janela ninguém consegue marcar. O gestor descobre no dia da gravação que a
etapa anterior não terminou — que é exatamente o que a fatia 1 se propôs a evitar.

Esta entrega abre a torneira, e trata a bagagem que vem junto.

## O que a janela é, e o que ela não é

A spec da programação semanal proíbe grade de horários para trabalho criativo: "das 8 às 10 na
tarefa A" seria usar hora como verdade de planejamento, que o P7 veta. A unidade é uma **fila
ordenada**, e a hora é referência derivada da classe.

A janela é a **exceção declarada** ali: agendamento de pessoa, lugar ou equipamento. Tem hora porque
a realidade tem — a locação é às 14h, o cliente entra na call às 10h. Não é estimativa apresentada
como verdade; é **compromisso**, quase sempre combinado com alguém de fora do sistema.

Essa origem é o que sustenta duas decisões abaixo: o sistema **nunca** remarca sozinho uma janela
(remarcar é conversa com o estúdio, não `UPDATE`), e a janela **não pode ser dividida** — meia
locação não existe, do mesmo jeito que meia etapa não existe.

## A faixa ocupada

O gestor informa o **início** (obrigatório) e, se souber, o **fim** (opcional). A faixa que o item
ocupa para efeito de colisão é:

1. `[início, fim]` quando o fim foi declarado — é o compromisso real, e ele manda;
2. `[início, início + horas de referência da etapa]` quando não foi — o "range estimado necessário";
3. `[início, início + 1h]` quando a etapa não tem referência nenhuma (`referenceHours: 0`) — convenção
   dita na própria tela, porque uma faixa de duração zero não colidiria com nada e a trava viraria
   decorativa.

> **Suposição a confirmar na revisão:** o fim opcional. A alternativa é exigir os dois campos sempre,
> o que nunca usaria estimativa para barrar ninguém — ao custo de obrigar o gestor a inventar um fim
> que ele frequentemente não sabe.

Usar a referência aqui **não** é apresentar estimativa como verdade: ela não promete nada a ninguém e
não aparece como compromisso na tela. Serve para uma coisa só — detectar que dois compromissos vão se
atropelar. A promessa continua sendo o início, que é o que foi combinado.

## A trava fica na porta: sobreposição nunca é gravada

Ao marcar uma janela — ou ao mover uma etapa que já tem janela —, o servidor calcula as colisões da
**mesma pessoa** no **mesmo dia** e decide:

- **sem colisão** → grava;
- **com colisão, prioridade não autoriza** → recusa, dizendo com **quem** colide: demanda, etapa e
  horário. Uma recusa que não diz o que está no caminho obriga o gestor a caçar na grade. A recusa
  ainda oferece as duas saídas que **não** tocam na ocupante — remarcar a nova, ou dar a nova a outra
  pessoa —, porque nenhuma das duas depende de autoridade sobre o compromisso alheio;
- **com colisão, prioridade autoriza** → o diálogo **obriga a escolher uma saída**. Nada é gravado
  antes da escolha.

A consequência de desenho é grande e vale escrever: **nenhuma dupla marcação chega ao banco.** Por
isso o `QueueKind` fica intacto (`scheduled` / `runnable` / `waiting` / `conflict`), o bloco vermelho
continua significando só "agendado e não liberado", e nenhuma das duas telas muda de forma. A regra
inteira vive na escrita — mais barata de construir e mais honesta: avisar depois do fato é avisar
quando o estúdio já foi perdido.

## O veredito da prioridade

A ordem é a do enum: `LOW` < `MEDIUM` < `HIGH` < `URGENT`. A nova janela ocupa o horário se:

- a prioridade da demanda nova for **maior** que a da ocupante; **ou**
- a demanda nova for **`URGENT`**.

A segunda metade não é redundante: `URGENT` já é o topo, então ela só tem efeito num caso — **urgente
contra urgente**, que passa. Empate em qualquer outro nível **não** passa. É a leitura literal de "só
permite caso a prioridade da nova seja maior que a anterior, ou que seja urgente", e ela deixa a
decisão de desempate com quem classificou as duas demandas como urgentes.

## As quatro saídas, e cancelar

Quando a prioridade autoriza, o diálogo mostra o que será atropelado e oferece as saídas **já
calculadas**. O sistema faz a conta; a decisão continua de quem combinou o compromisso.

| Saída                                | O que grava                                                                                                                                                                                                                                                                                   |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Adiar a ocupante**                 | `setStageWindow` na ocupante, começando no **primeiro horário livre** depois da nova — pulando outras janelas da pessoa naquele dia, para não trocar uma colisão por outra. A duração declarada é preservada; se ela não tinha fim, continua sem fim e a faixa desliza junto com a referência |
| **Remarcar a nova**                  | nada até confirmar: escolhe-se outra hora no mesmo diálogo e a checagem roda de novo                                                                                                                                                                                                          |
| **Trocar o colaborador da ocupante** | `scheduleStage` para outra pessoa, **com a janela preservada**                                                                                                                                                                                                                                |
| **Trocar o colaborador da nova**     | idem, e a janela nova vai junto para o novo dono                                                                                                                                                                                                                                              |
| **Cancelar**                         | nada                                                                                                                                                                                                                                                                                          |

O sistema não inventa fim de expediente: não existe escala cadastrada no workos — a barra de 8h do
dia é régua visual, e a própria spec da fatia 1 diz isso. "Primeiro horário livre" significa o
primeiro instante sem outra janela, não o primeiro dentro de um turno que o sistema não conhece.

### A transferência é estrita

As duas saídas de troca listam **apenas membros do time efetivo da etapa** (`lib/stage-team.ts` — o
roteamento da demanda substitui o time padrão do modelo), e dentro deles **apenas quem não tem
compromisso na faixa**. Sem escape por prioridade neste caminho.

O motivo: transferir é uma saída para **resolver** uma sobreposição. Se ela pudesse criar outra na
agenda do colega, o diálogo empurraria o problema para uma tela que o gestor não está olhando — e a
sobreposição nasceria pela porta dos fundos, sem nunca ter passado pela trava.

Quem está ocupado aparece **desabilitado com o motivo**, não sumido: "some da lista" não se distingue
de "não é do time", e o gestor precisa saber que a pessoa existe e está comprometida.

## O dia manda: a janela vive dentro da coluna

O sistema usa **duas convenções de tempo**, e misturá-las erra por três horas — o erro que o
comentário de `realInstant` (`lib/dates.ts:164`) descreve, e que só aparece na borda do dia:

- `plannedDate` é meia-noite de São Paulo **codificada em UTC** (`${dateISO}T00:00:00Z`);
- `scheduledStart`/`scheduledEnd` são **instantes reais** (14h em São Paulo = `17:00Z`).

Daí o invariante, garantido no servidor e não só na tela: **o dia de São Paulo de `scheduledStart`
tem que ser o dia de `plannedDate`**. Sem ele é possível gravar um compromisso de quinta num item que
está na coluna de quarta, e a tela passa a mostrar uma hora que não bate com a coluna em que está.

## Duas correções de bagagem, obrigatórias

**`unscheduleStage` passa a limpar a janela.** Hoje ela limpa `plannedDate`, `plannedOrder` e
`assigneeId` e deixa `scheduledStart`/`scheduledEnd` para trás (`week-planning.ts:409`). É inofensivo
enquanto ninguém escreve; no dia em que escrever, devolver a etapa ao poço deixa um compromisso
fantasma, e a próxima programação — outro dia, outra pessoa — traz a etapa de volta já "agendada" num
horário que ninguém marcou.

**Mudar o dia limpa a janela.** `scheduleStage` para um dia diferente não desliza o compromisso: ele
foi combinado _para aquele dia_. A tela avisa que o horário será perdido antes de gravar.

**Agendados passam a ser ordenados por hora entre si.** Hoje todos os itens do dia ordenam por
`plannedOrder`, e `nextRunnableId` pega o primeiro agendado que encontrar (`day-queue.ts:83`) — com
duas janelas no mesmo dia, o "o que fazer agora" pode apontar para a das 16h antes da das 10h. A fila
mentiria exatamente no caso que a janela existe para servir.

## Modelo de dados

**Nenhuma migração.** Os dois campos existem desde a fatia 1, anuláveis, sem backfill.

A leitura da mesa (`getWeekPlanning`) ganha **`scheduledEnd`**, que hoje não carrega: sem ele, reabrir
o diálogo de um compromisso de 14h–16h o transformaria num de "14h + referência".

Ela **não** ganha `task.priority`: o veredito roda no servidor, dentro da ação, que faz a própria
consulta e devolve a prioridade da ocupante no payload do conflito. Carregar prioridade em toda a
grade seria dado que ninguém lê.

## Onde mora cada parte

| Parte                                                                  | Arquivo                                                         |
| ---------------------------------------------------------------------- | --------------------------------------------------------------- |
| faixa ocupada, colisão, veredito de prioridade, primeiro horário livre | `lib/planning/stage-window.ts` (novo, puro)                     |
| `setStageWindow`; a mesma checagem dentro de `scheduleStage`; limpezas | `lib/actions/week-planning.ts`                                  |
| campo de hora e diálogo de resolução                                   | `planning/week/ScheduleDialog.tsx` + um componente de resolução |
| ordenação por hora entre agendados                                     | `lib/planning/day-queue.ts`                                     |
| mensagens                                                              | `errors.weekPlanning`, `planning.week` (pt-BR e es-ES)          |

## Testes

**Da função pura** — é onde o erro é silencioso, então é onde os testes são densos:

- faixa com fim declarado, sem fim (usa referência), e sem referência (1h de convenção);
- bordas da colisão: `14h–16h` **não** colide com `16h–17h`; colide com `15h59`;
- o veredito em todas as combinações do enum, com atenção ao empate e ao urgente-contra-urgente;
- "primeiro horário livre" pulando uma terceira janela no meio.

**Da ação:** a hora é ancorada no dia da coluna (o invariante é estrutural — a ação não recebe data);
a recusa nomeia a ocupante; `unschedule` limpa a janela; mudar o dia limpa a janela; a transferência
recusa quem tem compromisso na faixa, mesmo sendo do time.

**Da fila:** dois agendados no mesmo dia saem em ordem de hora, e `nextRunnableId` aponta para o mais
cedo.

## Fora desta entrega

- **O "fazer agora" mandatório.** Decisão explícita: a interrupção por urgência já está resolvida
  fora da tela — a demanda nasce urgente e sem agendamento, o gestor avisa a pessoa, e ela usa a
  interrupção que já existe (`startWorkOnTask` fecha o cronômetro anterior registrando as horas e
  exige justificativa). Não é caso de janela.
- **Dividir a etapa em dois pedaços de horário.** `TaskActiveStage` tem um par `(início, fim)` — N
  janelas por etapa exigiriam tabela nova, com reflexo na fila, nas duas telas e no apontamento. E
  contradiz "meia etapa não existe", que a fatia 1 decidiu por escrito. Se um dia valer, é spec
  própria.
- **Capacidade pela duração da janela.** A barra do dia continua somando a referência da etapa.
  Trocar isso mexe na função pura compartilhada para ganhar precisão numa régua que a spec declara
  visual.
- **Dupla marcação herdada.** Não existe: nada nunca escreveu nesses campos.
