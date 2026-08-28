# Programação semanal — fatia 1: modelo, fila do dia e mesa do gestor

**Data:** 2026-08-28 · **Estado:** desenho aprovado em conversa, aguardando revisão da spec
**Fatia:** 1 de 3 (ver "Fora desta fatia")

## O problema

Hoje não há como planejar a semana de ninguém. `/planning/coverage` responde "que clientes têm
entrega vencendo" — eixo cliente × semana. Falta o eixo **pessoa × dia**: o que cada um vai fazer,
em que ordem, e onde ainda há espaço.

Sem isso, distribuir trabalho é memória de gestor, e o colaborador descobre o que fazer abrindo a
lista de etapas disponíveis e escolhendo por conta.

## O propósito, que define o que esta ferramenta NÃO é

A finalidade é **liberdade, não controle**: antecipar demanda para que a pessoa se organize, cumpra o
dia e **use o tempo que sobrar** — estudar, sair mais cedo. O ganho de eficiência é dela.

Isso decide o desenho — mas a linha não é "nenhuma comparação". É outra, e mais fina.

**Proibido: nota de aderência da PESSOA.** "Ana cumpriu 60% da agenda desta semana" é score de
pessoa contra plano. Transformaria a ferramenta no oposto do que ela existe para ser, e colide com
P1 (informacional, nunca motivacional) e P2 (variação é do sistema). Não existe em tela nenhuma, e a
spec o torna impossível de calcular (ver "por que não uma tabela de agenda").

**Permitido, e já existe: exceção da ETAPA contra a referência da classe.** "Esta etapa está em 5h
onde a classe leva 1h" é leitura sobre o TRABALHO, não nota da pessoa — é exatamente o que o P2
manda (atribuir ao processo/etapa) e o P6 (gestão por exceção). Sem isso, "liberdade criativa" vira
justificativa para uma coisa simples ganhar escopo de semana, e a referência de tempo perde a
serventia.

Esse sinal **já está implementado**: `stageAgingRatio` compara o tempo em etapa com o
`expectedDurationHours`, e `getAgingStages` lista o que passou do esperado. A programação semanal
**consome** esse sinal; não constrói outro. Duas implementações da mesma leitura divergiriam, e a
segunda quase certamente viraria a punitiva.

**A forma importa tanto quanto o dado.** O envelhecimento aparece no item, com a referência ao lado
("5h · referência 1h"), como convite a olhar — nunca agregado por pessoa, nunca em ranking, nunca
somado num placar. É sinal de que algo travou naquele trabalho, e a causa costuma ser do sistema:
dependência, retrabalho, briefing ruim.

### Por que isto não fere o P7

A biblioteca lista "capacidade em horas como ferramenta de planejamento" como anti-feature, e o P7
proíbe "usar horas como verdade de planejamento". Uma grade de horários para trabalho criativo —
"das 8 às 10 na tarefa A" — seria exatamente isso.

Aqui a unidade é uma **fila ordenada**, e a hora é **referência derivada da classe** (o percentil
observado daquela etapa), que é o P4 aplicado. Quem decide a execução é a pessoa.

A exceção são os itens com **janela fixa** — agendamento de pessoa, lugar ou equipamento. Esses têm
hora porque a realidade tem: a locação é às 14h. Não é estimativa apresentada como verdade; é
compromisso.

## Decisões

### A unidade programada é a ETAPA

Uma demanda passa por várias mãos; quem executa executa etapas. Programar por demanda seria impreciso
já no segundo dia.

### O modelo

Quatro campos em `TaskActiveStage`:

| Campo                      | Significado                         | Quem escreve |
| -------------------------- | ----------------------------------- | ------------ |
| `plannedDate DateTime?`    | o dia em que o item deve ser feito  | gestor       |
| `plannedOrder Int?`        | posição dentro daquele dia          | a pessoa     |
| `scheduledStart DateTime?` | início da janela fixa (agendamento) | gestor       |
| `scheduledEnd DateTime?`   | fim da janela fixa                  | gestor       |

Os dois primeiros são o caso comum; os dois últimos existem só para o item com compromisso marcado.

**Por que não uma tabela de agenda.** Uma tabela guardaria o histórico do que foi planejado — e
histórico de plano é o insumo exato do indicador que esta spec proíbe. Sem esse histórico, o sistema
**não consegue** calcular aderência nem que alguém peça depois. A garantia deixa de depender de
disciplina e passa a ser estrutural.

### Rolagem e antecipação são LEITURA, não algoritmo

A fila de hoje são os itens não concluídos com `plannedDate <= hoje`, na ordem da pessoa.

- **Não terminou ontem?** O item continua não concluído e continua com data no passado — aparece hoje
  por consequência. Nada roda, nada precisa ser mantido.
- **Terminou tudo?** A tela puxa os próximos por `(plannedDate, plannedOrder)`, trazendo o de amanhã
  para cima. Quem foi eficiente ganha o resto do dia.
- **Foi eficiente a semana toda?** O trabalho se concentra no começo e **a folga sobra no fim**.

O período de planejamento é a **semana**: sobra de um dia é pendência do dia seguinte, não falha.

### Item não é fatiado, mas pode ser interrompido

Se restam 2h no dia e o próximo item consome 5h, ele **é puxado assim mesmo** — começa hoje e
continua amanhã como pendência. Meia etapa não existe; dividir seria inventar uma execução que
ninguém consegue seguir.

Interrupção é outra coisa e é permitida: um item com janela fixa **pausa** o que estiver em execução
no horário dele, e o pausado retoma a posição depois.

### Capacidade: semanal é a referência, diária é só a visualização

A referência real é **semanal** — `User.weeklyCapacityHours`, padrão **45h**. É contra ela que o
gestor decide se a semana de alguém está cheia.

O dia mostra uma barra de **8h**, para visualização. Não é meta nem trava: serve para dar noção de
quanto o dia já pegou. Não existe escala cadastrada no workos, então o sistema não sabe quem trabalha
sábado nem quem faz meio período — **quem distribui é o gestor**, e sábado é coluna normal que recebe
se ele colocar.

Inventar uma escala que o sistema não tem produziria um mapa de vagos que mente. A barra de 8h é
assumidamente uma régua visual, e a spec diz isso na própria tela.

### A ordenação

Três casos, e só três:

1. **Item com janela fixa não entra na ordenação.** Ocupa a janela dele, tem prioridade sobre o
   concorrente, e o concorrente é pausado.
2. **Item liberado:** a ordem manual da pessoa é respeitada.
3. **Item não liberado (etapa `INACTIVE`/`BLOCKED`):** aparece na fila **marcado "não liberada"**, não
   consome capacidade e é **pulado** — a próxima que esteja liberada e sem agendamento assume o lugar.
   Ele não some: continua visível na posição que a pessoa escolheu, esperando liberar.

A **prioridade da demanda** ordena a sugestão no momento de inserir. Depois disso não sobrepõe a
escolha da pessoa — senão a ordem manual seria decorativa.

### Etapa agendada e não liberada é CONFLITO, não item pulável

Uma etapa com janela fixa que não está liberada **nunca é pulada**. O equipamento está reservado para
quinta, a etapa anterior não terminou, e o trabalho não vai acontecer.

Isso é sinalizado como **problema a resolver pelo gestor**, em destaque na semana — não some da tela e
não é reordenado em silêncio. Remendar sozinho aqui seria esconder justamente o que estraga um dia de
gravação: quem descobre no dia já perdeu a locação.

O sistema aponta; quem resolve é o gestor — desbloqueando a etapa anterior, remarcando, ou trocando
o responsável. Não bloqueamos nem decidimos por ele (P1: informa, não impõe).

### Programar implica atribuir

Pôr uma etapa no dia de alguém define `assigneeId`, inclusive de etapa ainda `INACTIVE` — trabalho que
ainda não liberou, mas já tem dono. Etapa com dono não é puxável por terceiro; o gestor pode
remanejar, e ao remanejar o `plannedOrder` anterior é limpo, senão o item apareceria ordenado na fila
de quem não o tem mais.

### A duração de referência

Percentil 50 do tempo observado daquela etapa. Sem amostra suficiente, cai no `expectedDurationHours`
declarado no template — e a tela **marca** que aquele número é estimativa, não observação.

Percentil e não média: a biblioteca lista média como anti-feature de duração (P3, distribuição
enviesada). O relatório de tempo por etapa que existe hoje usa média; esta spec não propaga isso.

## A tela — mesa do gestor (`/planning/week`)

Linhas = pessoas (filtro por time), colunas = segunda a sábado. Cada célula lista os itens do dia e a
soma de referência contra a régua visual de 8h. O cabeçalho de cada pessoa mostra o acumulado da
semana contra a referência dela.

**O mapa de vagos é esta mesma tela.** Se a célula já mostra o quanto o dia pegou, o espaço livre
aparece sozinho; uma segunda visão só para isso seria a mesma informação em dois lugares, divergindo
na primeira mudança.

**Conflitos em destaque no topo:** a lista de itens agendados que não estão liberados, com o que
falta em cada um. É a primeira coisa que o gestor vê ao abrir a semana.

À direita, o **poço**: etapas disponíveis e sem dono. Arrastar do poço para uma célula grava
`plannedDate` + `plannedOrder` e atribui. Arrastar entre células move de dia ou de pessoa.

**Janela de 1 ou 2 semanas**, na URL, no mesmo padrão de toggle que `/planning/coverage` usa. As
funções de janela (`weekSlots`, `windowRange`, `mondayOfWeek`) são reaproveitadas; o conjunto de
opções é próprio, porque o de lá é de 8 e 12 semanas.

**Permissão:** MANAGER+. A tela da pessoa vem na fatia 2.

## Testes

- **Puro, com teste primeiro — a montagem da fila do dia.** É onde o erro é silencioso: nenhuma tela
  quebra se a ordem sair errada. Casos: item de ontem não concluído aparece hoje; fila vazia puxa o
  próximo dia; item não liberado é pulado e a próxima liberada assume; item não liberado continua
  visível na posição; item agendado nunca é pulado; item agendado e não liberado vira conflito; item
  que não cabe no dia é puxado assim mesmo.
- **Referência:** p50 quando há amostra; SLA quando não há; a marca de "estimativa" acompanha.
- **Envelhecimento:** o item mostra o tempo decorrido ao lado da referência quando passa dela, vindo
  de `stageAgingRatio`; e nenhuma tela agrega esse número por pessoa.
- **Capacidade:** o acumulado da semana usa `weeklyCapacityHours`; sem o campo preenchido, cai em 45h
  e a tela avisa que é o padrão.
- **Ação:** programar atribui (inclusive etapa `INACTIVE`); remanejar limpa o `plannedOrder` do dono
  anterior; MEMBER é recusado — nesta fatia a mesa é só de MANAGER+.
- **i18n:** pt-BR e es-ES, com o guarda de paridade.

## Fora desta fatia

- **Fatia 2 — "Minha semana":** a tela da pessoa, com reordenar e puxar trabalho para si. É ela que
  cumpre a promessa da folga.
- **Fatia 3 — Carga por cliente:** mesma semana agrupada por cliente. Leitura pura.

## Fora do produto, por decisão

- **Nota de aderência da pessoa** (percentual de cumprimento do plano, agregado por pessoa, ranking).
  O envelhecimento POR ETAPA contra a referência da classe é permitido e já existe — a diferença é
  se a leitura é sobre o trabalho ou sobre quem o fez.
- Grade de horários para trabalho comum. Hora existe só onde há compromisso marcado.
- Duração de referência **por pessoa** — seria leitura de desempenho individual e colide com P2.
- Escala de trabalho cadastrada. Se um dia fizer falta, é cadastro novo e muda a régua diária.
