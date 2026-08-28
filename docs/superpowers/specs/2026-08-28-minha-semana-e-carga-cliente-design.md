# Programação semanal — fatias 2 e 3: minha semana e carga por cliente

**Data:** 2026-08-28 · **Estado:** desenho aprovado em conversa, aguardando revisão da spec
**Fatias:** 2 e 3 de 3 · **Fatia 1 (entregue):**
[mesa do gestor](2026-08-28-programacao-semanal-design.md)

## O problema

A fatia 1 deu ao gestor a mesa: ele distribui as etapas da semana entre as pessoas e vê onde há
espaço. Falta o outro lado — **a pessoa não tem onde ver a própria semana**, e é ela quem cumpre a
promessa que a ferramenta existe para fazer.

Sem isso, o colaborador continua descobrindo o que fazer abrindo `/tasks` e escolhendo por conta,
que é exatamente o estado anterior à feature. O gestor propõe e ninguém reorganiza.

E falta o eixo cliente: a mesa responde "a semana da Ana está cheia?", não "este cliente está
comendo a semana da agência?".

## O propósito, e o que ele proíbe

Vale inteira a seção correspondente da fatia 1: a finalidade é **liberdade, não controle**. Antecipar
demanda para que a pessoa se organize, cumpra o dia e **use o tempo que sobrar** — estudar, sair mais
cedo. O ganho de eficiência é dela.

Continua proibido: nota de aderência da pessoa, ranking, percentual de cumprimento agregado.
Continua permitido e desejado: o envelhecimento **por etapa** contra a referência da classe, que já
existe e que a mesa da fatia 1 exibe.

Há **uma exceção deliberada** nesta fatia — a mensagem de reconhecimento —, com o motivo e as travas
escritos abaixo. Ela é exceção justamente porque a regra continua valendo em todo o resto.

## Fatia 2 — "Minha semana" (`/planning/my-week`)

### É tela nova, não uma aba de "Meu trabalho"

`/tasks` é lista com filtros de escopo, status e intervalo — a ferramenta de quem procura alguma
coisa. A semana é outra pergunta ("o que eu faço agora, e como está meu dia") e outra forma. Misturar
as duas obrigaria a rearranjar uma tela que funciona para caber uma lógica que não é a dela.

O custo aceito: a pessoa passa a ter dois lugares. Ele é pago com o item de menu, que fica **ao lado
de "Meu trabalho"** e não escondido dentro de "Planejamento" — que hoje é um grupo de gestor.

### A leitura nunca aceita um `userId`

`getMyWeek(mondayISO)` escopa na sessão e **não recebe a pessoa por parâmetro**. É a diferença entre
uma tela pessoal e uma tela de vigilância: com um `userId` na assinatura, qualquer um que descubra a
URL lê a semana de qualquer outro, e a proteção passa a depender de nunca ninguém errar a checagem.
Sem ele, o erro é impossível de cometer.

A tela mostra o que o gestor já vê da semana dela, com a mesma matemática da fatia 1 — `buildDayQueue`
para a fila do dia, a referência de duração com a marca de estimativa, o envelhecimento por etapa, a
régua de 8h declarada como visual, o acumulado da semana contra a capacidade dela, e os conflitos
dela em destaque. Nenhum cálculo novo: duas implementações da mesma leitura divergiriam, e a segunda
seria a errada.

### O poço dela não é o poço do gestor

São as etapas liberadas, sem dono, **cujo time efetivo é um dos times dela** — `stageTeamWhere` com
os times da pessoa, a mesma regra de roteamento que o resto do app aplica a qualquer atribuição
(etapa coringa incluída: `teamId ?? stage.defaultTeamId`).

O poço do gestor é amplo de propósito, porque ele distribui. Oferecer a mesma amplitude à pessoa
seria oferecer trabalho que ela não pode assumir.

### As três escritas

Módulo próprio, `lib/actions/my-week.ts`. O precedente é `lib/actions/profile.ts`, que existe separado
de `lib/actions/user.ts` porque ali a autorização é **"ser você mesmo"**, e misturar as duas é como
uma acaba herdando a permissão da outra. As ações da mesa (`lib/actions/week-planning.ts`) são todas
`requireManagerOrAdmin`; estas não são, e por isso não moram lá.

| Ação                                       | O que faz                            | Recusa                                                                                             |
| ------------------------------------------ | ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `reorderMyDay(activeStageId, direction)`   | sobe ou desce um item do próprio dia | etapa que não é sua; etapa com hora marcada (compromisso não entra na ordenação)                   |
| `pullStageToMe(activeStageId, dateISO)`    | assume uma etapa do poço             | etapa com dono; etapa não liberada; etapa de time que não é seu; data fora da janela ou no passado |
| `moveMyStageToDay(activeStageId, dateISO)` | muda de dia uma etapa sua            | etapa que não é sua; etapa com hora marcada; data no passado ou fora da janela visível             |

`pullStageToMe` grava responsável, dia e a **última** posição daquele dia: quem chega depois não fura
a ordem que a pessoa já montou. Vale aqui a mesma invariante da fatia 1 — `plannedDate` e
`assigneeId` andam sempre juntos, senão o item some do poço e da grade ao mesmo tempo.

A ordenação reusa a lógica de `moveStageOrder`, extraída para função compartilhada. Copiar as regras
de troca e de renumeração para um segundo lugar garantiria que um dia elas divergissem, e a divergência
apareceria como "a seta funciona na tela do gestor e não na minha".

**Devolver ao poço fica de fora**, por decisão: trabalho não circula sem dono. Quem não vai dar conta
fala com o gestor, que remaneja pela mesa — e o remanejamento já limpa a programação do dono anterior.

### O fim do dia, e a mensagem

Acabar os itens do dia **já puxa o próximo da sequência**: isso é leitura, não ação, e é o que a
fatia 1 construiu. A tela mostra o item seguinte como convite — quem quiser adiantar, adianta; quem
não quiser, fechou o dia.

Junto vem a mensagem de reconhecimento: **"parabéns, seu rendimento está acima da média"**.

**Esta é a exceção, e ela é decisão explícita do gestor** — motivar a fechar a semana, sem o peso da
crítica. Registro aqui o que ela custa e o que a segura, porque uma exceção sem trava vira a regra
seguinte.

O que a torna aceitável são quatro escolhas, e as quatro são obrigatórias:

1. **A comparação é com o próprio histórico da pessoa**, nunca com colegas. Etapas que ela concluiu
   nesta semana contra as mesmas contagens das **oito semanas anteriores dela**. Ninguém é medido
   contra ninguém, então a frase não pode virar ranking nem pauta de reunião. "Concluiu" é
   `TaskActiveStage` com `assigneeId` dela, `status: COMPLETED` e `completedAt` dentro da semana —
   contagem de etapas, não de horas: hora não é fungível (P7), e somar horas para elogiar seria
   premiar quem apontou mais tempo.
2. **Mediana, não média aritmética.** Contagem semanal é distribuição enviesada — uma semana de
   férias ou de gravação puxa a média e faria o elogio sumir por meses (P3). O texto na tela fala a
   língua de quem usa ("acima da média"); a conta é `percentile(contagens, 0.5)`, a mesma função que
   a referência de duração usa.
3. **Só existe no lado positivo.** Não há versão inversa, nem tom neutro de "abaixo do seu ritmo".
   Quem está numa semana difícil simplesmente não vê mensagem nenhuma — não vê cobrança.
4. **O número não é persistido.** Não vira coluna, não entra em relatório, não agrega por time, não
   aparece na tela de ninguém além da própria pessoa. É texto efêmero calculado na renderização e
   descartado. Sem persistência, não há histórico para alguém transformar em indicador depois — a
   mesma garantia estrutural que a fatia 1 usou ao recusar a tabela de agenda.

Sem amostra (menos de quatro semanas anteriores com trabalho concluído), a mensagem não aparece: um
elogio calculado sobre duas semanas é ruído com cara de mérito.

**Vai registrada na biblioteca de conhecimento** como exceção deliberada aos princípios P1 e P2, com
o motivo e as quatro travas. Uma exceção não documentada é indistinguível de um descuido, e a próxima
pessoa a ler o código a copiaria sem as travas.

**Rejeitado:** comparar com a média da equipe. Se alguém está acima da média, alguém está abaixo, e a
tela sabe quem — é o placar que a biblioteca proíbe.

## Fatia 3 — Carga por cliente (`/planning/client-load`)

Tela separada, MANAGER+, **leitura pura**. Nenhuma escrita: quem redistribui é a mesa, e um segundo
lugar que também escreve seria um segundo lugar para as duas divergirem.

Linhas = cliente. Colunas = os seis dias da semana. Cada célula traz as horas de referência somadas e
quantas etapas; à direita, o total do cliente na semana. Mesma janela de semana da mesa, no mesmo
padrão de URL (`?week=`), e o mesmo filtro de time.

Responde duas perguntas que a mesa não responde: **onde este cliente está pegando a semana** (para
avisá-lo antes, não depois) e **que cliente está comendo a capacidade da agência** — que é conversa
de contrato, não de pessoa.

Reusa a mesma matemática da fatia 1 e só troca o eixo do agrupamento — as horas de cada célula vêm
do mesmo `buildDayQueue`, senão os dois números da mesma semana discordariam entre as duas telas.
Todo item tem cliente: `Task.projectId` e `Project.clientId` são obrigatórios no modelo, então não
existe grupo "sem cliente" para inventar.

## Modelo de dados

**Nenhuma mudança.** As duas fatias leem os campos que a fatia 1 criou e escrevem os mesmos que a
mesa escreve. Nenhuma migration.

## Permissões

| Rota                    | Quem                                                              |
| ----------------------- | ----------------------------------------------------------------- |
| `/planning/my-week`     | qualquer pessoa autenticada — mostra a semana **dela**            |
| `/planning/client-load` | MANAGER+, com o mesmo `try/catch` + `redirect` das telas vizinhas |

As três ações de `my-week.ts` validam "ser você mesmo" no servidor, sempre. A tela recusar o botão é
conveniência; a que vale é a checagem da ação — qualquer requisição fora da tela quebraria a
invariante sem ela.

## Testes

- **Puro, com teste primeiro — a conta do ritmo próprio.** Mediana das contagens anteriores, o corte
  de amostra insuficiente, e a assimetria: acima devolve a mensagem, igual ou abaixo devolve nada.
  Erra em silêncio e é a parte que carrega a exceção.
- **Ações:** cada uma das três recusa o que não é seu; `pullStageToMe` recusa etapa com dono, não
  liberada e de outro time; grava dia e responsável **juntos**; entra no fim da fila do dia.
- **Ordenação compartilhada:** a mesma função serve a mesa e a tela da pessoa; item com hora marcada
  continua fora da ordenação nas duas.
- **Escopo da leitura:** `getMyWeek` não expõe assinatura que aceite outra pessoa (teste de tipo é
  suficiente); a tela de um MEMBER traz só as etapas dele.
- **Carga por cliente:** a soma da semana de um cliente bate com a soma das células dele; item sem
  cliente aparece em grupo próprio; MEMBER é recusado.
- **i18n:** pt-BR e es-ES, com o guarda de paridade.

## Fora de escopo

- **Devolver etapa ao poço** pela tela da pessoa (decisão registrada acima).
- **Arrastar.** As duas telas usam botões e diálogo, como a mesa da fatia 1.
- **Editar a janela fixa** (`scheduledStart`/`scheduledEnd`) por interface — segue esperando a tela
  de agendamento, como na fatia 1.
- **Ver a semana de outra pessoa** pela tela do colaborador. Quem precisa disso é o gestor, e ele já
  tem a mesa.
- **Qualquer indicador derivado da mensagem de reconhecimento.** Ela é efêmera por decisão; torná-la
  histórico é criar o insumo que a fatia 1 recusou de propósito.
