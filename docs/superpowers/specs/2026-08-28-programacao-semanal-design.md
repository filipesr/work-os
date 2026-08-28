# Programação semanal — fatia 1: modelo, projeção e mesa do gestor

**Data:** 2026-08-28 · **Estado:** desenho aprovado em conversa, aguardando revisão da spec
**Fatia:** 1 de 3 (ver "Fora desta fatia")

## O problema

Hoje não há como planejar a semana de ninguém. `/planning/coverage` responde "que clientes têm
entrega vencendo" — eixo cliente × semana. Falta o eixo **pessoa × dia**: o que cada um vai fazer,
em que ordem, e onde ainda há espaço.

Sem isso, distribuir trabalho é memória de gestor, e o colaborador descobre o que fazer abrindo a
lista de etapas disponíveis e escolhendo por conta.

## O propósito, que define o que esta ferramenta NÃO é

A finalidade é **liberdade, não controle**: antecipar demanda para que a pessoa se organize, cumpra
o dia e **use o tempo que sobrar** — estudar, sair mais cedo. O ganho de eficiência é dela.

Isso não é conversa mole; decide o desenho. O sistema **nunca** compara planejado com realizado, e
não há indicador de aderência em tela nenhuma. Um percentual de cumprimento transformaria a
ferramenta no oposto do que ela existe para ser, e colidiria com P1 (informacional, nunca
motivacional) e P2 (variação é do sistema).

### Por que isto não fere o P7

A biblioteca lista "capacidade em horas como ferramenta de planejamento" como anti-feature, e o P7
proíbe "usar horas como verdade de planejamento". Uma grade de horários — "das 8 às 10 na tarefa A" —
seria exatamente isso.

O que esta spec faz é diferente: a unidade é uma **fila ordenada**, e a hora é **referência derivada
da classe** (o percentil observado daquela etapa), que é o P4 aplicado. Quem decide a execução é a
pessoa. Continua proibido o passo seguinte — virar cobrança.

## Decisões

### A unidade programada é a ETAPA

Uma demanda passa por várias mãos; quem executa executa etapas. Programar por demanda seria impreciso
já no segundo dia.

### O dia não é guardado — é calculado

Três campos em `TaskActiveStage`:

| Campo                   | Significado                                     | Quem escreve                        |
| ----------------------- | ----------------------------------------------- | ----------------------------------- |
| `plannedWeek DateTime?` | a segunda-feira da semana a que o item pertence | gestor                              |
| `plannedOrder Int?`     | posição na sequência **da semana**              | a pessoa (gestor define ao inserir) |
| `notBefore DateTime?`   | data mínima, para compromisso com hora marcada  | gestor, raramente                   |

Os dias são uma **projeção** da sequência contra a meta diária. Três comportamentos caem disso, sem
regra extra:

- **Não terminou hoje?** O item continua não concluído e continua à frente na fila — reaparece amanhã
  por consequência, não por rolagem.
- **Terminou tudo?** O próximo item sobe para hoje. Antecipação automática.
- **Foi eficiente a semana toda?** O trabalho se acumula no começo e **a folga sobra no fim**.

### Por que não uma tabela de agenda

Uma tabela guardaria o histórico do que foi planejado — e histórico de plano é o insumo exato do
indicador que esta spec proíbe. Sem esse histórico, o sistema **não consegue** calcular aderência nem
que alguém peça depois. A garantia deixa de depender de disciplina e passa a ser estrutural.

### Programar implica atribuir

Pôr uma etapa na semana de alguém define `assigneeId`, inclusive de etapa ainda `INACTIVE` (trabalho
que ainda não liberou, mas já tem dono). Etapa com dono não é puxável por terceiro; o gestor pode
remanejar, e ao remanejar o `plannedOrder` anterior é limpo — senão o item apareceria ordenado na
fila de quem não o tem mais.

### A duração de referência

Percentil 50 do tempo observado daquela etapa. Sem amostra suficiente, cai no `expectedDurationHours`
declarado no template — e a tela **marca** que aquele número é estimativa, não observação.

Percentil e não média: a biblioteca lista média como anti-feature de duração (P3, distribuição
enviesada). O relatório de tempo por etapa que existe hoje usa média; esta spec não propaga isso.

### A meta diária

`User.weeklyCapacityHours ÷ 5`. Pessoa sem capacidade preenchida não recebe projeção de dias — a
fila dela aparece sem divisão, com aviso de que falta cadastrar a capacidade. Inventar um padrão de
8h produziria um mapa de vagos que mente sobre quem trabalha meio período.

## A projeção — o coração desta fatia

Função pura, sem banco:

```
projetarSemana(itens, metaDiaria, dias, hoje) → { porDia, naoCabe }
```

Entrada: itens não concluídos ordenados por `plannedOrder`; `dias` = segunda a sexta da semana.

```
restante[d] = metaDiaria, para cada dia d
para cada item, na ordem:
    piso = max(hoje, item.notBefore ?? -∞, primeiro dia da semana)
    d = primeiro dia >= piso com restante[d] > 0
    se não existe tal dia → item vai para `naoCabe`
    porDia[d].push(item)
    restante[d] -= referencia(item)      // pode ficar negativo
```

Três decisões dentro do laço, e o porquê de cada uma:

- **Item nunca é fatiado entre dias.** Meia etapa não existe. Um item de 6h que encontra 2h livres
  fica ali e o dia passa a mostrar 10h/8h — honesto ("este dia estourou") em vez de uma divisão que
  ninguém consegue executar.
- **Dias já passados não recebem item.** O piso começa em `hoje`. É isto que faz a rolagem: o que não
  foi feito ontem não tem onde ficar a não ser hoje.
- **`naoCabe` é resultado, não erro.** Semana sobrecarregada aparece no momento de planejar, e não no
  dia do prazo. É informação para o gestor redistribuir, não bloqueio.

### Semanas passadas não engolem trabalho

Item não concluído cuja `plannedWeek` é anterior à semana corrente **é puxado para a semana atual**,
à frente da fila. Sem isso, trabalho planejado e não feito desapareceria da tela na virada da
semana — o pior tipo de perda, porque é silenciosa.

### Sábado

A semana projetada é segunda a sexta, porque a meta diária deriva de uma semana de cinco dias.
Trabalho nunca cai no sábado — é justamente isso que faz "terminar cedo" virar fim de semana maior.
Se algum dia for preciso programar sábado, muda a derivação da meta, não a projeção.

## A tela — mesa do gestor (`/planning/week`)

Linhas = pessoas (filtro por time), colunas = os dias da janela. Cada célula lista os itens do dia e
mostra a soma de referência contra a meta.

**O mapa de vagos é esta mesma tela.** Se a célula já mostra usado/meta, o espaço livre aparece
sozinho; uma segunda visão só para isso seria a mesma informação em dois lugares, divergindo na
primeira mudança.

À direita, o **poço**: etapas disponíveis e sem dono. Arrastar do poço para uma célula grava
`plannedWeek` + `plannedOrder` e atribui. Arrastar entre células reordena.

Soltar "na quarta" grava a **posição** que faz o item cair na quarta com a capacidade atual — quem usa
pensa em dia, o sistema guarda ordem. Se o que está à frente terminar antes, o item sobe.

**Janela de 1 ou 2 semanas**, na URL, no mesmo padrão do toggle que `/planning/coverage` já usa. As
funções de janela (`weekSlots`, `windowRange`, `mondayOfWeek`) são reaproveitadas; o conjunto de
opções é próprio, porque o de lá é de 8 e 12 semanas.

**Permissão:** MANAGER+ (a mesa é de coordenação). A tela da pessoa vem na fatia 2.

## Testes

- **Puro, com teste primeiro: a projeção.** É onde o erro é silencioso. Casos: rolagem (item de ontem
  cai hoje), antecipação (fila vazia puxa o próximo), `notBefore` respeitado, item que estoura o dia
  não é fatiado, `naoCabe` quando a semana lota, semana passada puxada para a atual, pessoa sem
  capacidade cadastrada.
- **Referência:** p50 quando há amostra; SLA quando não há; a marca de "estimativa" acompanha.
- **Ação:** programar atribui (inclusive etapa `INACTIVE`); remanejar limpa o `plannedOrder` do dono
  anterior; MEMBER é recusado — nesta fatia a mesa é só de MANAGER+, e a permissão da pessoa entra
  com a tela dela, na fatia 2.
- **i18n:** pt-BR e es-ES, com o guarda de paridade.

## Fora desta fatia

- **Fatia 2 — "Minha semana":** a tela da pessoa, com reordenar e puxar trabalho para si. É ela que
  cumpre a promessa da folga.
- **Fatia 3 — Carga por cliente:** mesma semana agrupada por cliente. Leitura pura.

## Fora do produto, por decisão

- Qualquer comparação entre planejado e realizado, ou indicador de aderência.
- Grade de horários ("das 8 às 10"). A unidade é ordem; a hora é referência.
- Duração de referência **por pessoa** — seria leitura de desempenho individual e colide com P2.
