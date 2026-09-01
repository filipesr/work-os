# Linha do tempo do projeto — substitui o kanban

**Data:** 2026-09-01 · **Estado:** desenho aprovado em conversa, aguardando revisão da spec
**Substitui:** o quadro kanban de `/projects/[projectId]`

## O problema

O kanban responde **uma** pergunta: onde cada demanda está agora. Colunas são etapas, cartões são
demandas, e o tempo não existe em lugar nenhum da tela.

O que ele não conta, e ninguém mais conta:

- **Quanto tempo uma demanda ficou parada.** Um cartão que não se move é indistinguível de um que
  se moveu ontem.
- **Onde o esforço do projeto foi.** As horas apontadas existem, e nenhuma tela do projeto as
  mostra ao longo do tempo.
- **Quando cada coisa andou.** A ordem dos acontecimentos — que é a história do projeto — some.

## O que a tela passa a responder

**A história do projeto inteiro, numa tela:** o que já foi feito, o que está em curso e o que vem
pela frente, demanda por demanda, dia por dia.

## Os eixos

| Eixo               | O que é                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| **Y (vertical)**   | o tempo. **Futuro projetado em cima, hoje no meio, passado abaixo.**                             |
| **X (horizontal)** | as demandas do projeto. **Abertas primeiro**, ordenadas por atividade recente; concluídas atrás. |
| **Célula**         | o que aconteceu com aquela demanda naquele dia.                                                  |

O passado desce porque é assim que se lê um extrato: o mais recente primeiro. O futuro sobe pelo
mesmo motivo — quanto mais longe de hoje, mais longe da linha do meio.

A ordem do X põe primeiro o que ainda respira. Num projeto antigo, ordenar por criação encheria as
primeiras colunas de demandas fechadas há meses e empurraria para fora da tela o que importa hoje.

## A compressão dos vãos

Dia em que **nada aconteceu em nenhuma demanda visível** não vira linha: uma sequência deles vira
uma única faixa — _"12 dias sem movimento"_.

Isso não é economia de espaço, é a informação principal da tela. Um vão de doze dias no meio de um
projeto é exatamente o que hoje ninguém vê — e é o que explica por que a entrega atrasou.

Com a compressão, o eixo Y cobre o **projeto inteiro**, do primeiro dia até a última pendência
projetada. Sem ela, um projeto de um ano seriam trezentas e sessenta e cinco linhas, e a tela
morreria de própria mão.

**Movimento** é: hora apontada, etapa concluída, etapa liberada, demanda criada, demanda concluída.

## A gramática é a mesma da carga por cliente

Nada de vocabulário visual novo. A tela reusa o que já se aprendeu a ler em `/planning/client-load`:

| Marca | Significa                               |
| ----- | --------------------------------------- |
| ✓     | etapa concluída, com as horas apontadas |
| ▶     | em curso                                |
| ·     | ainda não liberada                      |
| ~     | o número é referência, não medição      |

**Passado:** as horas apontadas naquele dia e as etapas que fecharam ali.
**Hoje:** o que está em curso.
**Futuro:** o pendente projetado pela cadeia de etapas, com o vencimento como parede — a mesma
`projectDemandDays` que a carga por cliente já usa. Nada de uma segunda projeção: duas
implementações da mesma leitura divergiriam, e a segunda seria a errada.

### O futuro é estimativa, e a tela diz isso

A metade de cima é projeção, não promessa. Ela fica **visualmente separada** da linha de hoje, e as
horas dela carregam a marca de referência. Sem essa separação, a tela promete datas que ninguém
assumiu — e é assim que uma leitura de apoio vira cobrança.

## Os filtros — e um que precisa ser consertado na travessia

O kanban filtra por quatro coisas: **minhas demandas**, **por time**, **por responsável** e **por
prioridade**. As quatro continuam, porque tirar capacidade em silêncio é pior que a tela antiga.

Mas duas delas estão quebradas hoje, e portá-las como estão seria copiar o defeito: **"minhas
demandas" e "por responsável" filtram por `Task.assigneeId`** — o campo de responsável no nível da
DEMANDA, que **nenhum caminho do fluxo escreve**. A atribuição neste sistema é por etapa
(`TaskActiveStage.assigneeId`). É o mesmo defeito registrado na pendência 2 de `docs/pendencias.md`,
noutra tela.

Na tela nova, os dois filtram pelo responsável **da etapa**: aparece a demanda em que a pessoa tem
alguma etapa. É o que o filtro sempre quis dizer.

## O eixo é a demanda, nunca a pessoa

Uma linha do tempo por pessoa seria vigilância — "o que fulano fez em cada dia" — e cai direto no
que a [biblioteca](../../biblioteca-de-conhecimento.md) proíbe (P1, P2). Por demanda, é história do
trabalho: quem aparece na célula aparece como quem executou aquela etapa, do mesmo jeito que já
aparece na carga por cliente.

## O que sai do repositório

`KanbanBoard`, `TaskCard`, `KanbanFilters` e o teste do kanban — usados apenas entre si e pela
página do projeto. Substituir sem remover deixaria código morto que a próxima pessoa vai tentar
manter.

**Uma checagem antes de apagar:** o filtro `byTeam` do kanban é opcional (nasce desligado), não uma
regra de acesso. Confirmado: nenhuma permissão sai junto com o componente.

## Modelo de dados

**Nenhuma mudança.** Tudo já existe:

| Fonte                                                      | O que dá                           |
| ---------------------------------------------------------- | ---------------------------------- |
| `TimeLog` (`hoursSpent`, `logDate`)                        | as horas de cada dia               |
| `TaskActiveStage` (`completedAt`, `activatedAt`, `status`) | quando cada etapa fechou e liberou |
| `StageDependency`                                          | a cadeia, para a projeção          |
| `Task` (`createdAt`, `completedAt`, `dueDate`)             | o começo, o fim e a parede         |

## Testes

- **Puro, com teste primeiro — a compressão.** Dias sem movimento viram faixa; dias com movimento
  viram linha; a faixa diz quantos dias engoliu. Erra em silêncio: a tela não quebra se um dia com
  trabalho for engolido, só some da história.
- **A ordem do X:** abertas antes das concluídas, e entre as abertas a mais recentemente
  movimentada primeiro.
- **O futuro reusa `projectDemandDays`** — teste que prove que a tela não tem projeção própria.
- **Os filtros consertados:** "minhas demandas" traz a demanda em que a pessoa tem uma ETAPA, não a
  que tem `Task.assigneeId` (que é sempre nulo).
- **Nenhuma leitura agrega por pessoa** — guarda de vocabulário, no molde do que já existe.
- **i18n:** pt-BR e es-ES, com o guarda de paridade.

## Fora desta entrega

- **O acumulado do projeto como leitura de orçamento.** As horas somadas do projeto impactam
  investimento, e extrair isso é do interesse da gestão — mas é leitura própria, com decisões
  próprias (custo por hora? por time? quem vê?). Fica registrado como direção, com uma trava desde
  já: é acumulado **do projeto**, nunca da pessoa.
- **Arrastar** para mover demanda entre etapas, que o kanban também não tinha.
- **Janela de tempo configurável.** A compressão torna o projeto inteiro legível; se algum dia um
  projeto ficar pesado, a janela vira parâmetro.
- **Levar a linha do tempo para o cliente** (todas as demandas de um cliente, não de um projeto).
