# Tarefa rápida — registro de trabalho de etapa única

**Data:** 2026-08-28 · **Estado:** desenho aprovado, aguardando plano de implementação

## O problema

Parte do trabalho da agência acontece inteira em minutos e fora do escritório. O exemplo que
originou esta spec: influencers gravam _stories_ na loja do cliente, editam no celular e publicam.

Para esse trabalho, o fluxo normal — criar demanda, escolher template, definir responsável,
reivindicar etapa, comentar, concluir — custa mais que a própria execução. O efeito não é um
formulário chato: é **resistência ao sistema**, e trabalho que simplesmente não é registrado. O que
não é registrado não existe no histórico do cliente, não conta como entrega e não aparece nas horas
de quem trabalhou.

A tarefa rápida existe para que esse trabalho **entre** no sistema, não para acelerar o fluxo normal.

## Decisões

### A classe é o template (P4)

Um admin cria "Story de loja" como um `WorkflowTemplate` com **exatamente uma etapa**, marcado com
`quickEntry`. Só templates com essa marca aparecem no formulário rápido.

Isso resolve o risco central. Uma tarefa rápida nasce e morre no mesmo instante: lead time perto de
zero. Se caísse na mesma distribuição das demandas normais, puxaria o p50/p85 daquele tipo para
baixo — e esses percentis alimentam a **checagem de viabilidade** que aparece quando alguém cria uma
demanda. O sistema passaria a prometer prazos que não cumpre.

Como a previsão já é **por classe** (P4 — _outside view_), separar por template resolve sem regra
nova: a tarefa rápida ganha a própria referência e não contamina ninguém.

### O carimbo do tempo

Informa-se a **data** e o **tempo gasto**. Os instantes são derivados:

```
completedAt = data informada
startedAt   = data informada − tempo gasto
createdAt   = startedAt
```

Resultado: **cycle time = tempo real de trabalho**, **lead time = o mesmo**, **queue time = zero** —
todos verdadeiros para este tipo de trabalho, em que a demanda e a execução foram o mesmo momento.

**Rejeitado:** `createdAt = agora` (instante do registro). Faria o lead time medir "quanto a pessoa
demorou para lançar no sistema", que é ruído, e pioraria quanto mais tarde ela registrasse.

### Quem lança é quem fez

O colaborador registra o próprio trabalho, do celular, logo depois de publicar. É a única forma de a
resistência cair: depender de gestor concentra o trabalho em quem já é gargalo e transforma o
registro em memória de terceiro, com data e tempo estimados de cabeça.

Quem lança vira **responsável pela etapa e dono das horas**. Lançar por terceiro fica fora desta
versão.

### Sem etapa de aprovação

Colocar um gestor no meio traria de volta o atrito que a feature existe para remover. O P1 manda
informar, não policiar. O gestor enxerga o que foi lançado no histórico do cliente e nos relatórios,
como enxerga qualquer trabalho.

## Modelo de dados

| Mudança                              | Onde               |
| ------------------------------------ | ------------------ |
| `quickEntry Boolean @default(false)` | `WorkflowTemplate` |

Nenhuma outra tabela muda. A tarefa rápida é uma `Task` comum.

### A trava recíproca entre `quickEntry` e as etapas

A marca e a quantidade de etapas travam uma à outra, **na tela**, e não por recusa no envio. A ação
impossível fica visivelmente indisponível com o motivo escrito ao lado — descobrir a regra por
mensagem de erro depois de preencher o formulário é aprender do jeito pior.

No editor do template (`/admin/templates/[id]`):

| Estado                    | Marcar como rápido                                              | Adicionar etapa                                                                     |
| ------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1 etapa, **não** é rápido | habilitado                                                      | habilitado                                                                          |
| 1 etapa, **é** rápido     | habilitado (desmarcar libera)                                   | **desabilitado** — "um fluxo rápido tem etapa única; desmarque para adicionar mais" |
| 2+ etapas                 | **desabilitado** — "só um fluxo de etapa única pode ser rápido" | habilitado                                                                          |

**Excluir etapa é bloqueado quando é a última**, em qualquer template — rápido ou não.

O servidor repete as três regras. A tela **explica**; o servidor **garante**. Sem a checagem no
servidor, qualquer requisição fora da tela quebra a invariante; sem a explicação na tela, a regra
existe mas ninguém entende por que o botão recusou.

### Bug pré-existente que entra no escopo

`deleteTemplateStage` não tem guarda alguma: hoje é possível apagar a última etapa e deixar um
template com **zero**. Nada avisa. A falha só aparece muito depois, quando alguém tenta criar uma
demanda com aquele template e recebe `Template is misconfigured; no stages found` — longe da ação
que causou o estrago, e sem pista de quem apagou o quê.

Não é um extra: "template sem etapa não deve existir" é a mesma invariante que esta spec precisa
para poder afirmar "etapa única".

**A etapa não tem time padrão.** O trabalho é aberto a todas as equipes, e quem registra é o
executor — o roteamento por time não tem papel aqui.

### O que é gravado, numa transação

1. `Task` — `status: COMPLETED`, com os instantes acima e `workflowTemplateId` do tipo escolhido
2. `TaskActiveStage` — a etapa única, `status: COMPLETED`, `assigneeId` = quem registrou
3. `TaskStageLog` — entrada e saída carimbadas em `startedAt`/`completedAt`
4. `StageTransition` — as transições correspondentes, para o histórico de fluxo ficar reconstruível
5. `TimeLog` — `hoursSpent`, `logDate` = a data informada, `userId` = quem registrou
6. `TaskArtifact` — opcional, `storageKind: LINK`, com a URL da publicação

**Não passa por `createTaskStages`.** Aquela função existe para abrir um fluxo (primeira etapa
`ACTIVE`, log aberto, validação de responsável contra o time). Aqui o fluxo já terminou: a etapa
nasce concluída e o responsável é quem registrou, por definição. Reusar aquela função exigiria
desfazer o que ela faz.

## O formulário

Tela própria, pensada para celular (`/tasks/quick`), com atalho no dashboard.

| Campo              | Observação                                                               |
| ------------------ | ------------------------------------------------------------------------ |
| Tipo               | só templates `quickEntry`                                                |
| Cliente → Projeto  | seletores encadeados                                                     |
| Data               | padrão hoje                                                              |
| Tempo              | em **minutos** (uma story são ~40min; convertido para horas na gravação) |
| Link da publicação | opcional                                                                 |
| Descrição          | opcional                                                                 |

**Título gerado automaticamente** — "Story de loja · Cliente · 27/08" — editável. Um campo a menos
no caminho crítico: ninguém precisa inventar nome para o quinto story do dia.

### Salvar e repetir

Três botões: **Cancelar**, **Salvar**, **Salvar e repetir**.

"Salvar e repetir" grava e reabre o formulário mantendo **tipo, cliente, projeto, data, tempo e
descrição**; limpa **título e link**. É o caso real de cinco stories do mesmo cliente no mesmo dia,
com links diferentes.

A **data fica retida** junto com o resto — quem lança em sequência lançou no mesmo dia, e limpá-la
obrigaria a redigitar toda vez.

## Limites

- **Janela retroativa de 1 semana**, e nada no futuro. Sem limite, um lançamento antigo reescreveria
  relatório histórico já fechado.
- **Sensibilidade**: nunca `CONFIDENCIAL`. O conteúdo é material publicado.
- **Todas as equipes** têm acesso — não há restrição por time.

## Testes

- **Puro, com teste primeiro:** a derivação dos instantes a partir de (data, tempo). É a regra que
  decide o que as métricas dizem; erra em silêncio e contamina relatório.
- **Ação:** grava as seis linhas na transação; recusa data fora da janela; recusa template sem
  `quickEntry`; recusa template com mais de uma etapa.
- **Invariante do template (servidor):** marcar `quickEntry` num template de duas etapas é recusado;
  adicionar segunda etapa a um template `quickEntry` é recusado; excluir a última etapa de qualquer
  template é recusado.
- **Trava na tela:** cada um dos três estados da tabela acima renderiza o controle certo habilitado
  ou desabilitado, com o texto do motivo.
- **i18n:** mensagens novas em pt-BR e es-ES, como manda o guarda de paridade.

## Fora de escopo

- Lançar por terceiro (gestor registrando o trabalho de outra pessoa)
- Qualquer indicador que compare o que foi registrado com o que foi planejado
- **Editar** uma tarefa rápida depois de gravada. Errou o tempo ou o cliente? A saída hoje é a que já
  existe para qualquer demanda: um gestor marca como **obsoleta** (sai de pendentes e do % do
  projeto) e a pessoa lança de novo — são poucos campos. Vale medir a frequência disso antes de
  construir edição: se acontecer toda semana, o formulário é que está confuso, e a correção é lá.

## Problema em aberto — foto do artefato fora da rede

Registrado aqui para não se perder. **Não faz parte desta entrega.**

O artefato ideal para esse trabalho seria um print ou foto, não só o link — um story do Instagram
some em 24h, então a URL morre. Mas o upload no NAS é **LAN-only** por decisão de arquitetura, e a
topologia é assimétrica: a Vercel não alcança o agente; só o navegador (na LAN) e o **agente** (que
tem saída para a internet) atravessam a fronteira.

Logo, fora da rede, a única forma de o arquivo chegar ao NAS é **o agente ir buscá-lo**.

Três caminhos foram avaliados:

|                                          | Custo                                                                                                                                                                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fila no próprio celular até voltar à LAN | Zero infraestrutura, mas a evidência fica só no aparelho — e navegador de celular descarta armazenamento local sob pressão. Perda silenciosa.                                                                       |
| Abrir escrita pelo túnel                 | O túnel do §4 foi desenhado para **só GET**, com regra de firewall. Aceitar PUT abre caminho de escrita da internet para dentro do NAS — o oposto da decisão que criou o LAN-only.                                  |
| **Estacionar na nuvem, agente puxa**     | Durável na hora, de qualquer lugar; ninguém de fora escreve no NAS, porque quem busca é o agente. Reaproveita o ciclo `PENDING → READY` que já existe. Precisa de armazenamento intermediário e de mexer no agente. |

A direção provável é a terceira, **estendida a colaboradores externos em geral** — não só à tarefa
rápida. A ideia precisa amadurecer antes de virar spec: quem são esses colaboradores, que
sensibilidade o material pode ter, e se o material transitar por um terceiro é aceitável em cada
caso.
