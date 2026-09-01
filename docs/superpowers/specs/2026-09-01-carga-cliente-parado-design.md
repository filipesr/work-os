# O que está parado, na carga por cliente

**Data:** 2026-09-01 · **Estado:** desenho aprovado em conversa, aguardando revisão da spec
**Fecha:** a pendência 1 de [`docs/pendencias.md`](../../pendencias.md)
**Estende:** [a projeção da carga por cliente](2026-09-01-carga-cliente-projecao-design.md)

## O problema

`/planning/client-load` responde bem uma pergunta: **quanto deste cliente está distribuído nesta
semana**. As três portas de entrada da tela exigem, cada uma, um vínculo com a semana — dia marcado,
etapa reivindicada, ou conclusão dentro dela.

A demanda que ninguém pegou **nem** marcou não passa por nenhuma das três. Ela existe, tem prazo,
consome orçamento — e não aparece em lugar nenhum desta tela.

Saber que um cliente tem cinco demandas paradas, sem ninguém e sem data, é justamente o que a tela
deveria gritar. Hoje ela cala, e o silêncio é indistinguível de "está tudo distribuído".

## A decisão: inventário, ordenado por urgência

Duas leituras foram consideradas. **Alarme** — só o que está parado E pressiona — mostraria pouca
coisa por vez, cada item uma decisão da semana. Foi recusada porque esconde o acúmulo: cinco
demandas sem prazo nenhum não apareceriam, e são exatamente as que apodrecem em silêncio.

Vale o **inventário**: tudo do cliente que não está distribuído, com prazo ou sem. Com uma ressalva
que é o que o torna legível numa tela de gestão semanal — **a ordem é a urgência**: vencidas
primeiro, depois por prazo crescente, sem prazo por último.

Assim uma lista só responde as duas perguntas, e o alarme sobe ao topo sozinho em vez de virar uma
seção separada.

## O que conta como parado

Para cada demanda **não descartada** do cliente, olha-se a **próxima etapa** — a primeira não
concluída, na ordem do fluxo. A demanda está parada quando essa etapa **não tem dono e não tem
dia**.

Demanda **sem nenhuma etapa por concluir** não tem próxima etapa e portanto nunca está parada — é
o caso da entregue, e ela já aparece na grade pelo dia em que fechou. Etapas em paralelo resolvem
pela ordem do fluxo: olha-se uma só, a de menor `order` entre as não concluídas.

É a definição mais estreita que serve, e a estreiteza é o ponto: uma etapa FUTURA sem dono é normal
— ninguém pega a etapa 4 antes da 1, e sinalizar isso acenderia a coluna em toda demanda saudável
do sistema. O que não é normal é a PRÓXIMA estar sem ninguém e sem data.

### Parar depois de andar é o caso mais comum

Uma demanda que andou nesta semana e cuja próxima etapa ficou sem dono nem dia **aparece na
coluna**, mesmo já estando na grade.

"Foi feito na terça e desde então ninguém pegou a etapa seguinte" é exatamente como o trabalho trava
numa agência: a passagem de bastão que ninguém recebeu. A demanda aparece duas vezes na linha do
cliente — no dia em que andou, e na coluna do parado — e as duas são verdade sobre coisas
diferentes: uma diz o que aconteceu, a outra o que deixou de acontecer desde então.

## Os eixos

| Onde              | O que é                                                             |
| ----------------- | ------------------------------------------------------------------- |
| **Sétima coluna** | ao lado dos seis dias, na linha do próprio cliente                  |
| **Cabeçalho**     | `N demandas · Xh` — o tamanho do que está parado                    |
| **Cada linha**    | nome da demanda, prazo, e a marca `sem equipe` quando ela se aplica |

A coluna fica na linha do cliente, e não numa faixa abaixo da grade, porque a comparação que ela
serve é imediata: _"trabalhei doze horas para este cliente e tenho cinco demandas dele paradas"_.
Numa faixa separada, a carga da semana e o que não anda ficam a uma rolagem de distância um do
outro, e ninguém faz a conta.

## Cada linha diz por que está parado

Três causas, três ações diferentes:

| O que a linha mostra | O que revela                     | Quem age                  |
| -------------------- | -------------------------------- | ------------------------- |
| `sem equipe`         | etapa coringa que ninguém roteou | o gestor **roteia**       |
| prazo, sem marca     | tem equipe, ninguém pegou        | alguém da equipe **pega** |
| `sem prazo`          | nasceu sem data                  | alguém **decide** a data  |

Sem o motivo, a lista diz o que está parado e não o que fazer. E `sem equipe` é a única das três que
ninguém descobre olhando a lista — ela não tem sintoma visível.

A gramática é a que a tela já usa: `⚠` só nas vencidas, `·` no resto. Nenhum vocabulário novo.

## Há quanto tempo está parado

Cada linha traz também **desde quando ninguém toca na demanda**: `parado há 23 dias`.

É a informação que transforma a lista de um inventário numa ordem de gravidade real. Uma demanda sem
prazo parada há três dias é uma demanda nova; a mesma demanda parada há três meses é dinheiro que a
agência já gastou vendendo e nunca entregou. Sem o número, as duas são a mesma linha.

**A conta é o mais recente entre dois fatos:** o dia em que a etapa foi LIBERADA (`StageTransition`
com `status: ACTIVE`, o mesmo carimbo que a linha do tempo do projeto usa) e o dia do ÚLTIMO
apontamento na demanda. Os dois são necessários: sem o primeiro não há marco inicial para a demanda
que nunca andou; sem o segundo, uma demanda que alguém pegou, trabalhou e largou contaria desde a
liberação original e diria "parado há 40 dias" sobre um trabalho que aconteceu ontem.

Sem nenhum dos dois — dado antigo, sem transição registrada —, vale a **criação da demanda**. É o
piso honesto: ela existe desde então e não andou.

**Zero dia não vira texto.** Uma etapa liberada hoje aparece sem o carimbo: ela não está parada,
está começando, e "parado há 0 dias" seria a tela inventando um problema que não existe.

### O tempo desempata quem não tem prazo

A ordem continua sendo a urgência — vencidas, depois por prazo crescente, sem prazo por último. Mas
**entre as sem prazo, a mais parada vem primeiro**. São as que nunca vão subir por vencimento, e
sem esse critério a mais podre do cliente fica no fim da lista para sempre.

## As horas paradas ficam FORA do total da semana

O total do cliente responde "quanto desta semana este cliente ocupou". Trabalho parado não ocupou
nada, e somá-lo inflaria a carga com trabalho que ninguém fez — a mesma tela passaria a misturar
ocupação com intenção.

O número existe, mas no cabeçalho da própria coluna: `3 demandas · 18h`. É a informação de que o
cliente tem quase meia semana de trabalho sem ninguém, sem contaminar a leitura de ocupação.

As horas são a referência das etapas pendentes da demanda (`getStageReferences`), com a mesma marca
de estimativa que o resto da tela usa quando o número não é medição.

## A demanda sem equipe fura o filtro de equipe

A tela filtra por equipe. Uma demanda cuja próxima etapa não foi roteada **não pertence a equipe
nenhuma** — então, com o filtro ligado, ela sumiria de todas as visões. É a categoria mais travada
do sistema desaparecendo justamente da tela que existe para mostrá-la.

**Decisão:** ela aparece com o filtro ligado, em qualquer equipe. Dois gestores verem o mesmo item é
melhor que nenhum ver. A marca `sem equipe` explica por que ele está ali, e a ação — rotear — é a
mesma para quem quer que chegue primeiro.

As demais demandas paradas seguem o filtro normalmente, pela equipe efetiva da próxima etapa.

## O eixo é o cliente, nunca a pessoa

A coluna mostra trabalho que **não tem** dono — não há a quem atribuir, e é esse o ponto. Nenhuma
leitura desta entrega agrega por pessoa, e a lista nunca diz de quem "deveria" ter sido.

## Modelo de dados

**Nenhuma mudança.** Tudo já existe:

| Fonte                                                     | O que dá                            |
| --------------------------------------------------------- | ----------------------------------- |
| `TaskActiveStage` (`status`, `assigneeId`, `plannedDate`) | se a próxima etapa está sem ninguém |
| `TaskActiveStage.teamId` + `TemplateStage.defaultTeamId`  | a equipe efetiva, ou a falta dela   |
| `Task` (`dueDate`, `status`)                              | o prazo e o descarte                |
| `getStageReferences`                                      | as horas paradas                    |
| `StageTransition` (`status: ACTIVE`, `at`)                | quando a etapa foi liberada         |
| `TimeLog` (`logDate`)                                     | o último toque na demanda           |

## Testes

- **Puro, com teste primeiro — a classificação.** Dada a lista de etapas de uma demanda, dizer se
  ela está parada e por quê. Próxima etapa sem dono e sem dia → parada; com dono → não; com dia →
  não; etapa futura sem dono, com a próxima em ordem → não; demanda descartada → nunca.
- **A ordem:** vencida antes de com prazo, com prazo antes de sem prazo, entre as com prazo a mais
  próxima primeiro, e entre as SEM prazo a mais parada primeiro.
- **O tempo parado, puro:** conta do mais recente entre liberação e último apontamento; cai na
  criação quando não há nenhum dos dois; zero dia não vira texto.
- **A demanda que andou na semana E travou aparece nos dois lugares** — na célula do dia e na coluna.
- **As horas paradas não entram no total da semana** — teste explícito, porque é a regra que um
  refactor futuro mais provavelmente quebraria sem perceber.
- **O filtro de equipe:** demanda parada COM equipe respeita o filtro; demanda SEM equipe aparece
  em qualquer um.
- **Nenhuma leitura agrega por pessoa** — guarda de vocabulário, no molde do que já existe.
- **i18n:** pt-BR e es-ES, com o guarda de paridade.

## Fora desta entrega

- **Agir a partir da coluna** (rotear, atribuir ou marcar dia sem sair da tela). A carga por cliente
  é leitura pura, e quem escreve é a mesa — um segundo lugar que escrevesse seria um segundo lugar
  para as duas divergirem.
- **Levar o "parado" para a mesa semanal.** Lá o poço já mostra o que está sem dono; o que falta lá
  é outra pergunta.
