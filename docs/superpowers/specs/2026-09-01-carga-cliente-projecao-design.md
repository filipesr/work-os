# Carga por cliente — projeção da demanda pela cadeia de etapas

**Data:** 2026-09-01 · **Estado:** desenho aprovado em conversa, aguardando revisão da spec
**Substitui:** o agrupamento por dia de `/planning/client-load` descrito na
[spec das fatias 2 e 3](2026-08-28-minha-semana-e-carga-cliente-design.md)

## O problema

A tela hoje mostra onde há **data marcada**, e só isso. Duas perguntas ficam sem resposta:

- **O que já foi feito, e quando.** As horas apontadas não aparecem em lugar nenhum dela.
- **Quando o resto vai acontecer.** Etapa sem dia é ancorada no primeiro dia em que a demanda
  aparece — uma âncora que não descreve o fluxo: a segunda etapa não acontece junto da primeira,
  acontece depois dela.

O efeito é uma leitura que parece completa e não é: o gestor vê um recorte com data e conclui que
aquilo é a semana do cliente.

## O que a tela passa a responder

**Onde o trabalho deste cliente aconteceu, e onde vai acontecer.** Passado medido, futuro
projetado, na mesma linha do tempo.

## As três grandezas, e por que fecham

| Grandeza       | De onde vem                                         |
| -------------- | --------------------------------------------------- |
| **Referência** | p50 das horas apontadas daquela etapa (já existe)   |
| **Realizado**  | `TimeLog` daquela etapa, somado por dia (`logDate`) |
| **Pendente**   | `max(0, referência − realizado)`                    |

As três são **hora de trabalho**, e isso não é coincidência: a referência passou a sair do
`TimeLog` numa correção anterior, justamente porque o intervalo do log de etapa media tempo de
relógio. Fossem unidades diferentes, "referência − realizado" seria uma subtração sem sentido.

O apontamento nasce ao **parar o cronômetro** (`stopWorkOnTask` → `closeActivityLog` grava
`TimeLog` com `hoursSpent` e `logDate`). Concluir etapa não aponta hora.

### Etapa concluída sem apontamento nenhum

**Conta zero.** O realizado é o que foi apontado, e ponto.

Esta spec nasceu dizendo o contrário — que a etapa fechada sem cronômetro contaria a referência,
marcada como estimativa — porque o apontamento era voluntário e a tela ficaria vazia. A decisão
mudou junto com a causa: o apontamento passou a ser
[obrigatório para concluir](2026-09-01-apontamento-obrigatorio-design.md), então a etapa fechada
sem hora deixa de existir daqui para frente.

Fica o passado: etapas concluídas antes daquela regra aparecem com 0h de realizado. É a verdade
sobre o que foi medido, e preenchê-las com a referência seria fabricar histórico — a mesma coisa
que este projeto recusou ao não fazer backfill de `plannedDate`.

## Onde cada etapa aparece

Três casos, e só três:

1. **Passado** — dia com apontamento mostra o realizado daquele dia. Etapa concluída aparece
   também no dia em que fechou.
2. **Agora** — o pendente da etapa em curso fica em **hoje**, e anda sozinho para o dia seguinte
   enquanto ela não fechar. A etapa de 4h com 2h feitas ontem aparece como "2h ontem" e "2h
   pendentes hoje"; amanhã, se ninguém tocar nela, as 2h estão em amanhã.
3. **Futuro** — a etapa que ainda não começou é projetada pela **cadeia de dependências**.

**A demanda não repete vazia.** Ela aparece num dia porque houve trabalho registrado ali, porque
uma etapa fechou ali, ou porque a projeção põe trabalho ali. Nunca por inércia.

## A projeção

Regras, em ordem de precedência:

1. **Data humana manda.** Etapa com `plannedDate` ou `scheduledStart` fica onde o gestor pôs, e a
   cascata das seguintes parte dali. A projeção só decide onde ninguém decidiu — inventar por cima
   de uma decisão tomada seria a tela discordando de quem a usa.
2. **Cascata pela dependência.** A etapa cai no dia em que a anterior termina; se a anterior não
   termina naquele dia, no seguinte. Etapas **paralelas** — duas que dependem da mesma anterior —
   caem no mesmo dia, porque é isso que paralelo quer dizer.
3. **Etapa sem referência (0h) não empurra ninguém:** entra no mesmo dia da anterior. Sem duração
   conhecida, afirmar que ela consome um dia seria inventar.
4. **O vencimento é a parede.** Tudo que a cascata jogaria para depois dele empilha na **véspera**
   do vencimento: o prazo é a data de ENTREGA, então o trabalho precisa estar pronto no dia
   anterior. Uma demanda que vence quarta tem todas as etapas restantes na terça.
5. **Demanda vencida empilha em hoje.** Não há para onde adiar: o pendente inteiro é de agora, e
   hoje é o último dia que existe.
6. **Demanda sem prazo flui livre** pela cadeia, sem parede. O que a projeção jogar para depois de
   sábado não aparece nesta semana — empilhar no sábado o trabalho que não é dele mentiria sobre a
   carga do dia, e a semana seguinte é onde aquilo vai ser lido.

**A projeção não fatia etapa entre dias.** Uma etapa de 12h aparece inteira no dia projetado, mesmo
estourando a régua. Quem fatia é a realidade: o realizado se divide sozinho pelos apontamentos de
cada dia, que é exatamente o caso "1h num dia, 1h no outro" até fechar.

**A projeção não simula capacidade.** Ela não pergunta se a pessoa tem 8h livres naquele dia — isso
seria a grade de horários que o P7 proíbe, e exigiria decidir por alguém que ainda nem é o dono da
etapa.

## O vencimento em destaque

O cabeçalho do bloco mostra a data de vencimento da demanda, destacada quando ela está **dentro da
semana em tela** — é a informação que explica por que as etapas empilharam. Demanda **vencida**
recebe destaque de alerta.

Sem isso, o empilhamento parece defeito da tela: quatro etapas na terça, sem dizer que a entrega é
quarta, é um amontoado sem causa visível.

## A célula

Mantém a forma atual — um bloco por demanda, cabeçalho com projeto · demanda e feito/por fazer do
dia, e abaixo as etapas na ordem do fluxo com responsável e horas. O que muda é **quais** etapas
aparecem em cada dia, e que os números do passado passam a ser medidos.

Cada linha de etapa continua dizendo de quem é o trabalho: responsável → equipe efetiva →
"não atribuído".

## Modelo de dados

**Nenhuma mudança.** Tudo já existe: `TimeLog` (horas e data), `StageDependency` (a cadeia),
`Task.dueDate` (a parede), `TaskActiveStage.plannedDate`/`scheduledStart` (a decisão humana).

## Testes

- **Puro, com teste primeiro — a projeção.** É a regra que decide o que a tela afirma sobre o
  futuro, e erra em silêncio: nenhuma tela quebra se uma etapa cair no dia errado. Casos: data
  humana vence a projeção; cascata joga a seguinte para o dia posterior quando a anterior não
  fecha; paralelas no mesmo dia; etapa de 0h não empurra; empilhamento na véspera do vencimento;
  demanda vencida empilha em hoje; demanda sem prazo passa de sábado e some da semana.
- **Realizado por dia:** o apontamento de ontem aparece em ontem, e o pendente em hoje; a soma
  realizado + pendente de uma etapa nunca passa da referência dela.
- **Etapa concluída sem apontamento** conta referência e vem marcada como estimativa.
- **A demanda não aparece em dia sem nada** — nem por inércia da âncora antiga.
- **i18n:** pt-BR e es-ES, com o guarda de paridade.

## Fora desta entrega

- Simular capacidade da pessoa na projeção (grade de horários — proibido pelo P7).
- Levar a projeção para a mesa do gestor e para a minha semana. Lá a pergunta é "o que fazer
  agora", e a projeção responde "quando vai acontecer": misturar as duas encheria a fila de
  trabalho que ainda não é de hoje.
- Cobrar apontamento de hora ao concluir etapa. Se a lacuna de `TimeLog` incomodar em uso, é
  decisão própria — e mudar isso muda o custo de fechar uma etapa para todo mundo.
- Demanda **sem dono e sem dia** continua fora desta tela (pendência 4 de `docs/pendencias.md`).
